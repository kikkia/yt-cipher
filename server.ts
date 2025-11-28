import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { initializeWorkers } from "./src/workerPool.ts";
import { initializeCache } from "./src/playerCache.ts";
import { handleDecryptSignature } from "./src/handlers/decryptSignature.ts";
import { handleGetSts } from "./src/handlers/getSts.ts";
import { handleResolveUrl } from "./src/handlers/resolveUrl.ts";
import { withMetrics } from "./src/middleware.ts";
import { withValidation } from "./src/validation.ts";
import { registry } from "./src/metrics.ts";
import type { ApiRequest, RequestContext } from "./src/types.ts";

const API_TOKEN = Deno.env.get("API_TOKEN");

async function baseHandler(req: Request): Promise<Response> {
    const { pathname } = new URL(req.url);

    if (req.method === "GET" && pathname === "/") {
        return new Response(
            "There is no endpoint here, you can read the API spec at https://github.com/kikkia/yt-cipher?tab=readme-ov-file#api-specification. If you are using yt-source/lavalink, use this url for your remote cipher url",
            {
                status: 200,
                headers: { "Content-Type": "text/plain" },
            },
        );
    }

    if (pathname === "/metrics") {
        return new Response(registry.metrics(), {
            headers: { "Content-Type": "text/plain" },
        });
    }

    const authHeader = req.headers.get("authorization");
    if (API_TOKEN && API_TOKEN !== "") {
        if (authHeader !== API_TOKEN) {
            const error = authHeader
                ? "Invalid API token"
                : "Missing API token";
            return new Response(JSON.stringify({ error }), {
                status: 401,
                headers: { "Content-Type": "application/json" },
            });
        }
    }

    let handle: (ctx: RequestContext) => Promise<Response>;

    if (pathname === "/decrypt_signature") {
        handle = handleDecryptSignature;
    } else if (pathname === "/get_sts") {
        handle = handleGetSts;
    } else if (pathname === "/resolve_url") {
        handle = handleResolveUrl;
    } else {
        return new Response(JSON.stringify({ error: "Not Found" }), {
            status: 404,
            headers: { "Content-Type": "application/json" },
        });
    }

    let body;
    try {
        body = await req.json() as ApiRequest;
    } catch {
        return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
        });
    }
    const ctx: RequestContext = { req, body };

    const composedHandler = withValidation(withMetrics(handle));
    return await composedHandler(ctx);
}

const handler = baseHandler;

const port = Deno.env.get("PORT") || "8001";
const host = Deno.env.get("HOST") || "0.0.0.0";

await initializeCache();
initializeWorkers();

console.log(`Server listening on http://${host}:${port}`);
await serve(handler, { port: Number(port), hostname: host });
