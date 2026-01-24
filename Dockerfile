FROM denoland/deno:latest AS builder

WORKDIR /usr/src/app

RUN apt-get update && apt-get install -y git

RUN git clone https://github.com/yt-dlp/ejs.git
# Pin to a specific commit
RUN cd ejs && git checkout e91d03f58a9791da2300c5f10a2955af1c5d6d87 && cd ..

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
