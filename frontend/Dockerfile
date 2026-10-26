# Frontend: Next.js standalone build. Build from the repo root: docker build -f frontend/Dockerfile .
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY shared ./shared
COPY frontend ./frontend
COPY backend/package.json ./backend/package.json
RUN npm ci --workspace @tolpraman/frontend --include-workspace-root --ignore-scripts
ARG BACKEND_URL=http://backend:4000
ENV BACKEND_URL=$BACKEND_URL
RUN npm run build -w @tolpraman/frontend

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
COPY --from=build /app/frontend/.next/standalone ./
COPY --from=build /app/frontend/.next/static ./frontend/.next/static
COPY --from=build /app/frontend/public ./frontend/public
EXPOSE 3000
CMD ["node", "frontend/server.js"]
