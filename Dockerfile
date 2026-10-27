# Mock merchant dashboard (apps/mock-server). Built from the repo root because
# the server imports @dynkle/shared from source via npm workspaces.
FROM node:22-slim

WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/mock-server/package.json apps/mock-server/
# Dev dependencies stay: tsx runs the TypeScript directly.
RUN npm ci -w @dynkle/mock-server --include=dev --ignore-scripts

COPY packages/shared packages/shared
COPY apps/mock-server apps/mock-server

WORKDIR /app/apps/mock-server
ENV HOST=0.0.0.0 PORT=4000
EXPOSE 4000
CMD ["npx", "tsx", "src/index.ts"]
