import { cacheSize } from "./metrics.ts";
import { LruCache } from "@std/cache";

export class InstrumentedLRU<T> extends LruCache<string, T> {
    constructor(private cacheName: string, maxSize: number) {
        super(maxSize);
    }

    override set(key: string, value: T): this {
        super.set(key, value);
        cacheSize.labels({ cache_name: this.cacheName }).set(this.size);
        return this;
    }

    override delete(key: string): boolean {
        const result = super.delete(key);
        cacheSize.labels({ cache_name: this.cacheName }).set(this.size);
        return result;
    }

    override clear(): void {
        super.clear();
        cacheSize.labels({ cache_name: this.cacheName }).set(this.size);
    }

    public remove(key: string): void {
        this.delete(key);
    }
}
