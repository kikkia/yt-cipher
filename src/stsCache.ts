import { InstrumentedLRU } from "./instrumentedCache.ts";

// key = hash of player URL
const cacheSizeEnv = Deno.env.get("STS_CACHE_SIZE");
const maxCacheSize = cacheSizeEnv ? parseInt(cacheSizeEnv, 10) : 150;
export const stsCache = new InstrumentedLRU<string>("sts", maxCacheSize);
