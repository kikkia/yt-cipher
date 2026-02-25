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
export function extractPlayerType(playerUrl: string): string {
    try {
        const path = playerUrl.startsWith('https') ? new URL(playerUrl).pathname : playerUrl;
        const pathParts = path.split('/');
        const vflsetPart = pathParts.find(p => p.includes('.vflset'));

        if (vflsetPart) {
            const typePart = vflsetPart.split('.vflset')[0];
            if (typePart.startsWith('player_')) {
                return typePart.substring('player_'.length);
            }
            if (typePart.startsWith('tv-player-')) {
                return typePart.substring('tv-player-'.length);
            }
            if (typePart.startsWith('player-')) {
                return typePart.substring('player-'.length);
            }
            return typePart;
        }
    } catch (e) {
        // URL parsing failed or other error.
    }

    // I havent seen any non vflset types, but this fallback will show them.
    const pathSegments = playerUrl.split('/');
    return pathSegments.find(p => p.includes('player')) ?? 'unknown';
}