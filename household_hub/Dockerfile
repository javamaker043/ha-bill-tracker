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

CMD [ "/run.sh" ]
