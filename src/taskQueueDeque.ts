import type { TaskQueue } from "./types.ts";

import { Deque as AlgDeque } from "jsr:@alg/deque";
import { Deque as KorkjeDeque } from "jsr:@korkje/deque";

type DequeImpl = "alg" | "korkje";

function getDequeImpl(): DequeImpl {
    const v = (Deno.env.get("TASK_QUEUE_DEQUE_IMPL") || "").toLowerCase();
    if (v === "korkje") return "korkje";
    return "alg";
}

export function createTaskQueue<T>(): TaskQueue<T> {
    const impl = getDequeImpl();
    return impl === "korkje"
        ? new KorkjeTaskQueueAdapter<T>()
        : new AlgTaskQueueAdapter<T>();
}

class AlgTaskQueueAdapter<T> implements TaskQueue<T> {
    // implements blocks of arrays
    private readonly dq = new AlgDeque<T>();

    public push(item: T): number {
        // Match Array#push: commonly returns new length; if underlying deque doesn’t, return length ourselves.
        this.dq.pushBack(item);
        return this.length;
    }

    public shift(): T | undefined {
        // Match Array#shift
        let value: T;
        try {
            value = this.dq.popFront();
        } catch {
            return undefined;
        }
        return value;
    }

    public get length(): number {
        return this.dq.length;
    }
}

class KorkjeTaskQueueAdapter<T> implements TaskQueue<T> {
    // manages an underlying array with a ring buffer
    private readonly dq = new KorkjeDeque<T>();

    public push(item: T): number {
        return this.dq.push(item);
    }

    public shift(): T | undefined {
        return this.dq.shift();
    }

    public get length(): number {
        return this.dq.length;
    }
}
