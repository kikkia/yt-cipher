import { extractPlayerId } from "./utils.ts";
import { endpointHits, responseCodes, endpointLatency } from "./metrics.ts";
import type { RequestContext } from "./types.ts";

type Next = (ctx: RequestContext) => Promise<Response>;

export function withMetrics(handler: Next): Next {
    return async (ctx: RequestContext) => {
        const { pathname } = new URL(ctx.req.url);
        const playerId = extractPlayerId(ctx.body.player_url);
        const pluginVersion = ctx.req.headers.get("Plugin-Version") ?? "unknown";
        const userAgent = ctx.req.headers.get("User-Agent") ?? "unknown";

        endpointHits.labels({ method: ctx.req.method, pathname, player_id: playerId, plugin_version: pluginVersion, user_agent: userAgent }).inc();
        const start = performance.now();

        let response: Response;
        try {
            response = await handler(ctx);
        } catch (e) {
            const message = e instanceof Error ? e.message : String(e);
            response = new Response(JSON.stringify({ error: message }), { status: 500, headers: { "Content-Type": "application/json" } });
        }

        const duration = (performance.now() - start) / 1000;
        const cached = response.headers.get("X-Cache-Hit") === "true" ? "true" : "false";
        endpointLatency.labels({ method: ctx.req.method, pathname, player_id: playerId, cached}).observe(duration);
        responseCodes.labels({ method: ctx.req.method, pathname, status: String(response.status), player_id: playerId, plugin_version: pluginVersion, user_agent: userAgent }).inc();

        return response;
    };
}
