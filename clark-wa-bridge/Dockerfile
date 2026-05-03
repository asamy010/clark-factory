# CLARK WhatsApp Bridge — Docker image
# Based on Node 20 + headless Chromium for whatsapp-web.js / Puppeteer

FROM node:20-bookworm-slim

# Install Chromium + dependencies for Puppeteer
RUN apt-get update && apt-get install -y \
    chromium \
    fonts-liberation \
    fonts-noto-color-emoji \
    fonts-noto-cjk \
    libnss3 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libgtk-3-0 \
    libpango-1.0-0 \
    libcairo2 \
    libasound2 \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Tell Puppeteer to use system Chromium (not download its own)
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /app

# Install dependencies (separate layer for caching)
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund

# Copy source
COPY server.js ./

# Persistent dirs (mounted as volumes in compose)
RUN mkdir -p /app/.wwebjs_auth /app/.wwebjs_cache && \
    chmod -R 777 /app/.wwebjs_auth /app/.wwebjs_cache

EXPOSE 3001

# Healthcheck — Caddy uses this to know if bridge is up
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3001/status', r => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

CMD ["node", "server.js"]
