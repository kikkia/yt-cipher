import { serve } from "https://deno.land/std@0.140.0/http/server.ts";
import { initializeWorkers } from "./src/workerPool.ts";
import { initializeCache } from "./src/playerCache.ts";
import { handleDecryptSignature } from "./src/handlers/decryptSignature.ts";
import { handleGetSts } from "./src/handlers/getSts.ts";
import { prometheusExporter, httpRequestsTotal, httpRequestDurationSeconds, httpRequestsErrorsTotal } from "./src/monitoring.ts";

const API_TOKEN = Deno.env.get("API_TOKEN");

async function handler(req: Request): Promise<Response> {
    const { pathname } = new URL(req.url);

    if (pathname === '/metrics') {
        return await prometheusExporter.export();
    }

    const authHeader = req.headers.get("authorization");
    if (API_TOKEN && API_TOKEN !== "") {
        if (authHeader !== API_TOKEN) {
            const error = authHeader ? 'Invalid API token' : 'Missing API token';
            return new Response(JSON.stringify({ error }), { status: 401, headers: { "Content-Type": "application/json" } });
        }
    }

    if (req.method !== 'POST') {
        return new Response(null, { status: 404, headers: { "Content-Type": "application/json" } });
    }

    try {
        if (pathname === '/decrypt_signature') {
            return await handleDecryptSignature(req);
        } else if (pathname === '/get_sts') {
            return await handleGetSts(req);
        } else {
            return new Response(JSON.stringify({ error: 'Not Found' }), { status: 404, headers: { "Content-Type": "application/json" } });
        }
    } catch (error) {
        console.error(error);
        return new Response(JSON.stringify({ error: 'Internal Server Error', message: error.message }), { status: 500, headers: { "Content-Type": "application/json" } });
    }
}

async function monitoringMiddleware(req: Request, next: (req: Request) => Promise<Response>): Promise<Response> {
    const { pathname } = new URL(req.url);

    // Do not record metrics for the metrics endpoint itself
    if (pathname === '/metrics') {
        return await next(req);
    }

    const attributes = { pathname };
    httpRequestsTotal.add(1, attributes);
    const startTime = performance.now();
    try {
        const response = await next(req);
        const duration = (performance.now() - startTime) / 1000;
        httpRequestDurationSeconds.record(duration, attributes);
        if (response.status >= 500) {
            httpRequestsErrorsTotal.add(1, attributes);
        }
        return response;
    } catch (error) {
        httpRequestsErrorsTotal.add(1, attributes);
        throw error;
    }
}

const port = Deno.env.get("PORT") || 8001;
const host = Deno.env.get("HOST") || '0.0.0.0';

await initializeCache();
initializeWorkers();

console.log(`Server listening on http://${host}:${port}`);
await serve((req) => monitoringMiddleware(req, handler), { port: Number(port), hostname: host });