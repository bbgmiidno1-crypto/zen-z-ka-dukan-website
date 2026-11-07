# ZEN Z KA DUKAN — production image
# Node 20 (matches the verified local runtime) on Debian bookworm slim.
# The only compiled dependency is better-sqlite3, built here for the target architecture
# (linux/arm64 on Oracle Ampere, linux/amd64 on a PC), so no cross-compilation is involved.

# ---------- build stage ----------
FROM node:20-bookworm-slim AS build
WORKDIR /app

# Toolchain for better-sqlite3 (prebuilt binaries are used when available, compiled otherwise).
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY . .

# Build guard: `npm run build` type-checks (tsc --noEmit) and bundles the SPA into dist/.
RUN npm run build \
    && npm prune --omit=dev --no-audit --no-fund

# ---------- runtime stage ----------
FROM node:20-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3001 \
    DATA_DIR=/app/data \
    TZ=Asia/Kolkata

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates tini \
    && rm -rf /var/lib/apt/lists/*

# Package manifests for provenance, pruned production dependencies (includes tsx, sharp, better-sqlite3).
COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/node_modules ./node_modules

# Server, shared contracts, SPA build, seed media and seed manifests.
# Persistent state (data/zen.db and data/uploads) is deliberately excluded by .dockerignore
# and is mounted as a volume, so rebuilds never overwrite real data.
COPY --from=build /app/server ./server
COPY --from=build /app/shared ./shared
COPY --from=build /app/dist ./dist
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/data/seed-manifest.json ./data/seed-manifest.json
COPY --from=build /app/data/seed-360-manifest.json ./data/seed-360-manifest.json
COPY --from=build /app/data/uploads/seed ./data/uploads/seed

RUN mkdir -p /app/data/uploads \
    && chown -R node:node /app/data

USER node
EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3001)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["npm", "start"]
