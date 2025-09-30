import { cacheSize } from "./metrics.ts";

class InstrumentedMap<K, V> extends Map<K, V> {
    constructor(private cacheName: string) {
        super();
    }

    set(key: K, value: V): this {
        super.set(key, value);
        cacheSize.labels({ cache_name: this.cacheName }).set(this.size);
        return this;
    }

    delete(key: K): boolean {
        const deleted = super.delete(key);
        if (deleted) {
            cacheSize.labels({ cache_name: this.cacheName }).set(this.size);
        }
        return deleted;
    }

    clear(): void {
        super.clear();
        cacheSize.labels({ cache_name: this.cacheName }).set(0);
    }
}

// The key is the hash of the player URL, and the value is the preprocessed script content.
export const preprocessedCache = new InstrumentedMap<string, string>('preprocessed');