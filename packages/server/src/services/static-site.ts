import { db } from "@dokploy/server/db";
import { domains, user } from "@dokploy/server/db/schema";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { findApplicationById } from "./application";
import { getDokployUrl } from "./admin";
import { findDomainById } from "./domain";
import { findEnvironmentById } from "./environment";
import { findMemberByUserId, type PermissionCtx } from "./permission";
import { staticSiteRequestAllowed, STATIC_SITE_PORT } from "../utils/static-sites/policy";
export async function enforceStaticSiteRequest(ctx: PermissionCtx, path: string, type: string, raw: unknown) {
    const account = await db.query.user.findFirst({ where: eq(user.id, ctx.user.id), columns: { staticSiteOnly: true, staticSiteOrganizationId: true } });
    if (!account?.staticSiteOnly)
        return false;
    const member = await findMemberByUserId(ctx.user.id, ctx.session.activeOrganizationId);
    const deny = () => { throw new TRPCError({ code: "FORBIDDEN", message: "This account can only publish static sites in its assigned environment" }); };
    if (!member.staticSiteOnly || account.staticSiteOrganizationId !== ctx.session.activeOrganizationId || member.role !== "member" || !staticSiteRequestAllowed(path, type))
        deny();
    const input = raw instanceof FormData ? Object.fromEntries(raw.entries()) : (raw ?? {}) as Record<string, unknown>;
    async function checkApp(id: unknown) {
        if (typeof id !== "string" || !member.accessedServices.includes(id))
            return deny();
        const app = await findApplicationById(id);
        if (!app.staticSiteOnly || app.environment.project.organizationId !== ctx.session.activeOrganizationId || !member.accessedProjects.includes(app.environment.projectId) || !member.accessedEnvironments.includes(app.environmentId))
            deny();
        return app;
    }
    if (path === "application.create") {
        if (typeof input.environmentId !== "string" || !member.accessedEnvironments.includes(input.environmentId) || input.serverId)
            deny();
        const environment = await findEnvironmentById(input.environmentId as string);
        if (!member.accessedProjects.includes(environment.projectId) || environment.project.organizationId !== ctx.session.activeOrganizationId)
            deny();
    }
    else if (path.startsWith("application.") || path === "domain.byApplicationId" || path === "deployment.all") {
        await checkApp(input.applicationId);
    }
    if (path.startsWith("domain.") && path !== "domain.byApplicationId") {
        const current = typeof input.domainId === "string" ? await findDomainById(input.domainId) : null;
        const applicationId = current?.applicationId ?? input.applicationId;
        await checkApp(applicationId);
        if (input.composeId || input.previewDeploymentId || (input.applicationId && input.applicationId !== applicationId) || (input.domainType && input.domainType !== "application"))
            deny();
        if (type === "mutation" && (path === "domain.create" || path === "domain.update")) {
            if (input.port !== STATIC_SITE_PORT || input.https !== true || input.certificateType !== "letsencrypt")
                deny();
            if (input.path && input.path !== "/")
                deny();
            if (input.internalPath && input.internalPath !== "/")
                deny();
            if (input.customEntrypoint || input.customCertResolver || input.certificateType === "custom" || (Array.isArray(input.middlewares) && input.middlewares.length > 0) || input.forwardAuthEnabled || input.stripPath)
                deny();
            if (input.host !== undefined) {
                if (typeof input.host !== "string" || !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(input.host))
                    deny();
                const controlPlaneHost = new URL(await getDokployUrl()).hostname;
                if (input.host === controlPlaneHost)
                    deny();
                const existing = await db.query.domains.findFirst({ where: eq(domains.host, input.host as string) });
                if (existing && existing.applicationId !== applicationId)
                    deny();
            }
        }
    }
    if (path === "project.one" || path === "environment.byProjectId") {
        if (typeof input.projectId !== "string" || !member.accessedProjects.includes(input.projectId))
            deny();
    }
    if (path === "environment.one") {
        if (typeof input.environmentId !== "string" || !member.accessedEnvironments.includes(input.environmentId))
            deny();
    }
    if (path === "deployment.readLogs") {
        const deployment = typeof input.deploymentId === "string" ? await db.query.deployments.findFirst({ where: (d, { eq }) => eq(d.deploymentId, input.deploymentId as string) }) : null;
        if (!deployment?.applicationId)
            deny();
        await checkApp(deployment?.applicationId);
    }
    return true;
}
