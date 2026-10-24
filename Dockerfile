# syntax=docker/dockerfile:1
# Production image: Next.js standalone server plus the bundled worker and operations CLIs.
#   docker build --build-arg APP_URL=https://example.com -t motchutenglish .
# APP_URL is a build argument because prerendered pages carry absolute URLs (canonical, Open
# Graph). The database URL and auth secret below are build-time placeholders only; the real
# values come from the runtime environment (see compose.yaml).

FROM node:24-slim AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY patches patches
RUN pnpm install --frozen-lockfile
COPY . .
ARG APP_URL
RUN test -n "$APP_URL" || (echo "Set --build-arg APP_URL=https://..." >&2; exit 1)
ENV NEXT_TELEMETRY_DISABLED=1 \
    APP_ENV=production \
    APP_URL=$APP_URL \
    DATABASE_URL=mysql://build:build@127.0.0.1:3306/build \
    BETTER_AUTH_SECRET=build-time-placeholder-not-used-at-runtime
RUN pnpm build && pnpm build:worker

FROM node:24-slim
# mariadb-client: SQL backup and restore drill. python3: media backup (ops/media-backup.py).
RUN apt-get update \
    && apt-get install -y --no-install-recommends mariadb-client python3 ca-certificates tini \
    && rm -rf /var/lib/apt/lists/* \
    && mariadb-dump --version && python3 --version
WORKDIR /app
ENV NODE_ENV=production \
    APP_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    WRITABLE_DIR=/app/writable \
    MYSQLDUMP_BIN=/usr/bin/mariadb-dump \
    MYSQL_BIN=/usr/bin/mariadb
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
COPY --from=build /app/dist ./dist
COPY --from=build /app/drizzle ./drizzle
COPY --from=build /app/seed ./seed
COPY --from=build /app/templates ./templates
COPY --from=build /app/ops ./ops
# Code stays root-owned and read-only for the app; only writable/ (media, exports, backups,
# mail log) belongs to the unprivileged user and is the persistent volume.
RUN mkdir -p writable && chown node:node writable && chmod 700 writable
USER node
VOLUME ["/app/writable"]
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
    CMD node -e "fetch('http://127.0.0.1:3000/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
ENTRYPOINT ["tini", "--"]
CMD ["node", "server.js"]
