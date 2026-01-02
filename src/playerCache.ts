import { ensureDir } from "@std/fs";
import { join } from "@std/path";
import { cacheSize, playerScriptFetches } from "./metrics.ts";
import { digestPlayerUrl, extractPlayerId, getTimestamp } from "./utils.ts";

const inFlightPlayerFetches = new Map<string, Promise<string>>();
const ignorePlayerScriptRegion = ["1", "true", "yes", "on"].includes(
    (Deno.env.get("IGNORE_SCRIPT_REGION") ?? "").trim().toLowerCase(),
);

function getCachePrefix(): string {
    // Windows
    if (Deno.build.os === "windows") {
        const localAppData = Deno.env.get("LOCALAPPDATA");
        const userProfile = Deno.env.get("USERPROFILE");
        const TEMP = Deno.env.get("TEMP");
        const TMP = Deno.env.get("TMP");

        if (localAppData) return join(localAppData, "yt-cipher");
        if (userProfile) {
            return join(userProfile, "AppData", "Local", "yt-cipher");
        }
        if (TEMP) return join(TEMP, "yt-cipher");
        if (TMP) return join(TMP, "yt-cipher");

        // Last-resort fallback to avoid hard crash.
        return join(Deno.cwd(), "yt-cipher");
    }

    // XDG standard (Linux, optional on others)
    const XDG_CACHE_HOME = Deno.env.get("XDG_CACHE_HOME");

    // macOS / Linux fallback
    const HOME = Deno.env.get("HOME");

    if (XDG_CACHE_HOME) {
        return join(XDG_CACHE_HOME, "yt-cipher");
    } else if (HOME) {
        return join(HOME, ".cache", "yt-cipher");
    }

    return Deno.cwd();
}

export const CACHE_DIR = join(getCachePrefix(), "player_cache");

export async function getPlayerFilePath(playerUrl: string): Promise<string> {
    let cacheKey: string;
    if (ignorePlayerScriptRegion) {
        // I have not seen any scripts that differ between regions so this should be safe
        const playerId = extractPlayerId(playerUrl);
        // If we can't reliably extract an id, fall back to hashing the full URL to avoid cache key collisions.
        if (playerId === "unknown") {
            cacheKey = await digestPlayerUrl(playerUrl);
        } else {
            cacheKey = playerId.replace(/[^a-zA-Z0-9_-]/g, "_");
            // Ensure that the file name is below the 128 character limit
            if (cacheKey.length > 120) {
                cacheKey = await digestPlayerUrl(playerUrl);
            }
        }
    } else {
        // This hash of the player script url will mean that diff region scripts are treated as unequals, even for the same version #
        // I dont think I have ever seen 2 scripts of the same version differ between regions but if they ever do this will catch it
        // As far as player script access, I haven't ever heard about YT ratelimiting those either so ehh
        cacheKey = await digestPlayerUrl(playerUrl);
    }
    const filePath = join(CACHE_DIR, `${cacheKey}.js`);

    try {
        const stat = await Deno.stat(filePath);
        // updated time on file mark it as recently used.
        await Deno.utime(filePath, new Date(), stat.mtime ?? new Date());
        return filePath;
    } catch (error) {
        if (!(error instanceof Deno.errors.NotFound)) throw error;

        const existing = inFlightPlayerFetches.get(filePath);
        if (existing) {
            try {
                return await existing;
            } catch (err) {
                console.warn(
                    `[${getTimestamp()}] Previous fetch failed for player: ${playerUrl} (${filePath}); retrying...`,
                    err,
                );

                // Allow a retry if the shared fetch failed.
                inFlightPlayerFetches.delete(filePath);
            }
        }

        const fetchPromise = (async () => {
            console.log(
                `[${getTimestamp()}] Cache miss for player: ${playerUrl}. Fetching...`,
            );
            const response = await fetch(playerUrl, {
                signal: AbortSignal.timeout(60_000),
            });
            playerScriptFetches.labels({
                player_url: playerUrl,
                status: response.statusText,
            }).inc();
            if (!response.ok) {
                throw new Error(
                    `Failed to fetch player from ${playerUrl}: ${response.statusText}`,
                );
            }
            const playerContent = await response.text();

            // Ensure cache dir still exists (it may be deleted between startup and a request).
            await ensureDir(CACHE_DIR);

            // use a temporary directory to allow atomic file updates
            const tempDirPath = await Deno.makeTempDir({ dir: CACHE_DIR });
            const tempFilePath = join(tempDirPath, "file.js");
            try {
                await Deno.writeTextFile(tempFilePath, playerContent);

                // Remove anything that might be there now.
                await Deno.remove(filePath, { recursive: true }).catch(
                    () => {},
                );
                // Now this rename either succeeds or fails.
                await Deno.rename(tempFilePath, filePath);
            } finally {
                await Deno.remove(tempDirPath, { recursive: true }).catch(
                    () => {},
                );
            }

            // Update cache size for metrics
            let fileCount = 0;
            for await (const _ of Deno.readDir(CACHE_DIR)) {
                fileCount++;
            }
            cacheSize.labels({ cache_name: "player" }).set(fileCount);

            console.log(
                `[${getTimestamp()}] Saved player to cache: ${filePath}`,
            );
            return filePath;
        })();

        inFlightPlayerFetches.set(filePath, fetchPromise);
        try {
            return await fetchPromise;
        } finally {
            // ensure map doesn’t leak entries on success/failure
            inFlightPlayerFetches.delete(filePath);
        }
    }
}

export async function initializeCache() {
    await ensureDir(CACHE_DIR);

    // Since these accumulate over time just cleanout 14 day unused ones
    let fileCount = 0;
    const twoWeeks = 14 * 24 * 60 * 60 * 1000;
    console.log(
        `[${getTimestamp()}] Cleaning up player cache directory: ${CACHE_DIR}`,
    );
    for await (const dirEntry of Deno.readDir(CACHE_DIR)) {
        if (!dirEntry.isFile) continue;
        const filePath = join(CACHE_DIR, dirEntry.name);
        try {
            const stat = await Deno.stat(filePath);
            const lastAccessed = stat.atime?.getTime() ??
                stat.mtime?.getTime() ?? stat.birthtime?.getTime();
            if (lastAccessed && (Date.now() - lastAccessed > twoWeeks)) {
                console.log(
                    `[${getTimestamp()}] Deleting stale player cache file: ${filePath}`,
                );
                await Deno.remove(filePath);
            } else {
                fileCount++;
            }
        } catch (err) {
            // File may have disappeared or be unreadable; don't fail startup.
            console.warn(
                `[${getTimestamp()}] Skipping cache entry during cleanup: ${filePath}`,
                err,
            );
            continue;
        }
    }
    cacheSize.labels({ cache_name: "player" }).set(fileCount);
    console.log(
        `[${getTimestamp()}] Player cache directory ensured at: ${CACHE_DIR}`,
    );
}
