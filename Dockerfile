FROM denoland/deno:latest AS builder

WORKDIR /usr/src/app

RUN apt-get update && apt-get install -y git npm

COPY . .

RUN git submodule update --init --recursive

RUN deno compile \
    --output server \
    --allow-net --allow-read --allow-write --allow-env \
    --include worker.ts \
    server.ts

RUN mkdir -p /usr/src/app/player_cache && \
    chown -R deno:deno /usr/src/app/player_cache

FROM gcr.io/distroless/cc-debian12

WORKDIR /app

COPY --from=builder /usr/src/app/server /app/server

COPY --from=builder --chown=nonroot:nonroot /usr/src/app/player_cache /app/player_cache

USER nonroot
EXPOSE 8001
ENTRYPOINT ["/app/server"]
