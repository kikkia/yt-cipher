import { crypto } from "@std/crypto";
import { ensureDir } from "@std/fs";
import { join } from "@std/path";
import { cacheSize, playerScriptFetches } from "./metrics.ts";

let cache_prefix = Deno.cwd();
const HOME = Deno.env.get("HOME");
if (HOME) {
    cache_prefix = join(HOME, ".cache", "yt-cipher");
}
const CACHE_HOME = Deno.env.get("XDG_CACHE_HOME");
if (CACHE_HOME) {
    cache_prefix = join(CACHE_HOME, "yt-cipher");
}
export const CACHE_DIR = join(cache_prefix, "player_cache");

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
