import AdmZip from "adm-zip";
import { validateStaticZip } from "./archive";
import { assertStaticArchiveEntry, STATIC_SITE_LIMITS } from "./policy";
import { assertStaticGithubDownloadUrl } from "./github-policy";

export async function downloadStaticGithubArchive(owner: string, repository: string, branch: string, directory: string, token?: string) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000);
    try {
        let url = new URL(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/zipball/${encodeURIComponent(branch)}`);
        let response: Response | undefined;
        for (let redirect = 0; redirect < 4; redirect++) {
            assertStaticGithubDownloadUrl(url.href);
            response = await fetch(url, {
                redirect: "manual", signal: controller.signal,
                headers: { "User-Agent": "Dokploy-Static-Sites", ...(token && url.hostname === "api.github.com" ? { Authorization: `Bearer ${token}` } : {}) },
            });
            if ([301, 302, 303, 307, 308].includes(response.status)) {
                const location = response.headers.get("location");
                await response.body?.cancel();
                if (!location) throw new Error("GitHub arşiv adresi alınamadı");
                url = assertStaticGithubDownloadUrl(new URL(location, url).href);
                response = undefined;
                continue;
            }
            break;
        }
        if (!response?.ok || !response.body) {
            await response?.body?.cancel();
            throw new Error("GitHub deposu veya dalı okunamadı. Özel depolar için yetkili GitHub bağlantısını seçin.");
        }
        const reader = response.body.getReader();
        const chunks: Uint8Array[] = [];
        let size = 0;
        try {
            while (true) {
                const chunk = await reader.read();
                if (chunk.done) break;
                size += chunk.value.length;
                if (size > STATIC_SITE_LIMITS.compressed) throw new Error("GitHub arşivi en fazla 20 MB olabilir");
                chunks.push(chunk.value);
            }
        } finally { await reader.cancel(); }
        const source = new AdmZip(Buffer.concat(chunks));
        const entries = source.getEntries();
        if (entries.length > 10000) throw new Error("GitHub deposu çok fazla dosya içeriyor");
        const root = entries[0]?.entryName.split("/")[0];
        if (!root || !/^[a-zA-Z0-9_.-]+$/.test(root)) throw new Error("Geçersiz GitHub arşivi");
        const prefix = `${root}/${directory ? `${directory}/` : ""}`;
        const output = new AdmZip();
        const seen = new Set<string>();
        let expanded = 0;
        let count = 0;
        for (const entry of entries) {
            if (!entry.entryName.startsWith(`${root}/`)) throw new Error("Geçersiz GitHub arşiv kökü");
            if (!entry.entryName.startsWith(prefix)) continue;
            const name = entry.entryName.slice(prefix.length);
            if (!name) continue;
            if (++count > STATIC_SITE_LIMITS.count) throw new Error("Statik klasörde en fazla 1500 dosya olabilir");
            assertStaticArchiveEntry(name, entry.isDirectory, entry.header.size, entry.header.attr >>> 16, seen);
            if (entry.isDirectory) continue;
            expanded += entry.header.size;
            if (expanded > STATIC_SITE_LIMITS.expanded) throw new Error("Statik çıktı en fazla 60 MB olabilir");
            const bytes = entry.getData();
            if (bytes.length !== entry.header.size) throw new Error("GitHub arşiv boyutu uyuşmuyor");
            if (/(^|\/)(package(?:-lock)?\.json|composer\.json|manifest\.json)$/i.test(name) && /(?:react-native|expo|electron|"start"\s*:|"server"\s*:)/i.test(bytes.toString("utf8")))
                throw new Error("Mobil uygulama ve sunucu proje dosyaları yayınlanamaz; hazır statik çıktı klasörünü seçin");
            output.addFile(name, bytes);
        }
        const file = new File([new Uint8Array(output.toBuffer())], "github-static.zip", { type: "application/zip" });
        await validateStaticZip(file);
        return file;
    } finally { clearTimeout(timeout); }
}
