import { InstrumentedLRU } from "../instrumentedCache.ts";
import { potokenGenerations } from "../metrics.ts";
import type { PotResult } from "./botguard.ts";
import { getVisitorData } from "./visitor.ts";

function num(name: string, fallback: number): number {
    const parsed = parseInt(Deno.env.get(name) || "", 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const WORKER_COUNT = num("POT_WORKERS", 1);
const CACHE_SIZE = num("POT_CACHE_SIZE", 100);
const MAX_PENDING = num("POT_MAX_PENDING", 256);
const REQUEST_TIMEOUT = num("POT_REQUEST_TIMEOUT", 30000);
const VISITOR_TTL = num("VISITOR_TTL", 6 * 60 * 60 * 1000);

// Content-bound tokens are short lived; visitor-bound ones live as long as the visitor data does.
const POT_TTL = 150_000;
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

export class PotError extends Error {
    constructor(message: string, readonly code: 'QUEUE_FULL' | 'TIMEOUT' | 'GENERATION_FAILED') {
        super(message);
        this.name = 'PotError';
    }
}

interface Entry {
    value: PotResult;
    expires: number;
}

// LruCache bounds size but has no TTL, and @std/cache's TtlCache is unbounded, so expiry rides
// along on the entry and is checked on read.
const potCache = new InstrumentedLRU<Entry>('potoken', CACHE_SIZE);
const visitorCache = new InstrumentedLRU<Entry>('visitor', CACHE_SIZE);

function cacheGet(cache: InstrumentedLRU<Entry>, key: string): PotResult | undefined {
    const entry = cache.get(key);
    if (!entry) return;

    if (entry.expires <= Date.now()) {
        cache.remove(key);
        return;
    }

    return entry.value;
}

interface PotWorker {
    worker: Worker;
    inFlight: number;
}

interface PendingTask {
    owner: PotWorker;
    timer: ReturnType<typeof setTimeout>;
    resolve: (value: PotResult) => void;
    reject: (error: Error) => void;
}

const workers: PotWorker[] = [];
const pending = new Map<number, PendingTask>();
const inFlightByBinding = new Map<string, Promise<PotResult>>();
let nextId = 1;
let roundRobin = 0;

function settle(id: number, settleTask: (task: PendingTask) => void) {
    const task = pending.get(id);
    if (!task) return;

    pending.delete(id);
    clearTimeout(task.timer);
    task.owner.inFlight--;
    settleTask(task);
}

function spawn(): PotWorker {
    const entry: PotWorker = {
        worker: new Worker(new URL("./worker.ts", import.meta.url).href, { type: "module" }),
        inFlight: 0,
    };

    entry.worker.onmessage = (e: MessageEvent) => {
        const { id, type, data } = e.data;
        settle(id, (task) =>
            type === 'success'
                ? task.resolve(data as PotResult)
                : task.reject(new PotError(data?.message || 'generation failed', 'GENERATION_FAILED'))
        );
    };

    entry.worker.onerror = (e: ErrorEvent) => {
        e.preventDefault();
        console.error("PoToken worker error:", e.message);

        const index = workers.indexOf(entry);
        if (index >= 0) workers.splice(index, 1);

        for (const [id, task] of pending) {
            if (task.owner === entry) {
                settle(id, (t) => t.reject(new PotError(e.message || 'worker died', 'GENERATION_FAILED')));
            }
        }

        entry.worker.terminate();
        workers.push(spawn());
    };

    return entry;
}

export function initializePotWorkers() {
    for (let i = 0; i < WORKER_COUNT; i++) {
        workers.push(spawn());
    }
    console.log(`Initialized ${WORKER_COUNT} PoToken worker(s)`);
}

function mint(contentBinding: string): Promise<PotResult> {
    if (pending.size >= MAX_PENDING) {
        return Promise.reject(new PotError('service overloaded', 'QUEUE_FULL'));
    }

    if (workers.length === 0) {
        return Promise.reject(new PotError('no PoToken workers available', 'GENERATION_FAILED'));
    }

    const owner = workers.reduce((a, b) => (b.inFlight < a.inFlight ? b : a), workers[roundRobin++ % workers.length]);
    const id = nextId++;

    return new Promise<PotResult>((resolve, reject) => {
        const timer = setTimeout(
            () => settle(id, (task) => task.reject(new PotError('generation timed out', 'TIMEOUT'))),
            REQUEST_TIMEOUT,
        );

        pending.set(id, { owner, timer, resolve, reject });
        owner.inFlight++;
        owner.worker.postMessage({ id, contentBinding });
    });
}

/**
 * Resolves a PoToken for `explicitBinding`, or for freshly fetched visitor data when omitted.
 *
 * Video ids and auto-derived visitor data are cached; an explicitly supplied non-video binding is
 * not, since the caller owns its lifetime.
 */
export async function generatePot(explicitBinding?: string): Promise<PotResult> {
    const contentBinding = explicitBinding ?? await getVisitorData(VISITOR_TTL, REQUEST_TIMEOUT);
    const isVideo = VIDEO_ID.test(contentBinding);
    const shouldCache = isVideo || explicitBinding === undefined;
    const cache = isVideo ? potCache : visitorCache;

    if (shouldCache) {
        const hit = cacheGet(cache, contentBinding);
        if (hit) {
            potokenGenerations.labels({ outcome: 'cache_hit' }).inc();
            return hit;
        }
    }

    const existing = inFlightByBinding.get(contentBinding);
    if (existing) return existing;

    const promise = mint(contentBinding)
        .then((result) => {
            potokenGenerations.labels({ outcome: 'success' }).inc();
            if (shouldCache) {
                cache.set(contentBinding, { value: result, expires: Date.now() + (isVideo ? POT_TTL : VISITOR_TTL) });
            }
            return result;
        })
        .catch((error) => {
            potokenGenerations.labels({ outcome: 'error' }).inc();
            throw error;
        })
        .finally(() => inFlightByBinding.delete(contentBinding));

    inFlightByBinding.set(contentBinding, promise);

    return promise;
}
