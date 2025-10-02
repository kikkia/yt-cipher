import { cacheSize } from "./metrics.ts";
import { LRU } from "https://deno.land/x/lru@1.0.2/mod.ts";

class InstrumentedLRU extends LRU<string> {
    constructor(private cacheName: string, maxSize: number) {
        super(maxSize);
    }

    override set(key: string, value: string): this {
        super.set(key, value);
        cacheSize.labels({ cache_name: this.cacheName }).set(this.size);
        return this;
    }

    override remove(key: string): void {
        super.remove(key);
        cacheSize.labels({ cache_name: this.cacheName }).set(this.size);
    }
}

// key = hash of player URL
const cacheSizeEnv = Deno.env.get('STS_CACHE_SIZE');
const maxCacheSize = cacheSizeEnv ? parseInt(cacheSizeEnv, 10) : 150;
export const stsCache = new InstrumentedLRU('sts', maxCacheSize);