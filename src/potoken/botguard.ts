// Ported from https://github.com/ashton045/webpo-generator (LGPL-3.0-or-later). See src/potoken/LICENSE.
// BotGuard attestation logic originates from https://github.com/LuanRT/BgUtils

import { JSDOM, VirtualConsole } from "npm:jsdom@^29.1.1";
import {
    COLD_START_MAX_BINDING_BYTES,
    INNERTUBE_API_KEY,
    REQUEST_KEY,
    TV_CONFIG,
    TV_USER_AGENT,
    USER_AGENT,
    WEB_CLIENT_NAME,
    WEB_CLIENT_VERSION,
    YT_BASE,
} from "./constants.ts";
import { base64ToUint8, buildURL, parse_json, Uint8ToBase64 } from "./helpers.ts";

interface BgChallenge {
    messageId?: unknown;
    program: unknown;
    globalName: string;
    interpreterHash?: unknown;
    interpreterUrl?: { privateDoNotAccessOrElseTrustedResourceUrlWrappedValue?: string };
    interpreterJavascript?: { privateDoNotAccessOrElseSafeScriptWrappedValue?: string };
}

export interface PotResult {
    poToken: string;
    contentBinding: string;
}

export interface ColdStartInfo {
    contentBinding: string;
    timestamp: number;
    unknownVal: number;
    clientState: number;
    keys: [number, number];
    date: Date;
}

function release_dom(dom: any) {
    if (!dom) return;

    if ((globalThis as any).window === dom.window) {
        for (const property of ['window', 'document', 'location', 'origin', 'yt']) {
            try {
                delete (globalThis as any)[property];
            } catch {
                (globalThis as any)[property] = undefined;
            }
        }
    }

    dom.window.close();
}

function parse_waa_challenge(raw_data: any): { bgChallenge: BgChallenge } | undefined {
    if (raw_data?.[0]?.bgChallenge) return raw_data[0];

    let challenge_data: any;

    if (raw_data?.length > 1 && typeof raw_data[1] === 'string') {
        const bytes = base64ToUint8(raw_data[1]);
        challenge_data = JSON.parse(new TextDecoder().decode(bytes.map((value) => value + 97)));
    } else if (Array.isArray(raw_data?.[0])) {
        challenge_data = raw_data[0];
    }

    if (!Array.isArray(challenge_data)) return;

    const [message_id, wrapped_script, wrapped_url, interpreter_hash, program, global_name] = challenge_data;
    const script = Array.isArray(wrapped_script) ? wrapped_script.find((value) => typeof value === 'string') : undefined;
    const interpreter_url = Array.isArray(wrapped_url) ? wrapped_url.find((value) => typeof value === 'string') : undefined;

    if (!program || !global_name || (!interpreter_url && !script)) return;

    return {
        bgChallenge: {
            messageId: message_id,
            program,
            globalName: global_name,
            interpreterHash: interpreter_hash,
            interpreterUrl: interpreter_url
                ? { privateDoNotAccessOrElseTrustedResourceUrlWrappedValue: interpreter_url }
                : undefined,
            interpreterJavascript: { privateDoNotAccessOrElseSafeScriptWrappedValue: script },
        },
    };
}

export async function create_bg(options: { program: unknown; globalName: string; globalObject: any; userInteractionElement?: unknown }) {
    const vm = options.globalObject[options.globalName];

    if (!vm || !vm.a) throw new Error('BotGuard VM unavailable');

    const vm_functions = Promise.withResolvers<any>();

    const callback = (async_snapshot: any, shutdown: any, pass_event: any, check_camera: any) => {
        vm_functions.resolve({ async_snapshot, shutdown, pass_event, check_camera });
    };

    const sync_snapshot = await vm.a(
        options.program,
        callback,
        true,
        options.userInteractionElement,
        () => {},
        [[], []],
        undefined,
        false,
        [],
    )?.[0];

    return {
        async snapshot(args: any, timeout = 3000) {
            const { async_snapshot } = await vm_functions.promise;

            return await new Promise((resolve, reject) => {
                const timer = setTimeout(() => reject(new Error('VM operation timed out')), timeout);

                async_snapshot((res: unknown) => {
                    clearTimeout(timer);
                    resolve(res);
                }, [args.contentBinding, args.signedTimestamp, args.webPoSignalOutput, args.skipPrivacyBuffer]);
            });
        },
        async pass_event(args: unknown) {
            const { pass_event } = await vm_functions.promise;
            return pass_event?.(args);
        },
        async check_camera(args: unknown) {
            const { check_camera } = await vm_functions.promise;
            return check_camera?.(args);
        },
        async shutdown() {
            const { shutdown } = await vm_functions.promise;
            return shutdown?.();
        },
        async snapshot_synchronous(args: any) {
            if (!sync_snapshot) throw new Error('synchronous snapshot function not found');
            return sync_snapshot([args.contentBinding, args.signedTimestamp, args.webPoSignalOutput, args.skipPrivacyBuffer]);
        },
    };
}

type BgClient = Awaited<ReturnType<typeof create_bg>>;

