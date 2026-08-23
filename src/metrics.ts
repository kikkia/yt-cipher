import {
    Counter,
    Gauge,
    Registry,
} from "https://deno.land/x/ts_prometheus/mod.ts";

export const registry = new Registry();

export const endpointHits = Counter.with({
    name: "http_requests_total",
    help: "Total number of HTTP requests.",
    labels: ["pathname", "player_id", "player_type"],
    registry: [registry],
});

export const userAgentRequests = Counter.with({
    name: "http_requests_by_user_agent_total",
    help: "Total number of HTTP requests by user agent.",
    labels: ["user_agent"],
    registry: [registry],
});

export const responseCodes = Counter.with({
    name: "http_responses_total",
    help: "Total number of HTTP responses.",
    labels: ["pathname", "status", "player_id", "player_type"],
    registry: [registry],
});

export const workerErrors = Counter.with({
    name: "worker_errors_total",
    help: "Total number of worker errors.",
    labels: ["player_id", "player_type", "message"],
    registry: [registry],
});

export const playerScriptOverwrites = Counter.with({
    name: "player_script_overwrites_total",
    help: "Total number of player script overwrites, e.g. when forcing a specific player version.",
    labels: ["type", "source", "forced"],
    registry: [registry],
});

export const cacheSize = Gauge.with({
    name: "cache_size",
    help: "The number of items in the cache.",
    labels: ["cache_name"],
    registry: [registry],
});

export const playerUrlRequests = Counter.with({
    name: "player_url_requests_total",
    help: "Total number of requests for each player ID.",
    labels: ["player_id", "player_type"],
    registry: [registry],
});

export const playerScriptFetches = Counter.with({
    name: "player_script_fetches_total",
    help: "Total number of player script fetches by response status.",
    labels: ["status"],
    registry: [registry],
});

export const potokenGenerations = Counter.with({
    name: "potoken_generations_total",
    help: "Total number of PoToken requests by outcome.",
    labels: ["outcome"],
    registry: [registry],
});
