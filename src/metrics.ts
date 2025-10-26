import {
    Counter,
    Gauge,
    Histogram,
    Registry,
} from "https://deno.land/x/ts_prometheus/mod.ts";

export const registry = new Registry();

// Default buckets for http request duration
const httpBuckets = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];

export const endpointHits = Counter.with({
    name: "http_requests_total",
    help: "Total number of HTTP requests.",
    labels: ["method", "pathname", "player_id", "plugin_version", "user_agent"],
    registry: [registry],
});

export const responseCodes = Counter.with({
    name: "http_responses_total",
    help: "Total number of HTTP responses.",
    labels: ["method", "pathname", "status", "player_id", "plugin_version", "user_agent"],
    registry: [registry],
});

export const workerErrors = Counter.with({
    name: "worker_errors_total",
    help: "Total number of worker errors.",
    labels: ["player_id", "message"],
    registry: [registry],
});

export const endpointLatency = Histogram.with({
    name: "http_request_duration_seconds",
    help: "HTTP request duration in seconds.",
    labels: ["method", "pathname", "player_id", "cached"],
    buckets: httpBuckets,
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
    labels: ["player_id"],
    registry: [registry],
});

export const playerScriptFetches = Counter.with({
    name: "player_script_fetches_total",
    help: "Total number of player script fetches.",
    labels: ["player_url", "status"],
    registry: [registry],
});