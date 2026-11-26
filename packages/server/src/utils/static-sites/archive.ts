import AdmZip from "adm-zip";
import { assertStaticArchiveEntry, STATIC_SITE_LIMITS } from "./policy";
export async function validateStaticZip(file: File) {
    if (file.size > STATIC_SITE_LIMITS.compressed)
        throw new Error("Static site ZIP must be at most 20 MB");
    const zip = new AdmZip(Buffer.from(await file.arrayBuffer()));
    const entries = zip.getEntries();
    if (entries.length > STATIC_SITE_LIMITS.count)
        throw new Error("Static site ZIP contains too many entries");
    const seen = new Set<string>();
    let total = 0;
    let hasIndex = false;
    for (const entry of entries) {
        assertStaticArchiveEntry(entry.entryName, entry.isDirectory, entry.header.size, entry.header.attr >>> 16, seen);
        if (entry.isDirectory)
            continue;
        total += entry.header.size;
        if (total > STATIC_SITE_LIMITS.expanded)
            throw new Error("Expanded ZIP exceeds 60 MB");
        const bytes = entry.getData();
        if (bytes.length !== entry.header.size || bytes.length > STATIC_SITE_LIMITS.file)
            throw new Error("ZIP size mismatch");
        if (entry.entryName === "index.html")
            hasIndex = true;
    }
    if (!hasIndex)
        throw new Error("Static ZIP must contain index.html at its root");
}
