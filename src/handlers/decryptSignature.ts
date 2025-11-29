import { getSolvers } from "../solver.ts";
import type {
    RequestContext,
    SignatureRequest,
    SignatureResponse,
} from "../types.ts";

export async function handleDecryptSignature(
    ctx: RequestContext,
): Promise<Response> {
    const { encrypted_signature, n_param, player_url } = ctx
        .body as SignatureRequest;

    const solvers = await getSolvers(player_url);

    if (!solvers) {
        return new Response(
            JSON.stringify({
                error: "Failed to generate solvers from player script",
            }),
            { status: 500, headers: { "Content-Type": "application/json" } },
        );
    }

    let decrypted_signature = "";
    if (encrypted_signature && solvers.sig) {
        decrypted_signature = solvers.sig(encrypted_signature);
    }

    let decrypted_n_sig = "";
    if (n_param && solvers.n) {
        decrypted_n_sig = solvers.n(n_param);
    }

    const response: SignatureResponse = {
        decrypted_signature,
        decrypted_n_sig,
    };

    return new Response(JSON.stringify(response), {
        status: 200,
        headers: { "Content-Type": "application/json" },
    });
}
