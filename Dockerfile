FROM denoland/deno:latest AS builder

RUN apt-get update && apt-get install -y git npm

WORKDIR /usr/src/app

# Clone ejs repository, then patch it to be deno compatible
# ----- TEMP WORKAROUND TILL IN UPSTREAM ----
RUN git clone https://github.com/yt-dlp/ejs.git

# Pin to a specific commit to avoid breakages
RUN cd ejs && git checkout 25b77b73108ae08451fb06b98a787712c06298a5 && deno install && cd ..

COPY scripts/patch-ejs.ts ./scripts/patch-ejs.ts
RUN deno run --allow-read --allow-write ./scripts/patch-ejs.ts

FROM denoland/deno:latest

WORKDIR /usr/src/app

# Copy patched ejs from builder stage
COPY --from=builder /usr/src/app/ejs ./ejs

COPY . .

RUN mkdir -p player_cache
RUN chown -R deno:deno .

EXPOSE 8001

USER deno

CMD ["run", "--allow-net", "--allow-read", "--allow-write", "--allow-env", "server.ts"]
