FROM denoland/deno:latest AS builder

WORKDIR /usr/src/app

RUN apt-get update && apt-get install -y git

ARG EJS_COMMIT=5bc9811c7a2f64a88279d2b90884df2160e51b34
RUN git init ejs && \
    cd ejs && \
    git remote add origin https://github.com/yt-dlp/ejs.git && \
    git fetch --depth 1 origin "$EJS_COMMIT" && \
    git checkout --detach FETCH_HEAD && \
    cd ..

COPY scripts/patch-ejs.ts ./scripts/patch-ejs.ts
RUN deno run --allow-read --allow-write ./scripts/patch-ejs.ts

RUN rm -rf ./ejs/.git ./ejs/node_modules || true

COPY . .

RUN deno compile \
    --no-check \
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
COPY --from=builder --chown=nonroot:nonroot /usr/src/app/docs /app/docs

USER nonroot
EXPOSE 8001
ENTRYPOINT ["/app/server"]
