ARG XDG_CACHE_HOME

FROM denoland/deno:debian AS builder

WORKDIR /usr/src/app

COPY . .

RUN deno compile \
    --output server \
    --allow-net --allow-read --allow-write --allow-env \
    --include worker.ts \
    server.ts

FROM ghcr.io/tcely/docker-tini:main@sha256:0b16fede939249d3783966eba573bac03cf106721df5a63e3555f6b8b0cef074 AS tini-bin
FROM scratch AS tini
ARG TARGETARCH TINI_VERSION="0.19.0"
COPY --from=tini-bin "/releases/v${TINI_VERSION}/tini-static-${TARGETARCH}" /tini

FROM gcr.io/distroless/cc-debian13:debug
SHELL ["/busybox/busybox", "sh", "-c"]

WORKDIR /app

COPY --from=tini /tini /tini
COPY --from=builder /usr/src/app/server /app/server

COPY --from=builder --chown=nonroot:nonroot /usr/src/app/docs /app/docs

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
