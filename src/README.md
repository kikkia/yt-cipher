## Environment variables

### `API_TOKEN`
Optional token to protect the API endpoints (used by [`server.ts`](../server.ts)).

- Type: string
- Default: unset (no token enforcement, depending on server implementation)
- Behavior:
  - If set, clients must provide the expected token (e.g., via header/query — see [`server.ts`](../server.ts)) to access the API.

### `HOST`
IP address the HTTP server binds to (used by [`server.ts`](../server.ts)).

- Type: string
- Default: `0.0.0.0`

### `PORT`
Port the HTTP server listens on (used by [`server.ts`](../server.ts)).

- Type: integer
- Default: `8001`

### `HOME`
Home directory, used only as a fallback when `XDG_CACHE_HOME` is unset.

- Type: string (path)
- Default: platform-dependent

### `IGNORE_SCRIPT_REGION`
Controls whether the player script region is ignored when caching player scripts (used by [`src/playerCache.ts`](./playerCache.ts)).

- Type: boolean-like string
- Default: `false`
- Behavior:
  - Set to `"true"` (string) to enable.

### `XDG_CACHE_HOME`
Base directory for caches (used by [`src/playerCache.ts`](./playerCache.ts) for `CACHE_HOME`).

- Type: string (path)
- Default: `$HOME/.cache`

### `PREPROCESSED_CACHE_SIZE`
Max size (or entry limit, depending on implementation) for the preprocessed cache (used by [`src/preprocessedCache.ts`](./preprocessedCache.ts)).

- Type: integer
- Default: implementation-defined if unset (see [`src/preprocessedCache.ts`](./preprocessedCache.ts))

### `SOLVER_CACHE_SIZE`
Max size (or entry limit) for the solver cache (used by [`src/solverCache.ts`](./solverCache.ts)).

- Type: integer
- Default: implementation-defined if unset (see [`src/solverCache.ts`](./solverCache.ts))

### `STS_CACHE_SIZE`
Max size (or entry limit) for the STS cache (used by [`src/stsCache.ts`](./stsCache.ts)).

- Type: integer
- Default: implementation-defined if unset (see [`src/stsCache.ts`](./stsCache.ts))

### `TASK_QUEUE_DEQUE_IMPL`
Selects which deque implementation backs the internal task queue (used by the worker pool).

- Type: string
- Default: `alg`
- Allowed: `alg`, `korkje`, `native`
- Behavior:
  - `alg`: uses `jsr:@alg/deque`
  - `korkje`: uses `jsr:@korkje/deque`
  - `native`: uses a head-indexed Array (with O(N) unshift behavior)

### `MAX_THREADS`
Controls the maximum number of workers used by the pool (used by [`src/workerPool.ts`](./workerPool.ts))

- Type: integer
- Default: `navigator.hardwareConcurrency` (or `1` if unavailable)
- Behavior:
  - If set to a valid integer, the pool will create up to that many workers.
  - If unset/invalid, the pool falls back to `navigator.hardwareConcurrency`, then `1`.

### `MESSAGES_LIMIT`
Controls how many tasks (messages) a single worker will process before being retired and replaced (used by [`src/workerPool.ts`](./workerPool.ts))

This helps prevent long-lived workers from accumulating memory/garbage collection pressure over time.

- Type: integer
- Default: `10000`
- Behavior:
  - If set to a positive integer, each worker starts with that message budget.
  - When a worker reaches `0` remaining messages, it is terminated and replaced.

