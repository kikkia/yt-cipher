import type { Input as MainInput } from "../../ejs/src/main.ts";
import { execInPool } from "../workerPool.ts";
import { getPlayerFilePath } from "../playerCache.ts";
import { preprocessedCache } from "../preprocessedCache.ts";
import type { SignatureRequest, SignatureResponse } from "../types.ts";

export async function handleDecryptSignature(req: Request): Promise<Response> {
    const { encrypted_signature, n_param, player_url }: SignatureRequest = await req.json();

    const playerCacheKey = await getPlayerFilePath(player_url);
    const cachedPreprocessedPlayer = preprocessedCache.get(playerCacheKey);

    const mainInput: MainInput = cachedPreprocessedPlayer
        ? {
            type: "preprocessed",
            preprocessed_player: cachedPreprocessedPlayer,
            requests: [
                { type: "sig", challenges: encrypted_signature ? [encrypted_signature] : [] },
                { type: "nsig", challenges: n_param ? [n_param] : [] },
            ],
        }
        : {
            type: "player",
            player: await Deno.readTextFile(playerCacheKey),
            output_preprocessed: true,
            requests: [
                { type: "sig", challenges: encrypted_signature ? [encrypted_signature] : [] },
                { type: "nsig", challenges: n_param ? [n_param] : [] },
            ],
        };

    const output = await execInPool(mainInput);

    if (output.type === 'error') {
        throw new Error(output.error);
    }

    if (output.preprocessed_player) {
        preprocessedCache.set(playerCacheKey, output.preprocessed_player);
        console.log(`Cached preprocessed player for: ${player_url}`);
    }

    let decrypted_signature = '';
    let decrypted_n_sig = '';

    for (const r of output.responses) {
        if (r.type === 'result') {
            if (encrypted_signature && encrypted_signature in r.data) {
                decrypted_signature = r.data[encrypted_signature];
            }
            if (n_param && n_param in r.data) {
                decrypted_n_sig = r.data[n_param];
            }
        }
    }

    const response: SignatureResponse = {
        decrypted_signature,
        decrypted_n_sig,
    };

    return new Response(JSON.stringify(response), { status: 200, headers: { "Content-Type": "application/json" } });
}