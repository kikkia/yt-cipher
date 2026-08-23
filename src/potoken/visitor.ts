// Ported from https://github.com/ashton045/webpo-generator (LGPL-3.0-or-later). See src/potoken/LICENSE.

import {
    USER_AGENT,
    VISITOR_ID_ENDPOINT,
    WEB_CLIENT_ID,
    WEB_CLIENT_NAME,
    WEB_CLIENT_VERSION,
    YT_BASE,
} from "./constants.ts";

let visitorData: string | undefined;
let visitorExpires = 0;
let inFlight: Promise<string> | undefined;

function extract(value: unknown): string | undefined {
    if (!value || typeof value !== 'object') return;

    const obj = value as Record<string, unknown>;

    if (typeof obj.VISITOR_DATA === 'string') return obj.VISITOR_DATA;
    if (typeof obj.visitorData === 'string') return obj.visitorData;
    if (typeof obj.visitor_id === 'string') return obj.visitor_id;

    for (const child of Object.values(obj)) {
        const result = extract(child);
        if (result) return result;
    }
}

async function fetchInitialPage(timeout: number): Promise<string> {
    const res = await fetch(YT_BASE, {
        headers: {
            'accept': '*/*',
            'accept-language': 'en-US,en;q=0.9',
            'user-agent': USER_AGENT,
        },
        signal: AbortSignal.timeout(timeout),
    });

    if (!res.ok) throw new Error(`youtube homepage returned ${res.status}`);

    const txt = await res.text();
    const config = txt.match(/ytcfg\.set\(({.+?})\);/s)?.[1];
    const visitor = txt.match(/VISITOR_DATA\s*[:=]\s*["']([^"']+)["']/i)?.[1] ||
        txt.match(/visitorData\s*[:=]\s*["']([^"']+)["']/i)?.[1];
    const result = visitor || (config ? extract(JSON.parse(config)) : undefined);

    if (!result) throw new Error('visitor data was not found in yt initial page');

    return decodeURIComponent(result);
}

async function visitorEndpoint(timeout: number): Promise<string> {
    const res = await fetch(VISITOR_ID_ENDPOINT, {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            'user-agent': USER_AGENT,
            'x-youtube-client-name': WEB_CLIENT_ID,
            'x-youtube-client-version': WEB_CLIENT_VERSION,
        },
        signal: AbortSignal.timeout(timeout),
        body: JSON.stringify({
            context: { client: { clientName: WEB_CLIENT_NAME, clientVersion: WEB_CLIENT_VERSION } },
        }),
    });

    if (!res.ok) throw new Error(`visitor_id returned ${res.status}`);

    const result = extract(await res.json());

    if (!result) throw new Error('visitor data not found');

    return decodeURIComponent(result);
}

export function getVisitorData(ttl: number, timeout = 30000): Promise<string> {
    if (visitorData && visitorExpires > Date.now()) return Promise.resolve(visitorData);

    if (inFlight) return inFlight;

    inFlight = (async () => {
        try {
            return await fetchInitialPage(timeout);
        } catch (e) {
            try {
                return await visitorEndpoint(timeout);
            } catch (e2) {
                const first = e instanceof Error ? e.message : String(e);
                const second = e2 instanceof Error ? e2.message : String(e2);
                throw new Error(`could not generate visitor data: ${first}; ${second}`);
            }
        }
    })().then((v) => {
        visitorData = v;
        visitorExpires = Date.now() + ttl;
        return v;
    }).finally(() => {
        inFlight = undefined;
    });

    return inFlight;
}
