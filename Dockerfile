FROM node:22-bookworm-slim

LABEL maintainer="INAPP Mobile"

# Install Chromium dependencies for Puppeteer
RUN apt-get update && apt-get install -y \
    chromium \
    chromium-driver \
    libnss3 \
    libnspr4 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libdbus-1-3 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    libgbm1 \
    libpango-1.0-0 \
    libcairo2 \
    libasound2 \
    --no-install-recommends && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Make HOME writable for puppeteer cache (appuser has no home)
ENV HOME=/app \
    CHROMIUM_PATH=/usr/bin/chromium

# Copy package files first for layer caching
COPY package*.json ./

RUN npm ci --only=production

# Copy application code
COPY . .

# Create non-root user with writable home
RUN addgroup --system appgroup && \
    adduser --system --ingroup appgroup appuser && \
    chown -R appuser:appgroup /app

USER appuser

ENV PORT=8080 \
    NODE_ENV=production

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=15s --start-period=10s --retries=3 \
    CMD node -e "require('http').get('http://localhost:' + (process.env.PORT || 8080) + '/health', r => { process.exit(r.statusCode === 200 ? 0 : 1) }).on('error', () => process.exit(1))"

CMD ["node", "server.js"]
