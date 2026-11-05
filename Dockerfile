FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY scripts/patch-alphatab.mjs ./scripts/patch-alphatab.mjs
COPY patches/README.md ./patches/README.md
RUN npm ci
COPY . .
RUN npm run build \
    && npx tsc -p server/tsconfig.build.json \
    && npm prune --omit=dev --ignore-scripts

FROM node:24-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000 CLOUD_COACH_ENABLED=false
COPY --from=build --chown=node:node /app/package.json ./package.json
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/.server-build ./
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/migrations ./migrations
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:' + process.env.PORT + '/healthz').then(r => { if (!r.ok) process.exit(1); }).catch(() => process.exit(1))"
CMD ["node", "server/index.js"]
