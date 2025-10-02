import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { initializeWorkers } from "./src/workerPool.ts";
import { initializeCache } from "./src/playerCache.ts";
import { handleDecryptSignature } from "./src/handlers/decryptSignature.ts";
import { handleGetSts } from "./src/handlers/getSts.ts";
import { withPlayerUrlValidation, withMetrics } from "./src/middleware.ts";
import { registry } from "./src/metrics.ts";
import type { ApiRequest, RequestContext } from "./src/types.ts";

const API_TOKEN = Deno.env.get("API_TOKEN");

async function baseHandler(req: Request): Promise<Response> {
    const { pathname } = new URL(req.url);

    if (pathname === '/metrics') {
        return new Response(registry.metrics(), {
            headers: { "Content-Type": "text/plain" },
        });
    }

    const authHeader = req.headers.get("authorization");
    if (API_TOKEN && API_TOKEN !== "") {
        if (authHeader !== API_TOKEN) {
            const error = authHeader ? 'Invalid API token' : 'Missing API token';
            return new Response(JSON.stringify({ error }), { status: 401, headers: { "Content-Type": "application/json" } });
        }
    }

    let handle: (ctx: RequestContext) => Promise<Response>;

    if (pathname === '/decrypt_signature') {
        handle = handleDecryptSignature;
    } else if (pathname === '/get_sts') {
        handle = handleGetSts;
    } else {
        return new Response(JSON.stringify({ error: 'Not Found' }), { status: 404, headers: { "Content-Type": "application/json" } });
    }

    const body = await req.json() as ApiRequest;
    const ctx: RequestContext = { req, body };

    const composedHandler = withMetrics(withPlayerUrlValidation(handle));
    return await composedHandler(ctx);
}

const handler = baseHandler;

const port = Deno.env.get("PORT") || 8001;
const host = Deno.env.get("HOST") || '0.0.0.0';

await initializeCache();
initializeWorkers();

console.log(`Server listening on http://${host}:${port}`);
await serve(handler, { port: Number(port), hostname: host });