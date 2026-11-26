import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { parseStaticGithubInput, staticGithubProviderAllowed, assertStaticGithubDownloadUrl } from '../../packages/server/src/utils/static-sites/github-policy.ts';
import { staticSiteRequestAllowed, assertStaticSiteConfiguration, staticSiteDefaults } from '../../packages/server/src/utils/static-sites/policy.ts';
test('GitHub link, branch and subdirectory are independent and preserve the fixed builder', () => {
 assert.deepEqual(parseStaticGithubInput('https://github.com/axioqyazilim-svg/axioq', 'main', 'web'), {owner:'axioqyazilim-svg',repository:'axioq',branch:'main',directory:'web'});
 assert.equal(parseStaticGithubInput('https://github.com/user/repo.git/', 'feature/site', '.').directory,'');
 assert.doesNotThrow(()=>assertStaticSiteConfiguration({...staticSiteDefaults,owner:'user',repository:'repo',branch:'main',buildPath:'web',githubId:'id'}));
});
test('arbitrary hosts, embedded credentials, path traversal and command input are rejected', () => {
 for (const url of ['http://github.com/u/r','https://github.com.evil.test/u/r','https://token@github.com/u/r','https://github.com/u/r/tree/main','https://127.0.0.1/u/r','https://github.com/u/r?x=1','https://github.com/u/r#x','https://github.com/u/.git']) assert.throws(()=>parseStaticGithubInput(url,'main','.'));
 for (const dir of ['../web','/etc','web/../../etc','.git','web/.env','web//assets','web;id','web/$(id)']) assert.throws(()=>parseStaticGithubInput('https://github.com/u/r','main',dir));
 for (const branch of ['../main','-x','main; id','a\\b','a?b','a//b']) assert.throws(()=>parseStaticGithubInput('https://github.com/u/r',branch,'.'));
});
test('new endpoints are narrowly allowlisted; general GitHub and runtime permissions remain blocked', () => {
 assert.equal(staticSiteRequestAllowed('application.githubDeployment','mutation'),true);
 assert.equal(staticSiteRequestAllowed('application.staticGithubConnections','query'),true);
 for (const route of ['application.saveGithubProvider','application.saveGitProvider','application.saveBuildType','application.update','github.one','github.getGithubRepositories','gitProvider.getAll']) {
  assert.equal(staticSiteRequestAllowed(route,'mutation'),false);
  assert.equal(staticSiteRequestAllowed(route,'query'),false);
 }
});
test('a private connection cannot cross organizations or reveal other repositories', () => {
 const actor={id:'member',role:'member',organizationId:'org'};
 const provider={userId:'admin',organizationId:'org'};
 const saved={githubId:'provider',owner:'customer',repository:'site'};
 const requested={githubId:'provider',owner:'customer',repository:'site'};
 assert.equal(staticGithubProviderAllowed(actor,provider,saved,requested),true);
 assert.equal(staticGithubProviderAllowed(actor,provider,saved,{...requested,repository:'secret'}),false);
 assert.equal(staticGithubProviderAllowed(actor,provider,saved,{...requested,githubId:'other'}),false);
 assert.equal(staticGithubProviderAllowed(actor,{...provider,organizationId:'other'},saved,requested),false);
 assert.equal(staticGithubProviderAllowed(actor,{...provider,userId:'member'},saved,{...requested,repository:'owned'}),true);
 assert.equal(staticGithubProviderAllowed({...actor,role:'owner'},provider,{},requested),true);
});
test('archive redirects cannot reach internal services or forward credentials to arbitrary hosts', () => {
 for(const url of ['https://api.github.com/repos/u/r/zipball/main','https://codeload.github.com/u/r/legacy.zip/main']) assert.doesNotThrow(()=>assertStaticGithubDownloadUrl(url));
 for(const url of ['http://codeload.github.com/u/r','https://127.0.0.1/','https://api.github.com:444/','https://token@api.github.com/','https://evil.test/','https://api.github.com.evil.test/']) assert.throws(()=>assertStaticGithubDownloadUrl(url));
});
