import type { ApiRequest, RequestContext } from "./types.ts";
import { validateAndNormalizePlayerUrl } from "./utils.ts";

type Next = (ctx: RequestContext) => Promise<Response>;
type ValidationSchema = {
    [key: string]: (value: any) => boolean;
};

const signatureRequestSchema: ValidationSchema = {
    player_url: (val) => typeof val === 'string',
};

const stsRequestSchema: ValidationSchema = {
    player_url: (val) => typeof val === 'string',
};

const resolveUrlRequestSchema: ValidationSchema = {
    player_url: (val) => typeof val === 'string',
    stream_url: (val) => typeof val === 'string',
};

function validateObject(obj: any, schema: ValidationSchema): { isValid: boolean, errors: string[] } {
    const errors: string[] = [];
    for (const key in schema) {
        if (!obj.hasOwnProperty(key) || !schema[key](obj[key])) {
            errors.push(`'${key}' is missing or invalid`);
        }
    }
    return { isValid: errors.length === 0, errors };
}

export function withValidation(handler: Next): Next {
    return async (ctx: RequestContext) => {
        const { pathname } = new URL(ctx.req.url);

        let schema: ValidationSchema;
        if (pathname === '/decrypt_signature') {
            schema = signatureRequestSchema;
        } else if (pathname === '/get_sts') {
            schema = stsRequestSchema;
        } else if (pathname === '/resolve_url') {
            schema = resolveUrlRequestSchema;
        } else {
            return handler(ctx);
        }
        
        const body = ctx.body as ApiRequest;

        const { isValid, errors } = validateObject(body, schema);

        if (!isValid) {
            return new Response(JSON.stringify({ error: `Invalid request body: ${errors.join(', ')}` }), {
                status: 400,
                headers: { "Content-Type": "application/json" },
            });
        }
        
        try {
            const normalizedUrl = validateAndNormalizePlayerUrl(body.player_url);
            // mutate the context with the normalized URL
            ctx.body.player_url = normalizedUrl;
        } catch (e) {
            return new Response(JSON.stringify({ error: (e as Error).message }), {
                status: 400,
                headers: { "Content-Type": "application/json" },
            });
        }

        return handler(ctx);
    };
}