import type { InFlight, Task, WorkerWithLimit } from "./types.ts";
import { createTaskQueue } from "./taskQueueDeque.ts";
import { normalizeError, safeCall } from "./utils.ts";

const CONCURRENCY = parseInt(Deno.env.get("MAX_THREADS") || "", 10) || navigator.hardwareConcurrency || 1;

// Keep the per-worker message budget consistent across the module.
// (Optional env override for testing/tuning.)
const parsedMessagesLimit = parseInt(Deno.env.get("MESSAGES_LIMIT") || "", 10);
const MESSAGES_LIMIT = Number.isFinite(parsedMessagesLimit) && parsedMessagesLimit > 0
    ? Math.max(10, Math.floor(parsedMessagesLimit))
    : 10_000;

const workers: WorkerWithLimit[] = [];
const idleWorkerSet = new Set<WorkerWithLimit>();
const idleWorkerStack: WorkerWithLimit[] = [];
const taskQueue = createTaskQueue<Task>();
// Track enqueue timestamps without extending `Task`'s type surface.
const taskEnqueuedAt = new WeakMap<Task, number>();
const inFlightTask = new WeakMap<WorkerWithLimit, InFlight>();
// Workers that currently have an assigned task (purely "in-flight" tracking).
const inFlightWorker = new Set<WorkerWithLimit>();
// Workers that must not accept new tasks and must be retired after their current in-flight work finishes.
const retireAfterFlight: Set<WorkerWithLimit> = new Set<WorkerWithLimit>();

// Backpressure / liveness policies
const MAX_TASK_AGE_MS = 30 * 60 * 1000; // 30 minutes
const IN_FLIGHT_TIMEOUT_MS = 60 * 60 * 1000; // 60 minutes

// When set, the pool is considered "fatally" broken and new work should fail fast.
let poolInitError: Error | null = null;

// Bounded recovery with exponential backoff
const RECOVERY_BACKOFF_BASE_MS = 25;
const RECOVERY_BACKOFF_MAX_MS = 5_000;
const RECOVERY_FAILURE_THRESHOLD = 5;
let recoveryBackoffMs = RECOVERY_BACKOFF_BASE_MS;
let recoveryFailures = 0;

let recoveryTimerId: number | null = null;

let refillScheduled = false;

function removeWorkerFromTracking(worker: WorkerWithLimit) {
    clearIdle(worker);
    const queueIdx = workers.indexOf(worker);
    if (queueIdx >= 0) workers.splice(queueIdx, 1);
}

function retireWorker(worker: WorkerWithLimit) {
    // Defensive: ensure we don't leak message handlers or keep stale in-flight state
    const inFlight = clearInFlight(worker);
    if (inFlight) {
        safeCall(inFlight.task.reject, new Error("Worker was retired while task was in-flight"), {
            label: "inFlight.task.reject(retireWorker)",
            log: true,
        });
    }

    removeWorkerFromTracking(worker);
    safeCall(worker.terminate.bind(worker), {
        label: "worker.terminate(retireWorker)",
        log: true,
    });
    retireAfterFlight.delete(worker);
}

