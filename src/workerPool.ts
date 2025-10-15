import type { WorkerWithStatus, Task } from "./types.ts";

const CONCURRENCY = parseInt(Deno.env.get("MAX_THREADS") || "", 10) || navigator.hardwareConcurrency || 1;

const workers: WorkerWithStatus[] = [];
const taskQueue: Task[] = [];

function dispatch() {
    const idleWorker = workers.find(w => w.isIdle);
    if (!idleWorker || taskQueue.length === 0) {
        return;
    }

    const task = taskQueue.shift()!;
    idleWorker.isIdle = false;

    const messageHandler = (e: MessageEvent) => {
        idleWorker.removeEventListener("message", messageHandler);
        idleWorker.isIdle = true;

        const { type, data } = e.data;
        if (type === 'success') {
            task.resolve(data);
        } else {
            const err = new Error(data.message);
            err.stack = data.stack;
            task.reject(err);
        }
        dispatch(); // keep checking
    };

    idleWorker.addEventListener("message", messageHandler);
    idleWorker.postMessage(task.data);
}

export function execInPool(data: string): Promise<string> {
    return new Promise((resolve, reject) => {
        taskQueue.push({ data, resolve, reject });
        dispatch();
    });
}

export function initializeWorkers() {
    for (let i = 0; i < CONCURRENCY; i++) {
        const worker: WorkerWithStatus = new Worker(new URL("../worker.ts", import.meta.url).href, { type: "module" });
        worker.isIdle = true;
        workers.push(worker);
    }
    console.log(`Initialized ${CONCURRENCY} workers`);
}