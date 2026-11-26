export const STATIC_SITE_PORT = 8080;
export const STATIC_SITE_IMAGE = "nginxinc/nginx-unprivileged:stable-alpine";
export const STATIC_SITE_LIMITS = { compressed: 20 * 1024 * 1024, expanded: 60 * 1024 * 1024, file: 10 * 1024 * 1024, count: 1500 };
const reads = new Set([
    "user.session", "settings.isCloud", "user.get", "user.one", "user.getPermissions", "user.haveRootAccess", "user.listSessions", "user.checkUserOrganizations",
    "project.all", "project.one", "environment.one", "environment.byProjectId",
    "application.staticGithubConnections", "application.one", "application.readLogs", "domain.byApplicationId", "domain.one",
    "deployment.all", "deployment.readLogs", "settings.getDokployVersion", "settings.getReleaseTag", "settings.isUserSubscribed",
    "organization.all", "organization.one", "organization.list", "organization.getCurrentOrganization", "organization.active", "tag.all",
]);
const mutations = new Set([
    "application.githubDeployment", "application.create", "application.dropDeployment", "application.deploy", "application.redeploy", "application.start", "application.stop",
    "domain.create", "domain.update", "domain.delete", "domain.toggleEnable", "user.revokeSession",
]);
export const staticSiteRequestAllowed = (path: string, type: string) => type === "query" ? reads.has(path) : type === "mutation" && mutations.has(path);
export const staticSitePermissionAllowed = (resource: string, action: string) => ({
    service: ["read"], environment: ["read"], deployment: ["read", "create"], domain: ["read", "create", "delete"], logs: ["read"],
} as Record<string, string[]>)[resource]?.includes(action) ?? false;
export const staticSiteDefaults = {
    staticSiteOnly: true, sourceType: "drop" as const, buildType: "static" as const,
    publishDirectory: ".", dropBuildPath: "", createEnvFile: false, autoDeploy: false,
    isStaticSpa: false, memoryLimit: "134217728", cpuLimit: "0.5", replicas: 1,
};
export function assertStaticSiteConfiguration(app: Record<string, unknown>) {
    if (!app.staticSiteOnly)
        return;
    if (app.sourceType !== "drop" || app.buildType !== "static" || app.publishDirectory !== "." || app.dropBuildPath || app.serverId || app.buildServerId || app.createEnvFile || app.autoDeploy)
        throw new Error("Static sites must use local ZIP uploads and the fixed static builder");
    for (const field of ["command", "args", "dockerImage", "dockerContextPath", "dockerBuildStage", "env", "buildArgs", "buildSecrets", "registryId", "buildRegistryId", "rollbackRegistryId", "customGitUrl", "customGitSSHKeyId", "networkSwarm", "labelsSwarm", "endpointSpecSwarm", "healthCheckSwarm", "modeSwarm", "placementSwarm", "ulimitsSwarm", "restartPolicySwarm", "updateConfigSwarm", "rollbackConfigSwarm", "stopGracePeriodSwarm"]) {
        const value = app[field];
        if (value !== undefined && value !== null && value !== "" && !(Array.isArray(value) && value.length === 0))
            throw new Error(`Static site cannot customize ${field}`);
    }
    for (const field of ["mounts", "ports", "patches", "networkIds"])
        if (Array.isArray(app[field]) && app[field].length)
            throw new Error(`Static site cannot use ${field}`);
    if (app.isPreviewDeploymentsActive || app.rollbackActive || app.detachDokployNetwork || app.enableSubmodules)
        throw new Error("Static site cannot enable advanced runtime features");
}
export function assertStaticArchiveEntry(name: string, directory: boolean, size: number, mode: number, seen: Set<string>) {
    if (!name || name.startsWith("/") || name.includes("\\") || !/^[a-zA-Z0-9_ .\/-]+$/.test(name))
        throw new Error("Unsafe ZIP filename");
    const parts = name.replace(/\/$/, "").split("/");
    if (parts.some(p => !p || p === "." || p === ".." || p.startsWith(".")))
        throw new Error("Unsafe ZIP path");
    const type = mode & 0o170000;
    if (type && type !== 0o100000 && type !== 0o040000)
        throw new Error("ZIP links and special files are forbidden");
    if (directory)
        return;
    const ext = name.slice(name.lastIndexOf(".")).toLowerCase();
    if (!new Set([".html", ".htm", ".css", ".js", ".mjs", ".json", ".txt", ".xml", ".png", ".jpg", ".jpeg", ".webp", ".gif", ".ico", ".avif", ".woff", ".woff2", ".ttf", ".otf", ".pdf", ".mp4", ".webm"]).has(ext))
        throw new Error("ZIP contains a non-static file");
    if (size < 0 || size > STATIC_SITE_LIMITS.file)
        throw new Error("ZIP file is too large");
    if (seen.has(name.toLowerCase()))
        throw new Error("Duplicate ZIP path");
    seen.add(name.toLowerCase());
}
