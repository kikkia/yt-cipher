import { cacheSize } from "./metrics.ts";
import { LRU } from "https://deno.land/x/lru@1.0.2/mod.ts";

export class InstrumentedLRU<T> extends LRU<T> {
    constructor(private cacheName: string, maxSize: number) {
        super(maxSize);
    }

    override set(key: string, value: T): this {
        super.set(key, value);
        cacheSize.labels({ cache_name: this.cacheName }).set(this.size);
        return this;
    }

    override remove(key: string) {
        super.remove(key);
        cacheSize.labels({ cache_name: this.cacheName }).set(this.size);
    }
}
