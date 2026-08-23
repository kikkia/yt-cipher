import type { RequestContext } from "./types.ts";

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


export function validateGeneration(body: any): string | undefined {
    if (body.content_binding !== undefined && (typeof body.content_binding !== 'string' || body.content_binding.length === 0)) {
        return 'content_binding must be a non-empty string when provided';
    }
    if (body.content_binding?.length > 8192) return 'content_binding is too long';
    if (body.coldToken !== undefined && typeof body.coldToken !== 'boolean') {
        return 'coldToken must be a boolean when provided';
    }
}

export function validateColdStartDecode(body: any): string | undefined {
    if (typeof body.token !== 'string' || body.token.length === 0) return 'token must be a non-empty string';
    if (body.token.length > 4096) return 'token is too long';
}

function badRequest(error: string): Response {
    return new Response(JSON.stringify({ error }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
    });
}

export function withValidation(handler: Next): Next {
    return async (ctx: RequestContext) => {
        const { pathname } = new URL(ctx.req.url);
        const body = ctx.body as any;

        if (typeof body !== 'object' || body === null || Array.isArray(body)) {
            return badRequest('request body must be a JSON object');
        }

        if (pathname === '/generate' || pathname === '/decode_cold_start') {
            const error = pathname === '/generate' ? validateGeneration(body) : validateColdStartDecode(body);
            return error ? badRequest(error) : handler(ctx);
        }

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

        const { isValid, errors } = validateObject(body, schema);

        if (!isValid) {
            return badRequest(`Invalid request body: ${errors.join(', ')}`);
        }

        return handler(ctx);
    };
}
