Basic service to evaluate YouTube player scripts to extract/decrypt `n`-signature (nsig) information.

# Getting Started

## Public instance

**Self‑hosting is strongly recommended.**

You can use the public instance without a password at `https://cipher.kikkia.dev/api`.

> **Warning:** the public instance is rate-limited to **5 requests/sec** and uptime is not guaranteed. For better performance and reliable availability, host the service yourself.

## Hosting yourself

### Docker / Docker Compose

The easiest way to run this right now is with Docker:

```bash
git clone https://github.com/kikkia/yt-cipher.git

cd yt-cipher

docker-compose build
docker-compose up
```

### Deno

If you have Deno installed, you can run the service directly. Clone the repository and patch the `ejs` dependency:

```bash
git clone https://github.com/kikkia/yt-cipher.git
cd yt-cipher
git clone https://github.com/yt-dlp/ejs.git
cd ejs
# Temporary: reset to commit 1adbcc85e32f75e43a81cad2cd2d861154f13baa
git reset --hard 1adbcc85e32f75e43a81cad2cd2d861154f13baa
deno run --allow-read --allow-write ./scripts/patch-ejs.ts
```

Then start the server:

```bash
deno run --allow-net --allow-read --allow-write --allow-env --v8-flags=--max-old-space-size=1024 server.ts
```

> Note: the `ejs` reset above is a temporary workaround for upstream file changes; it will be addressed in a future update.

# Authentication

Set the `API_TOKEN` environment variable in your `docker-compose.yml` file to require a password to access the service.

If a token is set, requests without a valid `Authorization: <your_token>` header will be rejected.

# Config

**Environment variables:**

* `MAX_THREADS` — Maximum number of worker threads. Defaults to the number of CPU threads on the machine, or `1` if that cannot be determined.
* `API_TOKEN` — The token required to authenticate requests.
* `HOST` — Hostname for the Deno server. Default: `0.0.0.0`.
* `PORT` — Port to run the API on. Default: `8001`.
* 
# IPv6 Support

To run the server with IPv6, set the `HOST` environment variable appropriately.

* Set `HOST` to `[::]` to bind to all available IPv6 and IPv4 addresses on most modern operating systems.

When accessing the service over IPv6, make sure to use the correct address format. 
For example, to access the service running on localhost use the IPv6 loopback address: `http://[::1]:8001/` or the if the port has been configured `http://[::1]:<PORT>/`.

# API Specification

## `POST /decrypt_signature`

**Request body:**

```json
{
  "encrypted_signature": "...",
  "n_param": "...",
  "player_url": "..."
}
```

* `encrypted_signature` (string): The encrypted signature from the video stream.
* `n_param` (string): The `n` parameter value.
* `player_url` (string): URL of the JavaScript player file that contains the decryption logic.

**Successful response:**

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

## `POST /get_sts`

Extracts the signature timestamp (`sts`) from a player script.

**Request body:**

```json
{
  "player_url": "..."
}
```

* `player_url` (string): URL of the JavaScript player file.

**Successful response:**

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
