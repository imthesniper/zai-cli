# Disposable live test: no host volumes or Docker socket are mounted.
# This container is NOT a substitute for reviewing runtime/tool permissions.
FROM node:24.14.0-bookworm-slim
RUN useradd --uid 10001 --create-home --home-dir /home/zctest --shell /usr/sbin/nologin zctest
WORKDIR /app
COPY package.json npm-shrinkwrap.json ./
RUN npm ci --ignore-scripts --no-audit --no-fund
COPY . .
RUN chown -R 10001:10001 /app
USER 10001:10001
ENV HOME=/home/zctest ZC_LIVE_CONTAINER=1
ENTRYPOINT ["node", "scripts/live-production-check.mjs"]
