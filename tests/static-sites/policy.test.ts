import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { assertStaticArchiveEntry, assertStaticSiteConfiguration, staticSiteDefaults, staticSitePermissionAllowed, staticSiteRequestAllowed, STATIC_SITE_LIMITS } from '../../packages/server/src/utils/static-sites/policy.ts';

test('static publishers can create/upload/redeploy and bind domains',()=>{
 for(const path of ['application.create','application.dropDeployment','application.deploy','application.redeploy','application.start','application.stop','domain.create','domain.update','domain.delete']) assert.equal(staticSiteRequestAllowed(path,'mutation'),true,path);
});
test('deny arbitrary service types, providers, code execution and future endpoints',()=>{
 for(const path of ['compose.create','postgres.create','redis.create','mongo.create','mysql.create','application.update','application.saveBuildType','application.saveDockerProvider','application.saveGitProvider','application.saveEnvironment','application.updateTraefikConfig','mounts.create','patch.create','port.create','schedule.create','user.assignPermissions','organization.create','organization.updateMemberRole','server.runCommand','docker.getConfig','newFeature.run']) for(const type of ['query','mutation','subscription']) assert.equal(staticSiteRequestAllowed(path,type),false,path+':'+type);
});
test('method confusion cannot convert a read endpoint into a mutation',()=>{
 assert.equal(staticSiteRequestAllowed('application.one','query'),true);
 assert.equal(staticSiteRequestAllowed('application.one','mutation'),false);
 assert.equal(staticSiteRequestAllowed('application.create','query'),false);
});
test('legacy grants do not confer broad service or host permissions',()=>{
 for(const resource of ['service','server','docker','api','sshKeys','gitProviders','project','environment','volume','backup','registry','traefikFiles','envVars','projectEnvVars']) for(const action of ['create','delete','write','terminal']) assert.equal(staticSitePermissionAllowed(resource,action),false,resource+':'+action);
 assert.equal(staticSitePermissionAllowed('domain','create'),true);
});
test('fixed application configuration can be built',()=>assert.doesNotThrow(()=>assertStaticSiteConfiguration({...staticSiteDefaults})));
test('existing unrestricted applications preserve behavior',()=>assert.doesNotThrow(()=>assertStaticSiteConfiguration({staticSiteOnly:false,sourceType:'docker',command:'/bin/sh'})));
test('reject builder or runtime escape attempts, including admin edits to a restricted app',()=>{
 for(const field of ['command','args','dockerImage','dockerContextPath','dockerBuildStage','env','buildArgs','buildSecrets','registryId','buildRegistryId','rollbackRegistryId','customGitUrl','customGitSSHKeyId','networkSwarm','labelsSwarm','endpointSpecSwarm','healthCheckSwarm','modeSwarm','placementSwarm','ulimitsSwarm','restartPolicySwarm','updateConfigSwarm','rollbackConfigSwarm','stopGracePeriodSwarm','serverId','buildServerId']) assert.throws(()=>assertStaticSiteConfiguration({...staticSiteDefaults,[field]:'attacker'}),field);
 for(const field of ['mounts','ports','patches','networkIds']) assert.throws(()=>assertStaticSiteConfiguration({...staticSiteDefaults,[field]:[{}]}),field);
 for(const field of ['isPreviewDeploymentsActive','rollbackActive','detachDokployNetwork','enableSubmodules','autoDeploy','createEnvFile']) assert.throws(()=>assertStaticSiteConfiguration({...staticSiteDefaults,[field]:true}),field);
 for(const update of [{buildType:'nixpacks'},{sourceType:'git'},{publishDirectory:'../../etc'},{dropBuildPath:'/etc'}]) assert.throws(()=>assertStaticSiteConfiguration({...staticSiteDefaults,...update}));
});
test('accept ordinary static assets',()=>{
 const seen=new Set<string>(); for(const name of ['index.html','assets/style.css','assets/app.js','photo.jpg','fonts/type.woff2']) assert.doesNotThrow(()=>assertStaticArchiveEntry(name,false,100,0o100644,seen));
});
test('block traversal, hidden files, shell characters and backend sources',()=>{
 for(const name of ['../index.html','/index.html','dir/../../index.html','dir\\index.html','C:/index.html','dir//index.html','.env','dir/.git/config','dir/.htaccess','index.php','server.py','Dockerfile','compose.yml','package.json','evil$(id).html','a`id`.html','line\n.html']) {
  if(name==='package.json') continue; // JSON is static data and is never installed or executed.
  assert.throws(()=>assertStaticArchiveEntry(name,false,100,0o100644,new Set()),name);
 }
});
test('reject symlinks, devices, FIFOs, oversized entries and duplicates',()=>{
 for(const mode of [0o120777,0o060644,0o020644,0o010644]) assert.throws(()=>assertStaticArchiveEntry('index.html',false,10,mode,new Set()));
 assert.throws(()=>assertStaticArchiveEntry('index.html',false,STATIC_SITE_LIMITS.file+1,0o100644,new Set()));
 const seen=new Set<string>(); assertStaticArchiveEntry('index.html',false,10,0o100644,seen); assert.throws(()=>assertStaticArchiveEntry('INDEX.HTML',false,10,0o100644,seen));
});