function scheduleRefillAndDispatch() {
    // If we've latched a fatal failure, fail fast and drain anything still queued.
    if (poolInitError) {
        drainAndRejectQueuedTasks(poolInitError);
        return;
    }

    // Avoid immediate recursive microtask rescheduling and avoid piling up timers.
    if (refillScheduled) return;
    refillScheduled = true;

    queueMicrotask(() => {
        refillScheduled = false;

        // If a backoff timer is already pending, let it drive the next attempt.
        if (recoveryTimerId !== null) return;

        try {
            fillWorkers();
            // Opportunistically compact the stack.
            // Extra pops for stale entries may eventually slow down dispatch.
            if (idleWorkerStack.length > (16 + idleWorkerSet.size * 2)) {
                idleWorkerStack.length = 0;
                idleWorkerStack.push(...idleWorkerSet);
            }
            dispatch();

            // Successful run: reset failure counter/backoff.
            recoveryFailures = 0;
            recoveryBackoffMs = RECOVERY_BACKOFF_BASE_MS;
        } catch (err) {
            const e = err instanceof Error ? err : new Error(String(err));
            recoveryFailures += 1;

            console.error(
                `Worker pool refill/dispatch failed (attempt ${recoveryFailures}/${RECOVERY_FAILURE_THRESHOLD}); will retry with backoff:`,
                e,
            );

            // Suspicious state recovery:
            // - Keep queued tasks intact so they can be processed after recovery.
            // - Do NOT clear in-flight handlers for tracked workers here; allow in-flight work to complete normally.
            // - Quarantine all tracked workers by draining `workers` and setting their budget to 0.
            // - Retire all currently-idle workers immediately.
            // - Any quarantined worker that is not actually in-flight has no path to be observed/released,
            //   so terminate it now to avoid "zombie" workers.

            const quarantined: WorkerWithLimit[] = [];
            const retireImmediately = new Set<WorkerWithLimit>();
            while (workers.length > 0) {
                const w = workers.pop()!;
                w.messagesRemaining = 0;
                quarantined.push(w);
                // Track the workers being allowed to finish their assignments.
                // When called below, retireWorker is expected to remove from both of these sets.
                retireAfterFlight.add(w);
                if (inFlightTask.has(w)) {
                    inFlightWorker.add(w);
                } else {
                    retireImmediately.add(w);
                }
            }
            const quarantinedSet = new Set(quarantined);

            while (idleWorkerStack.length > 0) {
                const idleWorker = idleWorkerStack.pop()!;
                if (!idleWorkerSet.has(idleWorker)) continue; // stale entry
                clearIdle(idleWorker); // now reserved (not idle)
                retireImmediately.add(idleWorker);
            }
            // Defensive: after quarantine/recovery, discard any lingering idle markers
            // to avoid stale bookkeeping blocking future scheduling.
            idleWorkerSet.clear();

            // Terminate quarantined workers that are not actually in-flight.
            for (const w of retireImmediately) {
                retireWorker(w);
            }

            // Consistency check: every worker we believe is in-flight must have been quarantined.
            // If an unexpected in-flight worker exists, reject/cleanup/terminate it.
            for (const w of [...inFlightWorker]) {
                if (quarantinedSet.has(w)) continue;
                console.error("Found unexpected in-flight worker during recovery; rejecting and terminating it.");
                try {
                    const inFlight = clearInFlight(w);
                    if (inFlight) {
                        safeCall(inFlight.task.reject, new Error("Worker was unexpectedly found in-flight"), {
                            label: "inFlight.task.reject(recovery)",
                            log: true
                        });
                    }
                } finally {
                    retireWorker(w);
                    // scheduleRefillAndDispatch(); // already here
                }
            }

            /**
             * TODO: Enable this after decisions are made or remove it.
            // If we've exceeded our bounded recovery threshold, latch the pool failure and drain queued tasks.
            if (recoveryFailures >= RECOVERY_FAILURE_THRESHOLD) {
                poolInitError ??= new Error(
                    `Worker pool failed to recover after ${recoveryFailures} attempts: ${e.message}`,
                );
                drainAndRejectQueuedTasks(poolInitError);
                return;
            }
            */

            // Exponential backoff with cap (no immediate recursive microtasks).
            const delay = Math.min(recoveryBackoffMs, RECOVERY_BACKOFF_MAX_MS);
            recoveryBackoffMs = Math.min(recoveryBackoffMs * 2, RECOVERY_BACKOFF_MAX_MS);

            recoveryTimerId = setTimeout(() => {
                recoveryTimerId = null;
                scheduleRefillAndDispatch();
            }, delay) as unknown as number;
        }
    });
}

function releaseWorker(
    worker: WorkerWithLimit,
    overrideSchedule: boolean = false,
) {
    let schedule = (workers.length < CONCURRENCY);

    // Quarantine marker takes precedence: never return to idle once quarantined.
    if (retireAfterFlight.has(worker)) {
        // This was likely already zero, but set it anyway
        worker.messagesRemaining = 0;
        retireWorker(worker);
    } else if (worker.messagesRemaining > 0) {
        // Worker can take more work
        setIdle(worker);
    } else {
        // Worker hit its limit; remove & replace
        retireWorker(worker);
        schedule = true;
    }

    if (overrideSchedule) return;
    // Keep the pool healthy and keep draining the queue
    if (schedule || taskQueue.length > 0)
        scheduleRefillAndDispatch();
}

