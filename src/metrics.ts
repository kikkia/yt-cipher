import { Counter, Gauge, Registry } from "./prometheus.ts";

const DEFAULT_STALE_TTL_HOURS = 24;
const CLEANUP_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes

function parseStaleTtlMs(): number | undefined {
    const raw = Deno.env.get("METRICS_STALE_TTL_HOURS");
    if (raw === undefined || raw === "") {
        return DEFAULT_STALE_TTL_HOURS * 60 * 60 * 1000;
    }
    const hours = Number(raw);
    if (!Number.isFinite(hours)) {
        return DEFAULT_STALE_TTL_HOURS * 60 * 60 * 1000;
    }
    if (hours <= 0) {
        return undefined;
    }
    return hours * 60 * 60 * 1000;
}

const staleTtlMs = parseStaleTtlMs();

export function sanitizeLabelValue(value: string, maxLength = 128): string {
    const cleaned = value.replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim();
    if (!cleaned) return "unknown";
    return cleaned.length > maxLength ? cleaned.slice(0, maxLength) : cleaned;
}

export const registry = new Registry();
if (staleTtlMs !== undefined) {
    registry.startCleanupInterval(CLEANUP_INTERVAL_MS);
}

export const endpointHits = Counter.with({
    name: "http_requests_total",
    help: "Total number of HTTP requests.",
    labels: ["pathname", "player_id", "player_type"],
    registry: [registry],
    staleTtlMs,
    maxSeries: 2000,
    overflowLabels: { player_id: "other" },
});

export const userAgentRequests = Counter.with({
    name: "http_requests_by_user_agent_total",
    help: "Total number of HTTP requests by user agent.",
    labels: ["user_agent"],
    registry: [registry],
    staleTtlMs,
    maxSeries: 250,
    overflowLabels: { user_agent: "other" },
});

export const responseCodes = Counter.with({
    name: "http_responses_total",
    help: "Total number of HTTP responses.",
    labels: ["pathname", "status", "player_id", "player_type"],
    registry: [registry],
    staleTtlMs,
    maxSeries: 2000,
    overflowLabels: { player_id: "other" },
});

export const workerErrors = Counter.with({
    name: "worker_errors_total",
    help: "Total number of worker errors.",
    labels: ["player_id", "player_type", "message"],
    registry: [registry],
    staleTtlMs,
    maxSeries: 200,
    overflowLabels: { player_id: "other", message: "other" },
});

export const playerScriptOverwrites = Counter.with({
    name: "player_script_overwrites_total",
    help: "Total number of player script overwrites, e.g. when forcing a specific player version.",
    labels: ["type", "source", "forced"],
    registry: [registry],
    staleTtlMs,
    maxSeries: 500,
    overflowLabels: { source: "other" },
});

export const cacheSize = Gauge.with({
    name: "cache_size",
    help: "The number of items in the cache.",
    labels: ["cache_name"],
    registry: [registry],
});

export const playerScriptFetches = Counter.with({
    name: "player_script_fetches_total",
    help: "Total number of player script fetches by response status.",
    labels: ["status"],
    registry: [registry],
});
