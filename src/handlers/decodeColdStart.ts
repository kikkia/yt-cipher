import { decodeColdStartToken } from "../potoken/botguard.ts";
import type { ColdStartRequest, RequestContext } from "../types.ts";

export function handleDecodeColdStart(ctx: RequestContext): Promise<Response> {
    const { token } = ctx.body as ColdStartRequest;

    try {
        return Promise.resolve(new Response(JSON.stringify(decodeColdStartToken(token)), {
            status: 200,
            headers: { "Content-Type": "application/json" },
        }));
    } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        return Promise.resolve(new Response(JSON.stringify({ error: message || 'invalid cold-start token' }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
        }));
    }
}
