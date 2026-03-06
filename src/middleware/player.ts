import { getPlayerScript } from "../player.ts";
import type { RequestContext } from "../types.ts";

type Next = (ctx: RequestContext) => Promise<Response>;

export function withPlayer(handler: Next): Next {
    return async (ctx: RequestContext) => {
        try {
            const playerScript = getPlayerScript(ctx.body.player_url);
            const newCtx = { ...ctx, playerScript };
            return await handler(newCtx);
        } catch (e) {
            const message = e instanceof Error ? e.message : String(e);
            return new Response(JSON.stringify({ error: `Player script error: ${message}` }), { status: 400, headers: { "Content-Type": "application/json" } });
        }
    };
}