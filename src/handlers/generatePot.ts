import { createColdStartToken } from "../potoken/botguard.ts";
import { generatePot, PotError } from "../potoken/pool.ts";
import type { PotRequest, PotResponse, RequestContext } from "../types.ts";

const STATUS: Record<PotError['code'], [number, string]> = {
    QUEUE_FULL: [503, 'service overloaded'],
    TIMEOUT: [504, 'generation timed out'],
    GENERATION_FAILED: [500, 'generation failed'],
};

export async function handleGeneratePot(ctx: RequestContext): Promise<Response> {
    const body = ctx.body as PotRequest;

    try {
        const result = await generatePot(body.content_binding);
        const response: PotResponse = { ...result };

        if (body.coldToken === true) {
            response.coldStartToken = createColdStartToken(result.contentBinding) || null;
        }

        return new Response(JSON.stringify(response), {
            status: 200,
            headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
        });
    } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        console.error(`WebPO generation failed: ${message}`);

        const [status, error] = e instanceof PotError ? STATUS[e.code] : STATUS.GENERATION_FAILED;

        return new Response(JSON.stringify({ error }), {
            status,
            headers: { "Content-Type": "application/json" },
        });
    }
}
