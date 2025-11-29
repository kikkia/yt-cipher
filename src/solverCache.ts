import { InstrumentedLRU } from "./instrumentedCache.ts";
import type { Solvers } from "./types.ts";

// key = hash of the player url
const cacheSizeEnv = Deno.env.get("SOLVER_CACHE_SIZE");
const maxCacheSize = cacheSizeEnv ? parseInt(cacheSizeEnv, 10) : 50;
export const solverCache = new InstrumentedLRU<Solvers>("solver", maxCacheSize);