class Minter {
    private active = 0;
    private retired = false;
    private closed = false;

    constructor(
        private callback: (bytes: Uint8Array) => Promise<Uint8Array>,
        private client: BgClient | undefined,
        private dom: any,
    ) {}

    static async create(
        integrityToken: { integrity_token?: string },
        webPoSignalOutput: any[],
        client: BgClient,
        dom: any,
    ): Promise<Minter> {
        const getMinter = webPoSignalOutput[0];

        if (!getMinter || !integrityToken.integrity_token) throw new Error('Could not create WebPO minter');

        const callback = await getMinter(base64ToUint8(integrityToken.integrity_token));

        if (!(callback instanceof Function)) throw new Error('WebPO minter unavailable');

        return new Minter(callback, client, dom);
    }

    retire() {
        this.retired = true;
        this.close_idles();
    }

    private close_idles() {
        if (!this.retired || this.active > 0 || this.closed) return;

        this.closed = true;
        release_dom(this.dom);

        Promise.resolve(this.client?.shutdown?.()).catch(() => {});
    }

    async mintAsWebsafeString(contentBinding: string): Promise<string> {
        this.active++;

        try {
            return Uint8ToBase64(await this.callback(new TextEncoder().encode(contentBinding)), true);
        } finally {
            this.active--;
            this.close_idles();
        }
    }
}

let minter_promise: Promise<Minter> | undefined;
let expires = 0;
let cur: Minter | undefined;

/**
 * Builds (or reuses) a WebPO minter for this isolate.
 *
 * The minter closes over its own JSDOM window and the BotGuard VM installed on `globalThis`, so it
 * cannot be moved between isolates and only one can be live at a time here. Callers must therefore
 * keep this module inside a dedicated long-lived worker.
 */
export async function getWebPo(useYouTubeAPI = true): Promise<Minter> {
    if (minter_promise && (expires === 0 || expires > Date.now())) return minter_promise;

    cur?.retire();
    cur = undefined;
    minter_promise = undefined;

    let runtime_dom: any;

    minter_promise = (async () => {
        const virtualConsole = new VirtualConsole().forwardTo(console, {
            jsdomErrors: ["unhandled-exception", "resource-loading", "css-parsing"],
        });

        const dom = new JSDOM(
            '<!DOCTYPE html><html lang="en"><head><title></title></head><body></body></html>',
            {
                url: YT_BASE,
                referrer: `${YT_BASE}/`,
                userAgent: USER_AGENT,
                virtualConsole,
            },
        );

        runtime_dom = dom;

        // Upstream can `Object.assign(globalThis, ...)` because Node worker threads have no global
        // `location`. A Deno worker does, as a getter-only accessor on DedicatedWorkerGlobalScope,
        // so assigning throws "Cannot set property location ... which has only a getter" and the
        // mint fails. Defining own properties shadows the prototype accessor instead, and stays
        // deletable for release_dom().
        for (const [property, value] of Object.entries({
            window: dom.window,
            document: dom.window.document,
            location: dom.window.location,
            origin: dom.window.origin,
        })) {
            Object.defineProperty(globalThis, property, {
                value,
                writable: true,
                configurable: true,
                enumerable: true,
            });
        }

        let key = REQUEST_KEY;
        let challenge: { bgChallenge?: BgChallenge } | undefined;

        try {
            const res = await fetch(YT_BASE, {
                headers: {
                    'accept': '*/*',
                    'accept-language': 'en-US,en;q=0.7',
                    'user-agent': USER_AGENT,
                },
            });

            const txt = await res.text();
            const config = txt.match(/ytcfg\.set\(({.+?})\);/s)?.[1];

            if (config) {
                (dom.window as any).yt = { config_: JSON.parse(config) };
                (globalThis as any).yt = (dom.window as any).yt;
            }

            const attestation = txt.match(/window\.ytAtN\(\s*({[\s\S]*?})\s*\)/);
            challenge = attestation ? parse_json(attestation[1]).R : undefined;
        } catch {
        }

        if (!challenge?.bgChallenge) {
            try {
                const res = await fetch(TV_CONFIG, { headers: { accept: '*/*', 'user-agent': TV_USER_AGENT } });
                const txt = await res.text();

                if (!txt.startsWith(')]}')) throw new Error('invalid yt tv config response');

                const json = JSON.parse(txt.slice(4));

                challenge = json.challengeParams?.R ? JSON.parse(json.challengeParams.R) : undefined;
                key = json.challengeRequestKey || key;
            } catch {
                challenge = undefined;
            }
        }

        if (!challenge?.bgChallenge) {
            const waa_res = await fetch(buildURL('Create', false), {
                method: 'POST',
                headers: {
                    'content-type': 'application/json+protobuf',
                    'x-goog-api-key': INNERTUBE_API_KEY,
                    'x-user-agent': 'grpc-web-javascript/0.1',
                    'user-agent': USER_AGENT,
                },
                body: JSON.stringify([key]),
            });

            if (!waa_res.ok) throw new Error(`WAA Create returned ${waa_res.status}`);

            challenge = parse_waa_challenge(await waa_res.json());
        }

        if (!challenge?.bgChallenge) {
            try {
                const att_res = await fetch(`${YT_BASE}/youtubei/v1/att/get?prettyPrint=false`, {
                    method: 'POST',
                    headers: {
                        'accept': '*/*',
                        'content-type': 'application/json',
                        'user-agent': USER_AGENT,
                        'x-goog-api-key': INNERTUBE_API_KEY,
                    },
                    body: JSON.stringify({
                        context: { client: { clientName: WEB_CLIENT_NAME, clientVersion: WEB_CLIENT_VERSION } },
                        engagementType: 'ENGAGEMENT_TYPE_UNBOUND',
                    }),
                });

                if (!att_res.ok) throw new Error(`att/get returned ${att_res.status}`);

                const attestation = await att_res.json();

                if (!attestation?.bgChallenge) throw new Error('could not get challenge from att/get');

                challenge = { bgChallenge: attestation.bgChallenge };
            } catch {
                challenge = undefined;
            }
        }

        if (!challenge?.bgChallenge) throw new Error('Could not get botguard challenge');

        const interpreterUrl = challenge.bgChallenge.interpreterUrl?.privateDoNotAccessOrElseTrustedResourceUrlWrappedValue;
        const inlineInterpreter = challenge.bgChallenge.interpreterJavascript?.privateDoNotAccessOrElseSafeScriptWrappedValue;
        const interpreter = inlineInterpreter ||
            (interpreterUrl ? await (await fetch(`https:${interpreterUrl}`)).text() : '');

        if (!interpreter) throw new Error("couldn't load botguard interpreter");

        new Function(interpreter)();

        const client = await create_bg({
            program: challenge.bgChallenge.program,
            globalName: challenge.bgChallenge.globalName,
            globalObject: globalThis,
        });

        const signals: any[] = [];
        const res = await client.snapshot({ webPoSignalOutput: signals });

        const t_res = await fetch(buildURL('GenerateIT', useYouTubeAPI), {
            method: 'POST',
            headers: {
                'content-type': 'application/json+protobuf',
                'x-goog-api-key': INNERTUBE_API_KEY,
                'x-user-agent': 'grpc-web-javascript/0.1',
            },
            body: JSON.stringify([key, res]),
        });

        if (!t_res.ok) throw new Error(`GenerateIT returned ${t_res.status}`);

        const [integrity_token, estimated_ttl_secs] = await t_res.json();
        const minter = await Minter.create({ integrity_token }, signals, client, dom);

        cur = minter;

        const ttl = Number(estimated_ttl_secs);
        expires = Date.now() + Math.max(1, (Number.isFinite(ttl) && ttl > 0 ? ttl : 300) - 30) * 1000;

        return minter;
    })();

    try {
        return await minter_promise;
    } catch (error) {
        release_dom(runtime_dom);
        minter_promise = undefined;
        expires = 0;
        throw error;
    }
}

