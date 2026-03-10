import { getSolvers } from "../solver.ts";
import type { RequestContext, ResolveUrlRequest, ResolveUrlResponse } from "../types.ts";

export async function handleResolveUrl(ctx: RequestContext): Promise<Response> {
    const { stream_url, encrypted_signature, signature_key, n_param: nParamFromRequest } = ctx.body as ResolveUrlRequest;

    const solvers = await getSolvers(ctx.playerScript!);
    console.log(signature_key);
    console.log(nParamFromRequest);
    console.log(stream_url);

    if (!solvers) {
        console.error("Failed to generate solvers from player script for player: " + ctx.playerScript?.toUrl());
        return new Response(JSON.stringify({ error: "Failed to generate solvers from player script" }), { status: 500, headers: { "Content-Type": "application/json" } });
    }

    const url = new URL(stream_url);

    if (encrypted_signature) {
        if (!solvers.sig) {
            console.error("No signature solver found for this player: " + ctx.playerScript?.toUrl());
            return new Response(JSON.stringify({ error: "No signature solver found for this player" }), { status: 500, headers: { "Content-Type": "application/json" } });
        }
        const decryptedSig = solvers.sig(encrypted_signature);
        const sigKey = signature_key || url.searchParams.get("sp") || 'sig';
        url.searchParams.set(sigKey, decryptedSig);
        url.searchParams.delete("s");
    }

    let nParam = nParamFromRequest || null;
    if (!nParam) {
        nParam = url.searchParams.get("n");
    }

    if (solvers.n && nParam) {
        const decryptedN = solvers.n(nParam);
        url.searchParams.set("n", decryptedN);
    }
    
    const response: ResolveUrlResponse = {
        resolved_url: url.toString(),
    };
    console.log(url.toString());

    return new Response(JSON.stringify(response), { status: 200, headers: { "Content-Type": "application/json" } });
}
