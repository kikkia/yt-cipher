FROM denoland/deno:debian AS builder

WORKDIR /usr/src/app

COPY . .

# needs --build-arg BUILDKIT_CONTEXT_KEEP_GIT_DIR=1 when using a URL
#RUN apt-get update && apt-get install -y git && \
#    git submodule update --init --recursive

RUN deno compile \
    --output server \
    --allow-net --allow-read --allow-write --allow-env \
    --include worker.ts \
    server.ts

FROM gcr.io/distroless/cc-debian13:debug
SHELL ["/busybox/busybox", "sh", "-c"]

WORKDIR /app

COPY --from=builder /tini /tini
COPY --from=builder /usr/src/app/server /app/server

RUN install -v -d -m 1777 /cache && \
    install -v -d -o nonroot -g nonroot -m 750 /app/player_cache /home/nonroot/.cache

EXPOSE 8001
ENTRYPOINT ["/tini", "--"]
CMD ["/busybox/busybox", "su", "-s", "/app/server", "nonroot"]
