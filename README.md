Basic service to eval yt player scripts for nsig stuff. 

## Getting Started

The easiest way to use this right now is with docker

```bash
git clone https://github.com/kikkia/yt-cipher.git

cd yt-cipher

docker-compose build
docker-compose up
```

## Authentication

You'll need to set the `API_TOKEN` environment variable in your `docker-compose.yml` file.

Requests without a valid `Authorization: <your_token>` header will be rejected.

## Config

Environment Variables:
- `MAX_THREADS` - max # of workers that can handle requests. Default is 1 per thread on the machine or 1 if it can't determine that for some reason. 
- `API_TOKEN` - The required token to authenticate requests
- `PORT` - Port to run the api on, default: `8001`
- `HOST` - Sets the hostname for the deno server, default: `0.0.0.0`

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


## Metrics

There is a Prometheus-compatible metrics endpoint at `/metrics`.
### Exposed Metrics

- `http_requests_total`: Total number of HTTP requests.
- `http_request_duration_seconds`: Latency of HTTP requests.
- `http_requests_errors_total`: Total number of HTTP requests that resulted in an error.
- `cache_hits_total`: Total number of cache hits for player scripts.
- `cache_misses_total`: Total number of cache misses for player scripts.
- `cache_size`: The current number of player scripts in the cache.

