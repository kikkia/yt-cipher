import { extractPlayerId, validateAndNormalizePlayerUrl } from "./utils.ts";
import { playerUrlRequests, endpointHits, responseCodes, endpointLatency } from "./metrics.ts";

type Next = (req: Request) => Promise<Response>;

export function withMetrics(handler: Next): Next {
    return async (req: Request) => {
        const { pathname } = new URL(req.url);

        // Don't record metrics for the metrics endpoint itself
        if (pathname === '/metrics') {
            return await handler(req);
        }

        const playerUrl = new URL(req.url).searchParams.get('playerUrl') || 'unknown';
        const playerId = extractPlayerId(playerUrl);

        endpointHits.labels({ method: req.method, pathname, player_id: playerId }).inc();
        const start = performance.now();

        let response: Response;
        try {
            response = await handler(req);
        } catch (error) {
            // In case of an unhandled exception, default to a 500 error
            console.error("Unhandled error in handler:", error);
            response = new Response(JSON.stringify({ error: 'Internal Server Error' }), { status: 500 });
        } finally {
            const duration = (performance.now() - start) / 1000;
            const cached = response!.headers.get("X-Cache-Hit") === "true" ? "true" : "false";
            endpointLatency.labels({ method: req.method, pathname, player_id: playerId, cached }).observe(duration);
            responseCodes.labels({ method: req.method, pathname, status: String(response!.status), player_id: playerId }).inc();
        }

        return response;
    };
}

export function withPlayerUrlValidation(handler: Next): Next {
    return async (req: Request) => {
        // Only need this check on POST requests
        if (req.method !== 'POST') {
            return await handler(req);
        }

        const originalReq = req.clone();
        try {
            const body = await req.json();
            if (!body.player_url) {
                return new Response(JSON.stringify({ error: "player_url is required" }), { status: 400, headers: { "Content-Type": "application/json" } });
            }

            const normalizedUrl = validateAndNormalizePlayerUrl(body.player_url);
            const playerId = extractPlayerId(normalizedUrl);
            playerUrlRequests.labels({ player_id: playerId }).inc();
            
            // Reconstruct the request with the normalized URL
            const newBody = { ...body, player_url: normalizedUrl };
            const newReq = new Request(req.url, {
                method: req.method,
                headers: req.headers,
                body: JSON.stringify(newBody)
            });

            return await handler(newReq);
        } catch (error) {
            if (error instanceof SyntaxError) {
                 return new Response(JSON.stringify({ error: "Invalid JSON body" }), { status: 400, headers: { "Content-Type": "application/json" } });
            }
            // Pass the original request if we cant get a body, the handler will error
            if (error.message.includes('could not be cloned')) {
                 return await handler(originalReq);
            }
            return new Response(JSON.stringify({ error: error.message }), { status: 400, headers: { "Content-Type": "application/json" } });
        }
    };
}