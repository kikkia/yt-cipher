ARG XDG_CACHE_HOME

FROM denoland/deno:debian AS builder

WORKDIR /usr/src/app

COPY . .

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

ARG XDG_CACHE_HOME
ENV XDG_CACHE_HOME="${XDG_CACHE_HOME}"
# Create the fall-back cache directories
RUN install -v -d -o nonroot -g nonroot -m 750 \
        /app/player_cache /home/nonroot/.cache && \
    test -z "${XDG_CACHE_HOME}" || install -v -d -m 1777 "${XDG_CACHE_HOME}"

EXPOSE 8001
USER nonroot
ENTRYPOINT ["/tini", "--"]
# Run the server as nonroot even when /tini runs as root
# CMD ["/busybox/busybox", "su", "-s", "/app/server", "nonroot"]
CMD ["/app/server"]
