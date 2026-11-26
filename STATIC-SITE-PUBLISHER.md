# Dokploy static-site publisher restriction

Base: upstream Dokploy v0.30.8. This is a change to Dokploy itself, not a separate hosting platform.

## Status

Implementation and local policy/scope tests are complete. Full dependency installation, TypeScript semantic checking, upstream Vitest suites, Docker build and live smoke tests are REQUIRED before enabling the feature. The local command environment cannot resolve npm/GitHub hosts. The `Static site publisher verification` GitHub workflow performs the remaining build checks when run in a source repository. No production Dokploy service has been replaced and no new user permission has been granted by this source package.

## Operator configuration after successful build

1. Take a complete Dokploy database backup and record the running image digest before deploying the custom build. The patch adds only default-false restriction fields; it grants nothing automatically. Keep current environment, volumes, Docker socket and encryption/authentication secrets unchanged when deploying the new image. Use the normal Dokploy upgrade procedure with the custom image; do not start a second Dokploy instance on the production database.
2. Migration `0196_static_site_publisher` adds `staticSiteOnly` on member, user and application, plus the user policy's organization binding. Do not run the SQL manually and then run Drizzle migrations a second time. The previous image can be restored without dropping the new defaulted columns; application rollback requires keeping migrated database contents.
3. In Settings → Users → Member → Add Permissions, enable **Yalnızca statik site yayınlama**. Select only the intended project and production environment. Leave broad creation/deletion, Docker, API/CLI, SSH, Git, Traefik and server permissions disabled. Enabling the switch enforces these disabled settings on the server too.
4. The user signs into the existing Dokploy panel. In the assigned project, only the static-site workflow is rendered. The member can create a site, upload a prepared ZIP, publish, start/stop, read scoped deployment logs and bind ordinary DNS hostnames with HTTPS. No platform-specific domain suffix is required.
5. ZIP files must have `index.html` at the root. Upload the output of the site's build, not a source repository. There is no Git import/build execution in this restricted mode. ZIP limits: compressed 20 MiB, expanded 60 MiB, 1500 entries, 10 MiB per file. A custom domain's A record must point to the server; SSL issuance still depends on DNS and network reachability.
6. The static application uses a fixed unprivileged Nginx image on port 8080, readonly root filesystem, temporary /tmp, no capabilities, no user-supplied mounts/environment/command, and fixed resource defaults. The user cannot switch its builder, source provider, runtime or server. Static-only application identity survives worker/webhook calls and cannot be removed by generic application update.
7. Restrictions bind to the user ID and organization, not the email address. Changing organizations or membership role cannot gain access to non-static actions. Removing a restricted membership does not automatically remove the account-level restriction. Only the owning organization's administrator can clear the restriction explicitly.

## Smoke tests before granting access

Use a separate test database and a member account. Confirm normal owner/admin projects still work. Enable the restriction for a test member and one empty environment. Create a static site, upload a small valid ZIP, verify the completed deployment, attach a domain, confirm HTTP/HTTPS content, then verify updates and start/stop. Try Compose/database creation, direct application.update/saveBuildType/saveDockerProvider/saveEnvironment/mount/port/patch/schedule calls and container/host WebSocket terminals: all must fail. Try another application's ID, another environment, and another organization. Check the account cannot enable its own permissions. Inspect the running static container's user, readonly setting, capabilities, mounts and published ports.

## Tests

```sh
node --test tests/static-sites/policy.test.ts
node --test tests/static-sites/run-scope-tests.mjs
pnpm --filter=dokploy exec vitest run --config __test__/vitest.config.ts __test__/permissions __test__/wss/authorize.test.ts
pnpm --filter=@dokploy/server build
pnpm --filter=dokploy typecheck
```

The 10 policy tests and 9 scope tests ran locally and passed. The scope harness bundles the real authorization function against explicit database/service fakes. It checks allowed environment creation, cross-organization/role changes, cross-application access, FormData uploads, static domain constraints and scoped logs. It does not replace a real database/runtime test. Upstream permission and WebSocket regression tests were extended; they have not run locally because their dependencies are unavailable.

## Boundaries

This prevents running server applications under the restricted account. It cannot automatically determine that every HTML/JavaScript site is a business brochure: browser-only applications and external API calls are still technically static files. No content-based approval system is added. The Dockerfile and ZIP payload are never treated as a source project for npm/pip or shell execution. Other existing users and applications remain unrestricted unless explicitly opted into this mode.
