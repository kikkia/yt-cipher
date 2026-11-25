export type Labels = Record<string, string>;

export function escapeHelpString(help: string): string {
    return help
        .replace(/\\/g, "\\\\")
        .replace(/\n/g, "\\n");
}

export function escapeLabelValue(value: string): string {
    return value
        .replace(/\\/g, "\\\\")
        .replace(/"/g, '\\"')
        .replace(/\n/g, "\\n");
}

function isValidMetricName(name: string): boolean {
    return /^[a-zA-Z_:][a-zA-Z0-9_:]*$/.test(name);
}

function isValidLabelName(label: string): boolean {
    return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(label);
}

function formatLabels(labelNames: string[], labels: Labels): string {
    for (const key of Object.keys(labels)) {
        if (!labelNames.includes(key)) {
            throw new Error(`label with name ${key} not defined`);
        }
    }

    const parts: string[] = [];
    for (const name of labelNames) {
        const value = labels[name];
        if (value !== undefined) {
            parts.push(`${name}="${escapeLabelValue(value)}"`);
        }
    }
    return parts.length > 0 ? `{${parts.join(",")}}` : "";
}

interface SeriesEntry {
    value: number;
    lastUpdatedAt: number;
}

export interface Collector {
    readonly name: string;
    readonly help: string;
    readonly type: "counter" | "gauge";
    pruneExpired(now?: number): number;
    exposeLines(now?: number): string[];
}

export class Registry {
    private collectors = new Map<string, Collector>();
    private cleanupTimerId: number | undefined;

    register(collector: Collector): void {
        if (this.collectors.has(collector.name)) {
            throw new Error(`a collector with name ${collector.name} has been registered`);
        }
        this.collectors.set(collector.name, collector);
    }

    unregister(collector: Collector): void {
        this.collectors.delete(collector.name);
    }

    clear(): void {
        this.collectors.clear();
    }

    pruneExpired(now: number = Date.now()): number {
        let removed = 0;
        for (const collector of this.collectors.values()) {
            removed += collector.pruneExpired(now);
        }
        return removed;
    }

    startCleanupInterval(intervalMs: number): void {
        this.stopCleanupInterval();
        if (intervalMs <= 0) return;
        this.cleanupTimerId = setInterval(() => {
            this.pruneExpired();
        }, intervalMs);
        Deno.unrefTimer(this.cleanupTimerId);
    }

    stopCleanupInterval(): void {
        if (this.cleanupTimerId !== undefined) {
            clearInterval(this.cleanupTimerId);
            this.cleanupTimerId = undefined;
        }
    }

    metrics(now: number = Date.now()): string {
        const sections: string[] = [];
        for (const collector of this.collectors.values()) {
            const lines = collector.exposeLines(now);
            if (lines.length === 0) continue;
            sections.push(
                `# HELP ${collector.name} ${collector.help}\n# TYPE ${collector.name} ${collector.type}\n${lines.join("\n")}\n`,
            );
        }
        return sections.join("\n");
    }
}

export interface CounterConfig {
    name: string;
    help: string;
    labels?: string[];
    registry?: Registry[];
    /** Drop series that have not been incremented for longer than this duration (ms). Omit or <= 0 to disable. */
    staleTtlMs?: number;
    /** Maximum number of distinct non-overflow series to keep at once. */
    maxSeries?: number;
    /** Label overrides applied when maxSeries is reached so remaining labels (e.g. status) are preserved. */
    overflowLabels?: Labels;
    /** Optional clock function (primarily for tests). */
    now?: () => number;
}

export class Counter implements Collector {
    readonly name: string;
    readonly help: string;
    readonly type = "counter" as const;

    private readonly labelNames: string[];
    private readonly staleTtlMs?: number;
    private readonly maxSeries?: number;
    private readonly overflowLabels?: Labels;
    private readonly nowFn: () => number;
    private readonly series = new Map<string, SeriesEntry>();
    private readonly overflowKeys = new Set<string>();

    static with(config: CounterConfig): Counter {
        return new Counter(config);
    }

    private constructor(config: CounterConfig) {
        if (!isValidMetricName(config.name)) {
            throw new Error(`invalid metric name: ${config.name}`);
        }
        const labelNames = config.labels ?? [];
        for (const label of labelNames) {
            if (!isValidLabelName(label)) {
                throw new Error(`invalid label name: ${label}`);
            }
        }
        if (config.overflowLabels) {
            for (const key of Object.keys(config.overflowLabels)) {
                if (!labelNames.includes(key)) {
                    throw new Error(`overflow label with name ${key} not defined`);
                }
            }
        }

        this.name = config.name;
        this.help = escapeHelpString(config.help);
        this.labelNames = labelNames;
        this.staleTtlMs = config.staleTtlMs && config.staleTtlMs > 0 ? config.staleTtlMs : undefined;
        this.maxSeries = config.maxSeries && config.maxSeries > 0 ? config.maxSeries : undefined;
        this.overflowLabels = config.overflowLabels;
        this.nowFn = config.now ?? Date.now;

        if (config.registry) {
            for (const reg of config.registry) {
                reg.register(this);
            }
        }
    }

    labels(labels: Labels): { inc: (n?: number) => void; value: () => number | undefined } {
        const key = formatLabels(this.labelNames, labels);
        return {
            inc: (n: number = 1) => this.incKey(key, labels, n),
            value: () => this.series.get(key)?.value,
        };
    }

    inc(n: number = 1): void {
        this.incKey("", {}, n);
    }

    private incKey(key: string, labels: Labels, n: number): void {
        if (n < 0) {
            throw new Error("it is not possible to decrease a counter");
        }
        const now = this.nowFn();
        const existing = this.series.get(key);
        if (existing !== undefined) {
            existing.value += n;
            existing.lastUpdatedAt = now;
            return;
        }

        let targetKey = key;
        let isOverflow = false;

        if (this.maxSeries !== undefined && this.nonOverflowSize() >= this.maxSeries) {
            this.pruneExpired(now);
            if (this.nonOverflowSize() >= this.maxSeries) {
                if (this.overflowLabels) {
                    targetKey = formatLabels(this.labelNames, { ...labels, ...this.overflowLabels });
                    isOverflow = true;
                } else {
                    this.evictOldest();
                }
            }
        }

        const target = this.series.get(targetKey);
        if (target !== undefined) {
            target.value += n;
            target.lastUpdatedAt = now;
            return;
        }

        this.series.set(targetKey, { value: n, lastUpdatedAt: now });
        if (isOverflow) {
            this.overflowKeys.add(targetKey);
        }
    }

    private nonOverflowSize(): number {
        return this.series.size - this.overflowKeys.size;
    }

    private evictOldest(): void {
        let oldestKey: string | undefined;
        let oldestTime = Infinity;
        for (const [k, entry] of this.series) {
            if (entry.lastUpdatedAt < oldestTime) {
                oldestTime = entry.lastUpdatedAt;
                oldestKey = k;
            }
        }
        if (oldestKey !== undefined) {
            this.series.delete(oldestKey);
            this.overflowKeys.delete(oldestKey);
        }
    }

    pruneExpired(now: number = this.nowFn()): number {
        if (this.staleTtlMs === undefined) return 0;
        let removed = 0;
        for (const [key, entry] of this.series) {
            if (now - entry.lastUpdatedAt > this.staleTtlMs) {
                this.series.delete(key);
                this.overflowKeys.delete(key);
                removed++;
            }
        }
        return removed;
    }

    exposeLines(now: number = this.nowFn()): string[] {
        this.pruneExpired(now);
        const lines: string[] = [];
        for (const [labelStr, entry] of this.series) {
            lines.push(`${this.name}${labelStr} ${entry.value}`);
        }
        return lines;
    }

    get size(): number {
        return this.series.size;
    }
}

export interface GaugeConfig {
    name: string;
    help: string;
    labels?: string[];
    registry?: Registry[];
    now?: () => number;
}

export class Gauge implements Collector {
    readonly name: string;
    readonly help: string;
    readonly type = "gauge" as const;

    private readonly labelNames: string[];
    private readonly nowFn: () => number;
    private readonly series = new Map<string, SeriesEntry>();

    static with(config: GaugeConfig): Gauge {
        return new Gauge(config);
    }

    private constructor(config: GaugeConfig) {
        if (!isValidMetricName(config.name)) {
            throw new Error(`invalid metric name: ${config.name}`);
        }
        const labelNames = config.labels ?? [];
        for (const label of labelNames) {
            if (!isValidLabelName(label)) {
                throw new Error(`invalid label name: ${label}`);
            }
        }

        this.name = config.name;
        this.help = escapeHelpString(config.help);
        this.labelNames = labelNames;
        this.nowFn = config.now ?? Date.now;

        if (config.registry) {
            for (const reg of config.registry) {
                reg.register(this);
            }
        }
    }

    labels(labels: Labels): {
        inc: (n?: number) => void;
        dec: (n?: number) => void;
        set: (n: number) => void;
        value: () => number | undefined;
    } {
        const key = formatLabels(this.labelNames, labels);
        return {
            inc: (n: number = 1) => this.update(key, (v) => v + n),
            dec: (n: number = 1) => this.update(key, (v) => v - n),
            set: (n: number) => this.setKey(key, n),
            value: () => this.series.get(key)?.value,
        };
    }

    set(n: number): void {
        this.setKey("", n);
    }

    private setKey(key: string, n: number): void {
        this.series.set(key, { value: n, lastUpdatedAt: this.nowFn() });
    }

    private update(key: string, fn: (current: number) => number): void {
        const now = this.nowFn();
        const existing = this.series.get(key);
        if (existing !== undefined) {
            existing.value = fn(existing.value);
            existing.lastUpdatedAt = now;
        } else {
            this.series.set(key, { value: fn(0), lastUpdatedAt: now });
        }
    }

    pruneExpired(): number {
        return 0;
    }

    exposeLines(): string[] {
        const lines: string[] = [];
        for (const [labelStr, entry] of this.series) {
            lines.push(`${this.name}${labelStr} ${entry.value}`);
        }
        return lines;
    }
}
