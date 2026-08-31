ARG BUILD_FROM
FROM node:20-bookworm-slim AS frontend-build
WORKDIR /frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build

# BUILD_FROM is supplied by Supervisor per-arch via build.yaml when this is
# installed as an add-on; the amd64 fallback below only kicks in for a
# manual `docker build .` outside of that.
FROM ${BUILD_FROM:-ghcr.io/home-assistant/amd64-base-debian:bookworm}

# s6-overlay base images already provide node? No -> install Node 20 manually.
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl ca-certificates gnupg build-essential python3 \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY backend/package*.json ./
RUN npm install --omit=dev

COPY backend/ ./
COPY --from=frontend-build /frontend/dist ./public

COPY run.sh /
RUN chmod a+x /run.sh

ENV NODE_ENV=production
ENV PORT=8099
ENV DB_PATH=/data/household.db

EXPOSE 8099

# The HA base image's own ENTRYPOINT is s6-overlay's /init, which curates
# (resets) the process environment it hands to whatever it's told to run
# unless explicitly configured to keep it -- so a bare `CMD` here silently
# lost every ENV set above (DB_PATH, PORT, NODE_ENV), landing DB_PATH back
# on its non-persistent in-container fallback path instead of /data and
# wiping all data on every add-on update. init: false in config.yaml
# already means this add-on doesn't need Supervisor's own init wrapper, and
# run.sh's own `exec node ...` is enough process handling on its own, so
# ENTRYPOINT here bypasses s6-overlay entirely instead of layering under it.
ENTRYPOINT [ "/run.sh" ]
