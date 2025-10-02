import { execInPool } from "../workerPool.ts";
import { getPlayerFilePath } from "../playerCache.ts";
import { preprocessedCache } from "../preprocessedCache.ts";
import { solverCache } from "../solverCache.ts";
import { getFromPrepared } from "../../ejs/src/yt/solver/solvers.ts";
import type { RequestContext, SignatureRequest, SignatureResponse, Solvers } from "../types.ts";

export async function handleDecryptSignature(ctx: RequestContext): Promise<Response> {
    const { encrypted_signature, n_param, player_url } = ctx.body as SignatureRequest;

    const playerCacheKey = await getPlayerFilePath(player_url);

    let solvers = solverCache.get(playerCacheKey);

    if (!solvers) {
        let preprocessedPlayer = preprocessedCache.get(playerCacheKey);
        if (!preprocessedPlayer) {
            const rawPlayer = await Deno.readTextFile(playerCacheKey);
            preprocessedPlayer = await execInPool(rawPlayer);
            preprocessedCache.set(playerCacheKey, preprocessedPlayer);
        }
        
        solvers = getFromPrepared(preprocessedPlayer);
        solverCache.set(playerCacheKey, solvers);
    }

    let decrypted_signature = '';
    if (encrypted_signature && solvers.sig) {
        decrypted_signature = solvers.sig(encrypted_signature);
    }

    let decrypted_n_sig = '';
    if (n_param && solvers.n) {
        decrypted_n_sig = solvers.n(n_param);
    }

    const response: SignatureResponse = {
        decrypted_signature,
        decrypted_n_sig,
    };

    return new Response(JSON.stringify(response), { status: 200, headers: { "Content-Type": "application/json" } });
}