function setIdle(worker: WorkerWithLimit) {
    if (idleWorkerSet.has(worker)) return; // avoid stack duplicates
    idleWorkerStack.push(worker);
    idleWorkerSet.add(worker);
}

function setInFlight(worker: WorkerWithLimit, task: Task) {
    inFlightWorker.add(worker);

    const timeoutId = setTimeout(() => {
        try {
            const inFlight = clearInFlight(worker);
            if (inFlight) {
                safeCall(inFlight.task.reject, new Error("Worker task timed out"), {
                    label: "inFlight.task.reject(timeout)",
                    log: true,
                });
            }
        } finally {
            retireWorker(worker);
            scheduleRefillAndDispatch();
        }
    }, IN_FLIGHT_TIMEOUT_MS) as unknown as number;

    inFlightTask.set(worker, { task, timeoutId } as InFlight);
}

function clearIdle(worker: WorkerWithLimit): boolean {
    const wasIdle = idleWorkerSet.delete(worker);
    return wasIdle;
}

function clearInFlight(worker: WorkerWithLimit): InFlight | undefined {
    const inFlight = inFlightTask.get(worker);
    try {
        if (inFlight) {
            const timeoutId = inFlight.timeoutId;
            if (typeof timeoutId === "number") clearTimeout(timeoutId);
        }
    } finally {
        inFlightTask.delete(worker);
        inFlightWorker.delete(worker);
    }
    return inFlight;
}

const workerMessageHandlerAttached = new WeakSet<WorkerWithLimit>();
function attachPermanentHandlers(worker: WorkerWithLimit) {
    if (workerMessageHandlerAttached.has(worker)) return;
    workerMessageHandlerAttached.add(worker);

    worker.addEventListener("message", (e: MessageEvent) => {
        const { type, data } = (e.data ?? {}) as { type?: string; data?: any };

        // Look up the current in-flight record for THIS worker.
        const inFlight = inFlightTask.get(worker);
        if (!inFlight) {
            // Stray message: worker responded but we don't think it has a task.
            // Treat as unhealthy to avoid corrupting queue semantics.
            console.error("Worker sent message but no in-flight task was tracked; retiring worker.");
            worker.messagesRemaining = 0;
            retireWorker(worker);
            scheduleRefillAndDispatch();
            return;
        }

        const task = inFlight.task;

        try {
            // Clear in-flight first to avoid re-entrancy / duplicate settle.
            clearInFlight(worker);

            if (type === "success") {
                if (typeof data === "string") {
                    safeCall(task.resolve, data, { label: "task.resolve", log: true });
                } else {
                    // Malformed response: mark worker as unhealthy
                    worker.messagesRemaining = 0;
                    safeCall(task.reject, new Error("Worker returned non-string success payload"), {
                        label: "task.reject(nonStringSuccess)",
                        log: true,
                    });
                }
            } else {
                // Treat worker-reported errors as unhealthy (as you already do)
                worker.messagesRemaining = 0;

                console.error("Received error from worker:", data);
                const err = new Error(data?.message ?? "Worker error");
                err.stack = data?.stack;
                safeCall(task.reject, err, { label: "task.reject(workerError)", log: true });
            }
        } finally {
            releaseWorker(worker);
        }
    });

    worker.addEventListener("messageerror", () => {
        console.error("Worker message deserialization failed");
        try {
            const inFlight = inFlightTask.get(worker);
            if (inFlight) {
                clearInFlight(worker);
                safeCall(inFlight.task.reject, new Error("Worker message deserialization failed"), {
                    label: "inFlight.task.reject(messageerror)",
                    log: true,
                });
            }
        } finally {
            retireWorker(worker);
            scheduleRefillAndDispatch();
        }
    });

    worker.addEventListener("error", (ev: ErrorEvent) => {
        console.error("Worker crashed:", ev.message);
        try {
            const inFlight = inFlightTask.get(worker);
            if (inFlight) {
                clearInFlight(worker);
                safeCall(inFlight.task.reject, new Error(`Worker crashed: ${ev.message}`), {
                    label: "inFlight.task.reject(workerCrash)",
                    log: true,
                });
            }
        } finally {
            retireWorker(worker);
            scheduleRefillAndDispatch();
        }
    });
}

