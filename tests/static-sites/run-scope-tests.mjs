import { strict as assert } from 'node:assert';
import { test, after } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const { build } = await import(process.env.ESBUILD_MODULE_PATH || 'esbuild');
const dir=await mkdtemp(path.join(tmpdir(),'dokploy-static-scope-'));
after(()=>rm(dir,{recursive:true,force:true}));
const fixture=`
export class TRPCError extends Error { constructor(o){super(o.message || o.code);this.code=o.code} }
export let state;
export function reset(){state={account:{staticSiteOnly:true,staticSiteOrganizationId:'org'}, member:{role:'member',staticSiteOnly:true,accessedProjects:['project'],accessedEnvironments:['env'],accessedServices:['app']},apps:{app:{staticSiteOnly:true,environmentId:'env',environment:{projectId:'project',project:{organizationId:'org'}}}},domains:{},deployments:{dep:{applicationId:'app'}}};}
export const eq=(column,value)=>({column,value});
export const domains={host:'host'},user={id:'id'};
export const db={query:{user:{findFirst:async()=>state.account},domains:{findFirst:async({where})=>Object.values(state.domains).find(d=>d.host===where.value)},deployments:{findFirst:async({where})=>state.deployments[where({deploymentId:'id'},{eq}).value]}}};
export async function findMemberByUserId(){ if(!state.member)throw new TRPCError({code:'UNAUTHORIZED'});return state.member; }
export async function findApplicationById(id){if(!state.apps[id])throw new TRPCError({code:'NOT_FOUND'});return state.apps[id]}
export async function findEnvironmentById(id){return {environmentId:id,projectId:'project',project:{organizationId:'org'}}}
export async function findDomainById(id){if(!state.domains[id])throw new TRPCError({code:'NOT_FOUND'});return state.domains[id]}
export async function getDokployUrl(){return 'https://dokploy.example.com'}
`;
await build({stdin:{contents:`export {enforceStaticSiteRequest} from './packages/server/src/services/static-site.ts'; export {state,reset} from 'scope-fixture';`,resolveDir:process.cwd()},platform:'node',format:'esm',bundle:true,outfile:path.join(dir,'fixture.mjs'),plugins:[{name:'scope-fixture',setup(b){b.onResolve({filter:/.*/},args=>{
 if(args.path==='scope-fixture'||args.path==='@dokploy/server/db'||args.path==='@dokploy/server/db/schema'||args.path==='@trpc/server'||args.path==='drizzle-orm'||(args.importer.endsWith('/services/static-site.ts')&&['./application','./admin','./domain','./environment','./permission'].includes(args.path)))return {path:'fixture',namespace:'fixture'};
});b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:fixture,loader:'js'}));}}]});
const m=await import(pathToFileURL(path.join(dir,'fixture.mjs')));
const ctx={user:{id:'user'},session:{activeOrganizationId:'org'}};
const check=(endpoint,type,input)=>m.enforceStaticSiteRequest(ctx,endpoint,type,input);
const domain={applicationId:'app',domainType:'application',host:'www.example.com',port:8080,https:true,certificateType:'letsencrypt'};
test('assigned member creates static sites only in selected environment',async()=>{m.reset();await assert.doesNotReject(()=>check('application.create','mutation',{environmentId:'env'}));await assert.rejects(()=>check('application.create','mutation',{environmentId:'other'}));await assert.rejects(()=>check('application.create','mutation',{environmentId:'env',serverId:'remote'}));});
test('scope cannot be escaped by changing organization or role',async()=>{m.reset();m.state.account.staticSiteOrganizationId='other';await assert.rejects(()=>check('application.create','mutation',{environmentId:'env'}));m.reset();m.state.member.role='owner';await assert.rejects(()=>check('application.create','mutation',{environmentId:'env'}));m.reset();m.state.member=null;await assert.rejects(()=>check('application.create','mutation',{environmentId:'env'}));});
test('another application, environment or nonstatic service is denied',async()=>{m.reset();await assert.rejects(()=>check('application.start','mutation',{applicationId:'other'}));m.state.apps.app.staticSiteOnly=false;await assert.rejects(()=>check('application.start','mutation',{applicationId:'app'}));m.reset();m.state.apps.app.environmentId='other';await assert.rejects(()=>check('application.start','mutation',{applicationId:'app'}));});
test('ZIP FormData is scoped to assigned application',async()=>{m.reset();const raw=new FormData();raw.set('applicationId','app');raw.set('zip',new Blob(['zip']));await assert.doesNotReject(()=>check('application.dropDeployment','mutation',raw));raw.set('applicationId','other');await assert.rejects(()=>check('application.dropDeployment','mutation',raw));});
test('unrestricted users bypass the new policy',async()=>{m.reset();m.state.account.staticSiteOnly=false;assert.equal(await check('compose.create','mutation',{}),false);});
test('domain binding forces static port, HTTPS and application scope',async()=>{m.reset();await assert.doesNotReject(()=>check('domain.create','mutation',domain));for(const patch of [{port:3000},{port:undefined},{https:false},{certificateType:'custom'},{composeId:'compose'},{previewDeploymentId:'preview'},{domainType:'compose'},{customEntrypoint:'admin'},{middlewares:['evil']},{forwardAuthEnabled:true},{path:'/admin'},{host:'dokploy.example.com'},{host:'*.example.com'},{host:'127.0.0.1'}])await assert.rejects(()=>check('domain.create','mutation',{...domain,...patch}),JSON.stringify(patch));});
test('existing domains and update/delete cannot target other applications',async()=>{m.reset();m.state.domains.taken={host:'www.example.com',applicationId:'other'};await assert.rejects(()=>check('domain.create','mutation',domain));await assert.rejects(()=>check('domain.delete','mutation',{domainId:'taken'}));m.reset();m.state.domains.own={host:'www.example.com',applicationId:'app'};await assert.doesNotReject(()=>check('domain.delete','mutation',{domainId:'own'}));});
test('deployment logs are resolved back to an assigned static application',async()=>{m.reset();await assert.doesNotReject(()=>check('deployment.readLogs','query',{deploymentId:'dep'}));m.state.deployments.dep={applicationId:'other'};await assert.rejects(()=>check('deployment.readLogs','query',{deploymentId:'dep'}));m.state.deployments.dep={composeId:'compose'};await assert.rejects(()=>check('deployment.readLogs','query',{deploymentId:'dep'}));});
test('project and environment detail queries remain scoped',async()=>{m.reset();await assert.rejects(()=>check('project.one','query',{projectId:'other'}));await assert.rejects(()=>check('environment.one','query',{environmentId:'other'}));});

test('GitHub endpoints remain scoped to assigned static applications',async()=>{m.reset();for(const [route,kind] of [['application.githubDeployment','mutation'],['application.staticGithubConnections','query']]) {await assert.doesNotReject(()=>check(route,kind,{applicationId:'app'}));await assert.rejects(()=>check(route,kind,{applicationId:'other'}));}m.state.apps.app.staticSiteOnly=false;await assert.rejects(()=>check('application.githubDeployment','mutation',{applicationId:'app'}));});
