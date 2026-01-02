import { crypto } from "@std/crypto";

const ALLOWED_HOSTNAMES = ["youtube.com", "www.youtube.com", "m.youtube.com"];

export function validateAndNormalizePlayerUrl(playerUrl: string): string {
    // Handle relative paths
    if (playerUrl.startsWith("/")) {
        if (playerUrl.startsWith("/s/player/")) {
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
    } catch (_e) {
        // Not a valid URL, and not a valid path.
        throw new Error(`Invalid player URL: ${playerUrl}`);
    }
}
export function extractPlayerId(playerUrl: string): string {
    try {
        const url = new URL(playerUrl);
        const pathParts = url.pathname.split("/");
        const playerIndex = pathParts.indexOf("player");
        if (playerIndex !== -1 && playerIndex + 1 < pathParts.length) {
            return pathParts[playerIndex + 1];
        }
    } catch (_e) {
        // Fallback for relative paths
        const match = playerUrl.match(/\/s\/player\/([^\/]+)/);
        if (match) {
            return match[1];
        }
    }
    return "unknown";
}

export async function digestPlayerUrl(playerUrl: string): Promise<string> {
    const hashBuffer = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(playerUrl),
    );
    return Array.from(new Uint8Array(hashBuffer))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
}

export function getTimestamp() {
    return new Date().toISOString().slice(5, 19).replace("T", " ");
}