export async function fetch_pot(contentBinding: string, useYouTubeAPI = true): Promise<PotResult> {
    const minter = await getWebPo(useYouTubeAPI);

    return {
        poToken: await minter.mintAsWebsafeString(contentBinding),
        contentBinding,
    };
}


export function createColdStartToken(contentBinding: string, clientState = 1): string | undefined {
    const bytecode = new TextEncoder().encode(contentBinding);

    if (bytecode.length > COLD_START_MAX_BINDING_BYTES) return;

    const timestamp = Math.floor(Date.now() / 1000);
    const rand_keys = [Math.floor(Math.random() * 256), Math.floor(Math.random() * 256)];

    const header = rand_keys.concat([0, clientState], [
        (timestamp >> 24) & 0xff,
        (timestamp >> 16) & 0xff,
        (timestamp >> 8) & 0xff,
        timestamp & 0xff,
    ]);

    const packet = new Uint8Array(2 + header.length + bytecode.length);

    packet[0] = 34;
    packet[1] = header.length + bytecode.length;
    packet.set(header, 2);
    packet.set(bytecode, 2 + header.length);

    const payload = packet.subarray(2);

    for (let i = 2; i < payload.length; i++) {
        payload[i] = payload[i] ^ payload[i % 2];
    }

    return Uint8ToBase64(packet, true);
}

export function decodeColdStartToken(token: string): ColdStartInfo {
    const packet = base64ToUint8(token);

    if (packet.length < 10 || packet[0] !== 34) throw new Error('invalid cold start token');

    const length = packet[1];
    if (packet.length !== length + 2 || length < 8) throw new Error('invalid cold start packet length');

    const payload = packet.slice(2);
    for (let i = 2; i < payload.length; i++) {
        payload[i] = payload[i] ^ payload[i % 2];
    }

    const timestamp = ((payload[4] << 24) | (payload[5] << 16) | (payload[6] << 8) | payload[7]) >>> 0;

    return {
        contentBinding: new TextDecoder().decode(payload.subarray(8)),
        timestamp,
        unknownVal: payload[2],
        clientState: payload[3],
        keys: [payload[0], payload[1]],
        date: new Date(timestamp * 1000),
    };
}
