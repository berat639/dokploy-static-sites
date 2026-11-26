export function parseStaticGithubInput(repositoryUrl: string, branch: string, directory: string) {
    const url = new URL(repositoryUrl);
    if (url.origin !== "https://github.com" || url.username || url.password || url.search || url.hash)
        throw new Error("Yalnızca https://github.com/kullanici/depo bağlantısı kabul edilir");
    const parts = url.pathname.replace(/\/$/, "").split("/").filter(Boolean);
    if (parts.length !== 2 || !/^[a-zA-Z0-9-]{1,100}$/.test(parts[0]!) || !/^[a-zA-Z0-9_.-]{1,100}$/.test(parts[1]!))
        throw new Error("GitHub deposunun ana bağlantısını girin; dal ve klasörü ayrı alanlara yazın");
    if (!branch || branch.length > 200 || /[\s\x00-\x1f\x7f~^:?*\[\\]/.test(branch) || branch.includes("..") || branch.startsWith("-") || branch.startsWith("/") || branch.endsWith("/") || branch.includes("//"))
        throw new Error("Geçersiz GitHub dalı");
    const folder = directory === "." || directory === "" || directory === "/" ? "" : directory.replace(/\/$/, "");
    if (folder && (folder.length > 250 || !/^[a-zA-Z0-9_ ./-]+$/.test(folder) || folder.split("/").some(p => !p || p === "." || p === ".." || p.startsWith("."))))
        throw new Error("Geçersiz statik çıktı klasörü");
    const repository = parts[1]!.replace(/\.git$/, "");
    if (!repository || repository === "." || repository === "..") throw new Error("Geçersiz GitHub deposu");
    return { owner: parts[0]!, repository, branch, directory: folder };
}

export function staticGithubProviderAllowed(actor: { id: string; role: string; organizationId: string }, provider: { userId: string | null; organizationId: string }, saved: { githubId?: string | null; owner?: string | null; repository?: string | null }, requested: { githubId: string; owner: string; repository: string }) {
    if (actor.organizationId !== provider.organizationId) return false;
    if (actor.role === "owner" || actor.role === "admin" || provider.userId === actor.id) return true;
    // An admin may attach one private repository without exposing the rest of its installation.
    return saved.githubId === requested.githubId && saved.owner?.toLowerCase() === requested.owner.toLowerCase() && saved.repository?.toLowerCase() === requested.repository.toLowerCase();
}

export function assertStaticGithubDownloadUrl(value: string) {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.port || url.username || url.password || !["api.github.com", "codeload.github.com"].includes(url.hostname))
        throw new Error("GitHub dışına arşiv yönlendirmesi engellendi");
    return url;
}
