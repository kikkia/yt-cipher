import type { SafeCallOptions } from "./types.ts";

const ALLOWED_HOSTNAMES = ["youtube.com", "www.youtube.com", "m.youtube.com"];

export function validateAndNormalizePlayerUrl(playerUrl: string): string {
    // Handle relative paths
    if (playerUrl.startsWith('/')) {
        if (playerUrl.startsWith('/s/player/')) {
             return `https://www.youtube.com${playerUrl}`;
        }
        throw new Error(`Invalid player path: ${playerUrl}`);
    }

    // Handle absolute URLs
    try {
        const url = new URL(playerUrl);
        if (ALLOWED_HOSTNAMES.includes(url.hostname)) {
            return playerUrl;
        } else {
            throw new Error(`Player URL from invalid host: ${url.hostname}`);
        }
    } catch (e) {
        // Not a valid URL, and not a valid path.
        throw new Error(`Invalid player URL: ${playerUrl}`);
    }
}
export function extractPlayerId(playerUrl: string): string {
    try {
        const url = new URL(playerUrl);
        const pathParts = url.pathname.split('/');
        const playerIndex = pathParts.indexOf('player');
        if (playerIndex !== -1 && playerIndex + 1 < pathParts.length) {
            return pathParts[playerIndex + 1];
        }
    } catch (e) {
        // Fallback for relative paths
        const match = playerUrl.match(/\/s\/player\/([^\/]+)/);
        if (match) {
            return match[1];
        }
    }
    return 'unknown';
}
function looksLikeSafeCallOptions(v: unknown): v is SafeCallOptions {
    if (v === null || typeof v !== "object") return false;
    const o = v as Record<string, unknown>;

    // If present, validate types
    if ("label" in o && o.label !== undefined && typeof o.label !== "string") return false;

    if ("log" in o && o.log !== undefined) {
        const log = o.log;
        if (typeof log !== "boolean" && typeof log !== "function") return false;
    }

    if ("onError" in o && o.onError !== undefined && typeof o.onError !== "function") return false;

    // Only consider it options if it has at least one of the known keys
    return ("label" in o) || ("log" in o) || ("onError" in o);
}

/**
 * Calls `fn` safely (swallows exceptions), optionally logging and/or invoking `onError`.
 *
 * Preserves `this` by applying the function with the caller's `this`.
 * - Typical usage: safeCall(task.resolve, data)
 * - If you need to preserve a specific receiver: safeCall.call(obj, obj.method, arg)
 */
export function safeCall(fn: unknown, ...args: unknown[]): unknown {
    if (typeof fn !== "function") return undefined;

    let options: SafeCallOptions | undefined;
    if (args.length > 0 && looksLikeSafeCallOptions(args[args.length - 1])) {
        options = args.pop() as SafeCallOptions;
    }

    const label = options?.label ?? "safeCall";

    try {
        // Preserve the caller-provided receiver exactly.
        // In module/strict mode, `this` is typically `undefined` for plain calls.
        const receiver = this as unknown;
        return Reflect.apply(fn, receiver, args);
    } catch (err) {
        try {
            options?.onError?.(err);
        } catch {
            // ignore onError throws
        }

        const log = options?.log;
        if (typeof log === "function") {
            try {
                log(label, err);
            } catch {
                // ignore logger throws
            }
        } else if (log) {
            const prefix = options?.label ? `[safeCall:${label}]` : "[safeCall]";
            console.error(prefix, err);
        }

        return undefined;
    }
}

export function normalizeError(err: unknown, message?: string): Error {
    if (err instanceof Error) {
        return message ? new Error(message, { cause: err }) : err;
    }

    let derived: string;
    if (message !== undefined) {
        derived = message;
    } else if (typeof err === "string") {
        derived = err;
    } else if (err && typeof err === "object") {
        const maybeMessage = (err as { message?: unknown }).message;
        if (typeof maybeMessage === "string" && maybeMessage.length > 0) {
            derived = maybeMessage;
        } else {
            try {
                derived = JSON.stringify(err);
            } catch {
                derived = String(err);
            }
        }
    } else {
        derived = String(err);
    }

    // Preserve the original thrown value for debugging.
    return new Error(derived, { cause: err });
}
