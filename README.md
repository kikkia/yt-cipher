An http api wrapper for [yt-dlp/ejs](https://github.com/yt-dlp/ejs).

# Getting Started

## Public instance
**It is very much reccomended to host yourself**

You can use the public instance without a password at `https://cipher.kikkia.dev/api`. 

WARNING: Ratelimit of 5/sec. To have better performance and garunteed uptime, host it yourself. 

## Hosting yourself

### Docker/Docker-compose

The easiest way to host this service is with Docker

```bash
git clone https://github.com/kikkia/yt-cipher.git

cd yt-cipher

docker-compose build
docker-compose up
```

### Deno

If you have Deno installed, you can run the service directly.

Clone the repository and patch the `ejs` dependency:

```bash
git clone https://github.com/kikkia/yt-cipher.git
cd yt-cipher
git clone https://github.com/yt-dlp/ejs.git
cd ejs
git checkout 689764f8cea694e99609a41f1630d2e7e8e8668a
cd ..
deno run --allow-read --allow-write ./scripts/patch-ejs.ts
```

```bash
deno run --allow-net --allow-read --allow-write --allow-env server.ts
```

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

## IPv6 Support

To run the server with IPv6, you need to configure the `HOST` environment variable.

- Set `HOST` to `[::]` to bind to all available IPv6 and IPv4 addresses on most modern operating systems.

When accessing the service over IPv6, make sure to use the correct address format. For example, to access the service running on localhost, you would use `http://[::1]:8001/`.

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
