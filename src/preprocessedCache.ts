import { InstrumentedLRU } from "./instrumentedCache.ts";

// The key is the hash of the player URL, and the value is the preprocessed script content.
const cacheSizeEnv = Deno.env.get("PREPROCESSED_CACHE_SIZE");
const maxCacheSize = cacheSizeEnv ? parseInt(cacheSizeEnv, 10) : 150;
export const preprocessedCache = new InstrumentedLRU<string>(
    "preprocessed",
    maxCacheSize,
);
