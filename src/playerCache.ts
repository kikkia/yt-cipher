import { crypto } from "https://deno.land/std@0.224.0/crypto/mod.ts";
import { ensureDir } from "https://deno.land/std@0.224.0/fs/ensure_dir.ts";
import { join } from "https://deno.land/std@0.224.0/path/mod.ts";

export const CACHE_DIR = join(Deno.cwd(), 'player_cache');

export async function getPlayerFilePath(playerUrl: string): Promise<string> {
    // This hash of the player script url will mean that diff region scripts are treated as unequals, even for the same version #
    // I dont think I have ever seen 2 scripts of the same version differ between regions but if they ever do this will catch it
    // As far as player script access, I haven't ever heard about YT ratelimiting those either so ehh
    const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(playerUrl));
    const hash = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
    const filePath = join(CACHE_DIR, `${hash}.js`);

    try {
        await Deno.stat(filePath);
        return filePath;
    } catch (error) {
        if (error instanceof Deno.errors.NotFound) {
            console.log(`Cache miss for player: ${playerUrl}. Fetching...`);
            const response = await fetch(playerUrl);
            if (!response.ok) {
                throw new Error(`Failed to fetch player from ${playerUrl}: ${response.statusText}`);
            }
            const playerContent = await response.text();
            await Deno.writeTextFile(filePath, playerContent);
            console.log(`Saved player to cache: ${filePath}`);
            return filePath;
        }
        throw error;
    }
}

export async function initializeCache() {
    await ensureDir(CACHE_DIR);
    console.log(`Player cache directory ensured at: ${CACHE_DIR}`);
}