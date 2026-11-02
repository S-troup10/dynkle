# Mock merchant dashboard (apps/mock-server). Built from the repo root because
# the server imports @dynkle/shared from source via npm workspaces.

# ---- Build: bundle the TypeScript server (and @dynkle/shared) into one JS file ----
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/mock-server/package.json apps/mock-server/
RUN npm ci -w @dynkle/mock-server --include=dev --ignore-scripts
COPY packages/shared packages/shared
COPY apps/mock-server apps/mock-server
RUN npm run build -w @dynkle/mock-server

# ---- Run: production dependencies and the bundle only ----
FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/mock-server/package.json apps/mock-server/
RUN npm ci -w @dynkle/mock-server --omit=dev --ignore-scripts && npm cache clean --force
COPY --from=build /app/apps/mock-server/dist apps/mock-server/dist

WORKDIR /app/apps/mock-server
ENV HOST=0.0.0.0 PORT=4000
EXPOSE 4000
USER node
CMD ["node", "--enable-source-maps", "dist/index.js"]
