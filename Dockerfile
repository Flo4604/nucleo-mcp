FROM oven/bun:1 AS deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

FROM oven/bun:1
# rsvg-convert backs export_icon_pdf; it is the only non-Bun runtime dependency.
RUN apt-get update \
	&& apt-get install -y --no-install-recommends librsvg2-bin ca-certificates \
	&& rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json tsconfig.json ./
COPY src ./src

ENV NODE_ENV=production \
	DATA_DIR=/data \
	PORT=8080

# The mirror rebuilds itself from Nucleo on boot, so an empty volume is fine.
RUN mkdir -p /data && chown -R bun:bun /data /app
VOLUME ["/data"]
USER bun
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=90s --retries=3 \
	CMD bun -e "fetch('http://127.0.0.1:'+(process.env.PORT??8080)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["bun", "run", "src/index.ts"]
