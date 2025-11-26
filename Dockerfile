FROM denoland/deno:debian AS builder

WORKDIR /usr/src/app

RUN install -v -d -m 1777 /cache && \
    install -v -d -o deno -g deno player_cache

RUN apt-get update && apt-get install -y git

COPY . .

RUN git submodule update --init --recursive

RUN deno compile \
    --output server \
    --allow-net --allow-read --allow-write --allow-env \
    --include worker.ts \
    server.ts

FROM gcr.io/distroless/cc-debian12

WORKDIR /app

COPY --from=builder /tini /tini
COPY --from=builder /usr/src/app/server /app/server
COPY --from=builder /cache /cache

COPY --from=builder --chown=nonroot:nonroot /usr/src/app/player_cache /app/player_cache
COPY --from=builder --chown=nonroot:nonroot /usr/src/app/player_cache /home/nonroot/.cache

USER nonroot
EXPOSE 8001
ENTRYPOINT ["/tini", "--", "/app/server"]
