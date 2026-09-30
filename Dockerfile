FROM node:24-bookworm-slim AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1 NODE_OPTIONS="--max-old-space-size=320"
RUN npm run build && npm prune --omit=dev --ignore-scripts && rm -rf .tradelab-build/cache

FROM node:24-bookworm-slim AS runner
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-venv libgomp1 ca-certificates && rm -rf /var/lib/apt/lists/*
COPY requirements.txt ./
RUN python3 -m venv /opt/venv && /opt/venv/bin/pip install --no-cache-dir -r requirements.txt
COPY --from=builder /app/.tradelab-build ./.tradelab-build
COPY --from=builder /app/node_modules ./node_modules
COPY package.json next.config.mjs ./
COPY --from=builder /app/public ./public
COPY worker ./worker
COPY assets ./assets
COPY script ./script
COPY src/content ./src/content
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 NODE_OPTIONS="--max-old-space-size=320" PYTHON_BIN=/opt/venv/bin/python TRADELAB_DATA_DIR=/app/data HOSTNAME=0.0.0.0 PORT=3000
RUN mkdir -p /app/data && chown -R node:node /app /opt/venv
USER node
EXPOSE 3000
CMD ["sh", "script/start-container.sh"]
