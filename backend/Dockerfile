# Backend: Node + Chromium (for PDF generation). Build from the repo root: docker build -f backend/Dockerfile .
FROM ghcr.io/puppeteer/puppeteer:24.22.0
USER root
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY shared ./shared
COPY backend ./backend
COPY frontend/package.json ./frontend/package.json
RUN npm ci --workspace @tolpraman/backend --include-workspace-root --ignore-scripts \
 && npm rebuild --workspace @tolpraman/backend
ENV NODE_ENV=production PORT=4000
WORKDIR /app/backend
EXPOSE 4000
CMD ["node", "--import", "tsx", "src/server.ts"]