function createWorker(): WorkerWithLimit {
    const url = new URL("../worker.ts", import.meta.url);
    const worker = new Worker(url.href, { type: "module" }) as WorkerWithLimit;

    if (!Object.isExtensible(worker)) {
        safeCall(worker.terminate.bind(worker), {
            label: "worker.terminate(createWorker)",
            log: true,
        });
        throw new Error("Worker instance is not extensible; cannot attach pool metadata");
    }

    try {
        // Set and lock the limit
        Object.defineProperty(worker, "messagesLimit", {
            value: MESSAGES_LIMIT,
            configurable: false,
            writable: false,
            enumerable: true,
        });

        // Mutable, but not removable/re-definable pool metadata.
        Object.defineProperty(worker, "messagesRemaining", {
            value: MESSAGES_LIMIT,
            configurable: false,
            writable: true,
            enumerable: true,
        });

        // handlers are available for use immediately
        attachPermanentHandlers(worker);
    } catch (e) {
        safeCall(worker.terminate.bind(worker), {
            label: "worker.terminate(createWorker)",
            log: true,
        });
        throw normalizeError(e);
    }

    return worker;
}

function takeIdleWorker(): WorkerWithLimit | undefined {
    while (idleWorkerStack.length > 0) {
        const w = idleWorkerStack.pop()!;
        if (!idleWorkerSet.has(w)) continue; // stale entry
        if (!Number.isFinite(w.messagesRemaining) || w.messagesRemaining <= 0 || retireAfterFlight.has(w)) {
            w.messagesRemaining = 0;
            releaseWorker(w, true); // do not schedule
            continue;
        }
        clearIdle(w); // now reserved (not idle)
        return w;
    }
    if (workers.length < CONCURRENCY)
        scheduleRefillAndDispatch();
    return undefined;
}

function dispatch() {
    const now = Date.now();
    let idleWorker: ReturnType<typeof takeIdleWorker>;
    while (taskQueue.length > 0 && undefined !== (idleWorker = takeIdleWorker())) {
        const worker = idleWorker; // capture for closure
        const task = taskQueue.shift()!;
        const enqueuedAt = taskEnqueuedAt.get(task) ?? now;
        if (enqueuedAt < (now - MAX_TASK_AGE_MS)) {
            try {
                safeCall(task.reject, new Error("Task was queued longer than allowed"), { label: "task.reject(maxAge)", log: true });
            } finally {
                releaseWorker(worker);
            }
            continue;
        }

        try {
            worker.messagesRemaining -= 1;
            setInFlight(worker, task);
            worker.postMessage(task.data);
        } catch (err) {
            // Worker may be unusable; replace it to avoid pool deadlocks.
            worker.messagesRemaining = 0;
            try {
                const inFlight = clearInFlight(worker);
                if (inFlight) {
                    safeCall(inFlight.task.reject, err, { label: "task.reject(postMessageFailure)", log: true });
                }
            } finally {
                releaseWorker(worker);
            }
        }
    }
}

function drainAndRejectQueuedTasks(err: Error) {
    while (taskQueue.length > 0) {
        const t = taskQueue.shift()!;
        safeCall(t.reject, err, { label: "t.reject(drain)", log: true });
    }
}

export function execInPool(data: string): Promise<string> {
    return new Promise((resolve, reject) => {
        // TODO: Before enabling `poolInitError` by setting it anywhere:
        // - Define what counts as a *fatal* pool failure (only worker construction? repeated crashes? permissions?).
        // - Decide if/when it should be cleared (never vs. on later successful `fillWorkers()`).
        // - Decide whether callers should always fail fast or whether retry/backoff should be attempted.
        // Until those decisions are made, `poolInitError` should remain unset (null).
        if (poolInitError) {
            safeCall(reject, poolInitError, {
                label: "reject(execInPool)",
                log: true,
            });
            return;
        }

        const task: Task = { data, resolve, reject };
        taskEnqueuedAt.set(task, Date.now());
        taskQueue.push(task);
        scheduleRefillAndDispatch();
    });
}

function fillWorkers() {
    while (workers.length < CONCURRENCY) {
        const worker = createWorker();

        workers.push(worker);
        setIdle(worker);
    }
}

export function initializeWorkers() {
    fillWorkers();
    console.log(`Initialized ${CONCURRENCY} workers`);
}

