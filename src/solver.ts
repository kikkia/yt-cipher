import { execInPool } from "./workerPool.ts";
import { getPlayerFilePath } from "./playerCache.ts";
import { preprocessedCache } from "./preprocessedCache.ts";
import { solverCache } from "./solverCache.ts";
import { getFromPrepared } from "../ejs/src/yt/solver/solvers.ts";
import type { Solvers } from "./types.ts";
import { workerErrors } from "./metrics.ts";
import { extractPlayerId } from "./utils.ts";

export async function getSolvers(player_url: string): Promise<Solvers | null> {
    const playerCacheKey = await getPlayerFilePath(player_url);

    let solvers = solverCache.get(playerCacheKey);

    if (solvers) {
        return solvers;
    }

    let preprocessedPlayer = preprocessedCache.get(playerCacheKey);
    if (!preprocessedPlayer) {
        const rawPlayer = await Deno.readTextFile(playerCacheKey);
        try {
            preprocessedPlayer = await execInPool(rawPlayer);
        } catch (e) {
            const playerId = extractPlayerId(player_url);
            const message = e instanceof Error ? e.message : String(e);
            workerErrors.labels({ player_id: playerId, message }).inc();
            throw e;
        }
        preprocessedCache.set(playerCacheKey, preprocessedPlayer);
    }
    
    solvers = getFromPrepared(preprocessedPlayer);
    if (solvers) {
        solverCache.set(playerCacheKey, solvers);
        return solvers;
    }

    return null;
}