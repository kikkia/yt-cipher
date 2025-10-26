import { crypto } from "https://deno.land/std@0.224.0/crypto/mod.ts";
import { ensureDir } from "https://deno.land/std@0.224.0/fs/ensure_dir.ts";
import { join } from "https://deno.land/std@0.224.0/path/mod.ts";
import { cacheSize, playerScriptFetches } from "./metrics.ts";

export const CACHE_DIR = join(Deno.cwd(), 'player_cache');

export async function getPlayerFilePath(playerUrl: string): Promise<string> {
    // This hash of the player script url will mean that diff region scripts are treated as unequals, even for the same version #
    // I dont think I have ever seen 2 scripts of the same version differ between regions but if they ever do this will catch it
    // As far as player script access, I haven't ever heard about YT ratelimiting those either so ehh
    const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(playerUrl));
    const hash = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
    const filePath = join(CACHE_DIR, `${hash}.js`);

    try {
        const stat = await Deno.stat(filePath);
        // updated time on file mark it as recently used.
        await Deno.utime(filePath, new Date(), stat.mtime ?? new Date());
        return filePath;
    } catch (error) {
        if (error instanceof Deno.errors.NotFound) {
            console.log(`Cache miss for player: ${playerUrl}. Fetching...`);
            const response = await fetch(playerUrl);
            playerScriptFetches.labels({ player_url: playerUrl, status: response.statusText }).inc();
            if (!response.ok) {
                throw new Error(`Failed to fetch player from ${playerUrl}: ${response.statusText}`);
            }
            const playerContent = await response.text();
            await Deno.writeTextFile(filePath, playerContent);

            // Update cache size for metrics
            let fileCount = 0;
            for await (const _ of Deno.readDir(CACHE_DIR)) {
                fileCount++;
            }
            cacheSize.labels({ cache_name: 'player' }).set(fileCount);
            
            console.log(`Saved player to cache: ${filePath}`);
            return filePath;
        }
        throw error;
    }
}

export async function initializeCache() {
    await ensureDir(CACHE_DIR);

    // Since these accumulate over time just cleanout 14 day unused ones
    let fileCount = 0;
    const thirtyDays = 14 * 24 * 60 * 60 * 1000;
    console.log(`Cleaning up player cache directory: ${CACHE_DIR}`);
    for await (const dirEntry of Deno.readDir(CACHE_DIR)) {
        if (dirEntry.isFile) {
            const filePath = join(CACHE_DIR, dirEntry.name);
            const stat = await Deno.stat(filePath);
            const lastAccessed = stat.atime?.getTime() ?? stat.mtime?.getTime() ?? stat.birthtime?.getTime();
            if (lastAccessed && (Date.now() - lastAccessed > thirtyDays)) {
                console.log(`Deleting stale player cache file: ${filePath}`);
                await Deno.remove(filePath);
            } else {
                fileCount++;
            }
        }
    }
    cacheSize.labels({ cache_name: 'player' }).set(fileCount);
    console.log(`Player cache directory ensured at: ${CACHE_DIR}`);
}