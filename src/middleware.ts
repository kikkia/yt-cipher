import { endpointHits, responseCodes, sanitizeLabelValue, userAgentRequests } from "./metrics.ts";
import type { RequestContext } from "./types.ts";

type Next = (ctx: RequestContext) => Promise<Response>;

export function withMetrics(handler: Next): Next {
    return async (ctx: RequestContext) => {
        const { pathname } = new URL(ctx.req.url);
        const playerId = ctx.playerScript?.id ?? "unknown";
        const playerType = ctx.playerScript?.variant ?? "unknown";
        const userAgent = sanitizeLabelValue(ctx.req.headers.get("User-Agent") ?? "unknown");

        endpointHits.labels({ pathname, player_id: playerId, player_type: playerType }).inc();
        userAgentRequests.labels({ user_agent: userAgent }).inc();

        let response: Response;
        try {
            response = await handler(ctx);
        } catch (e) {
            console.error("Caught error in middleware:", e);
            const message = e instanceof Error ? e.message : String(e);
            response = new Response(JSON.stringify({ error: message }), { status: 500, headers: { "Content-Type": "application/json" } });
        }

        responseCodes.labels({ pathname, status: String(response.status), player_id: playerId, player_type: playerType }).inc();

        return response;
    };
}
