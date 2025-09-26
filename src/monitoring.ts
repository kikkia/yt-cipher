import {
    MeterProvider,
    Counter,
    Histogram,
    Gauge,
    PrometheusExporter,
} from "./deps.ts";

const exporter = new PrometheusExporter();

const meterProvider = new MeterProvider({
    exporter: exporter,
    interval: 5000,
});

const meter = meterProvider.getMeter("yt-cipher");

export const httpRequestsTotal = meter.createCounter("http_requests_total", {
    description: "Total number of HTTP requests",
});

export const httpRequestDurationSeconds = meter.createHistogram("http_request_duration_seconds", {
    description: "HTTP request duration in seconds",
});

export const httpRequestsErrorsTotal = meter.createCounter("http_requests_errors_total", {
    description: "Total number of HTTP requests that resulted in an error",
});

export const cacheHitsTotal = meter.createCounter("cache_hits_total", {
    description: "Total number of cache hits",
});

export const cacheMissesTotal = meter.createCounter("cache_misses_total", {
    description: "Total number of cache misses",
});

export const cacheSize = meter.createGauge("cache_size", {
    description: "Total number of items in the cache",
});

export const prometheusExporter = exporter;