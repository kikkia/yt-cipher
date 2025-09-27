FROM denoland/deno:latest AS builder

RUN apt-get update && apt-get install -y git npm

WORKDIR /usr/src/app

# Clone ejs repository, then patch it to be deno compatible
RUN git clone https://github.com/yt-dlp/ejs.git

COPY scripts/patch-ejs.ts ./scripts/patch-ejs.ts
RUN deno run --allow-read --allow-write ./scripts/patch-ejs.ts

FROM denoland/deno:latest

WORKDIR /usr/src/app

# Copy patched ejs from builder stage
COPY --from=builder /usr/src/app/ejs ./ejs

COPY . .

RUN mkdir -p player_cache && chown -R deno:deno player_cache

EXPOSE 8001

USER deno

CMD ["run", "--allow-net", "--allow-read", "--allow-write", "--allow-env", "server.ts"]