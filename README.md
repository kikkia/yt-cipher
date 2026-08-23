# yt-cipher

An http api wrapper for [yt-dlp/ejs](https://github.com/yt-dlp/ejs), plus a built-in WebPO
(`poToken`) generator.

# Getting Started

## Lavalink
The absolute easiest way to use this with Lavalink is to just add this to the youtube plugin config
```yaml
plugins:
  youtube:
    remoteCipher:
      url: "https://cipher.kikkia.dev/"
      userAgent: "your_service_name" # Optional
```

## Public instance

You can use the public instance without a password at `https://cipher.kikkia.dev/`. 
I do my best to keep it up and running and decently fast, but I don't guaruntee 100% uptime. Feel free to host it yourself or use the public API.

WARNING: Ratelimit of 10 requests/sec (should be fine up to 1000+ active players). If you have more than 1k players you probably want to host it yourself.

## Hosting yourself

> [!NOTE]
> Right now only the `IAS` script variants consistantly work. It is reccomended to run with the `OVERRIDE_SCRIPT_VARIANT` env var set to `IAS`

### Docker/Docker-compose

The easiest way to host this service is with Docker (NOTE: Default password in the docker-compose.yml is "test")

```bash
git clone https://github.com/kikkia/yt-cipher.git

cd yt-cipher

docker compose up
```

To pull the latest image and restart the stack after updates:

Linux/macOS:
```bash
./scripts/update-compose.sh
```

Windows (PowerShell):
```powershell
.\scripts\update-compose.ps1
```

### Deno

If you have Deno installed, you can run the service directly.

Clone the repository and patch the `ejs` dependency:

```bash
git clone https://github.com/kikkia/yt-cipher.git
cd yt-cipher
git clone https://github.com/yt-dlp/ejs.git
cd ejs
git checkout cd4e87f52e87ab6d8b318fd3a817adda6fafa8dc
cd ..
deno run --allow-read --allow-write ./scripts/patch-ejs.ts
```

```bash
deno run --allow-net --allow-read --allow-write --allow-env --allow-sys server.ts
```
NOTE: If using an `.env` file then also add the `--env` flag

## Authentication

You can optionally set the `API_TOKEN` environment variable in your `docker-compose.yml` file to require a password to access the service.

Requests without a valid `Authorization: <your_token>` header will be rejected if you have a token set.

## Config

Environment Variables:
- `MAX_THREADS` - max # of workers that can handle requests. Default is 1 per thread on the machine or 1 if it can't determine that for some reason. 
- `API_TOKEN` - A required password to access this service
- `PORT` - Port to run the api on, default: `8001`
- `HOST` - Sets the hostname for the deno server, default: `0.0.0.0`
- `PREPROCESSED_CACHE_SIZE` - Max size of processed player script cache. Lower to consume less memory. default: `150`
- `IGNORE_SCRIPT_REGION` - When set to `true`, this flag modifies the caching behavior of player scripts to disregard regional differences. If your yt-cipher needs to decipher for multiple regions, this can help with memory usage and response time. Default is `false`.
> [!WARNING]
> While no functional differences have been seen between regional scripts in limited testing, a future YouTube change could break yt-cipher. If you encounter any playback issues, please disable this flag and open an issue.

- `OVERRIDE_PLAYER_ID` - Forces all requests to use a specific YouTube player script ID (eg. 1a2b3c4d).
- `OVERRIDE_PLAYER_VARIANT` - Forces all requests to use a specific player variant. Available variants: `IAS`, `IAS_TCC`, `IAS_TCE`, `ES5`, `ES6`, `TV`, `TV_ES6`, `PHONE`, `EMBED`.

PoToken (`/generate`) variables:
- `POT_WORKERS` - Number of dedicated PoToken workers. Each one holds its own BotGuard VM, so more workers means more memory, not more throughput. Default: `1`
- `POT_CACHE_SIZE` - Max entries per PoToken cache (one for video-bound, one for visitor-bound). Default: `100`
- `POT_MAX_PENDING` - Max PoToken requests in flight before returning `503`. Default: `256`
- `POT_REQUEST_TIMEOUT` - Per-request PoToken timeout in ms. Default: `30000`
- `VISITOR_TTL` - How long fetched visitor data (and its PoToken) is reused, in ms. Default: `21600000` (6h)

## IPv6 Support

To run the server with IPv6, you need to configure the `HOST` environment variable.

- Set `HOST` to `[::]` to bind to all available IPv6 and IPv4 addresses on most modern operating systems.

When accessing the service over IPv6, make sure to use the correct address format. For example, to access the service running on localhost, you would use `http://[::1]:8001/`.

## Lavalink Config

If you are using this with the [youtube-source](https://github.com/lavalink-devs/youtube-source) plugin, please reference the [setup steps](https://github.com/lavalink-devs/youtube-source?tab=readme-ov-file#using-a-remote-cipher-server).

### Timeout issues
If you ever have issues with read timeout errors, you can try upping the http timeouts in your lavalink config
```yaml
lavalink:
  server:
    timeouts:
      connectTimeoutMs: 10000
      connectionRequestTimeoutMs: 10000
      socketTimeoutMs: 10000
```

## API Specification

### `POST /decrypt_signature`

**Request Body:**

```json
{
  "encrypted_signature": "...",
  "n_param": "...",
  "player_url": "..."
}
```

- `encrypted_signature` (string): The encrypted signature from the video stream.
- `n_param` (string): The `n` parameter value.
- `player_url` (string): The URL to the JavaScript player file that contains the decryption logic.

**Successful Response:**

```json
{
  "decrypted_signature": "...",
  "decrypted_n_sig": "..."
}
```

**Example `curl` request:**

```bash
curl -X POST http://localhost:8001/decrypt_signature \
-H "Content-Type: application/json" \
-H "Authorization: your_secret_token" \
-d '{
  "encrypted_signature": "...",
  "n_param": "...",
  "player_url": "https://..."
}'
```

### `POST /get_sts`

Extracts the signature timestamp (`sts`) from a player script.

**Request Body:**

```json
{
  "player_url": "..."
}
```

- `player_url` (string): The URL to the JavaScript player file.

**Successful Response:**

```json
{
  "sts": "some_timestamp"
}
```

**Example `curl` request:**

```bash
curl -X POST http://localhost:8001/get_sts \
-H "Content-Type: application/json" \
-H "Authorization: your_secret_token" \
-d '{
  "player_url": "https://..."
}'
```


### `POST /resolve_url`

Resolves a raw stream URL by handling the signature and n-parameter decryption, returning a fully constructed and ready-to-use playback URL.

**Request Body:**

```json
{
  "stream_url": "...",
  "player_url": "...",
  "encrypted_signature": "...",
  "signature_key": "...",
  "n_param": "..."
}
```

- `stream_url` (string): The initial stream URL (not video url).
- `player_url` (string): The URL to the JavaScript player file.
- `encrypted_signature` (string): The encrypted signature value.
- `signature_key` (string, optional): The query parameter key to use for the decrypted signature in the final URL. Defaults to `sig`.
- `n_param` (string, optional): The `n` parameter value. If not provided, it will be extracted from the `stream_url`.

**Successful Response:**

```json
{
  "resolved_url": "..."
}
```

### `POST /generate`

Mints a WebPO token (`poToken`) by solving YouTube's BotGuard challenge. This is the `remotePot`
half of the youtube-source config; it needs no `player_url`.

**Request Body:**

```json
{
  "content_binding": "dQw4w9WgXcQ",
  "coldToken": false
}
```

- `content_binding` (string, optional): What to bind the token to, usually an 11 character video ID. Omit it and the service fetches its own visitor data and binds to that.
- `coldToken` (boolean, optional): When `true`, also returns a cold start token for the same binding.

**Successful Response:**

```json
{
  "poToken": "...",
  "contentBinding": "dQw4w9WgXcQ",
  "coldStartToken": "..."
}
```

`coldStartToken` is only present when `coldToken` was `true`, and is `null` if the binding is too
long to encode.

Video-bound tokens are cached for 150s and visitor-bound ones for `VISITOR_TTL`. An explicitly
supplied non-video binding is never cached. Errors are `503` when overloaded, `504` on timeout,
`500` otherwise.

**Example `curl` request:**

```bash
curl -X POST http://localhost:8001/generate \
-H "Content-Type: application/json" \
-H "Authorization: your_secret_token" \
-d '{"content_binding": "dQw4w9WgXcQ"}'
```

### `POST /decode_cold_start`

Decodes a cold start token. Local only, no network calls.

**Request Body:**

```json
{
  "token": "..."
}
```

**Successful Response:**

```json
{
  "contentBinding": "dQw4w9WgXcQ",
  "timestamp": 1787468875,
  "unknownVal": 0,
  "clientState": 1,
  "keys": [42, 39],
  "date": "2026-08-23T07:07:55.000Z"
}
```

## Tests

```bash
deno test --allow-read src/potoken/potoken_test.ts        # offline, cold start codec
deno run -A test/potoken_playback.ts http://localhost:8001 # live, needs a running server
```

The playback test is the only one that proves a minted `poToken` is one YouTube accepts: it mints
for MWEB, WEB_REMIX and TV_SIMPLY, deciphers a real stream URL for each and range-requests it. It
runs YouTube's player script via `new Function`, same as the server does.

## Credits
The PoToken support in `src/potoken/` is a port of
[ashton045/webpo-generator](https://github.com/ashton045/webpo-generator) (LGPL-3.0-or-later, see
`src/potoken/LICENSE`), whose BotGuard attestation logic comes from
[LuanRT/BgUtils](https://github.com/LuanRT/BgUtils). The wire format of `/generate` and
`/decode_cold_start` is unchanged, so either service works with the same youtube-source config.
