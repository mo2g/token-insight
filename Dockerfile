FROM oven/bun:1.2.22 AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package.json frontend/bun.lock ./
RUN bun install --frozen-lockfile
COPY frontend/ ./
RUN bun run build

FROM rust:1.88-bookworm AS backend-builder
WORKDIR /app
COPY backend/Cargo.toml backend/Cargo.lock backend/
COPY backend/src backend/src
COPY backend/assets backend/assets
RUN cargo build --manifest-path backend/Cargo.toml --release

FROM gcr.io/distroless/cc-debian12

WORKDIR /opt/token-insight
COPY --from=backend-builder /app/backend/target/release/token-insight /usr/local/bin/token-insight
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

ENV TOKEN_INSIGHT_DATA_DIR=/var/lib/token-insight/data
ENV TOKEN_INSIGHT_CACHE_DIR=/var/lib/token-insight/cache

EXPOSE 8787

ENTRYPOINT ["token-insight"]
CMD ["serve", "--host", "0.0.0.0", "--port", "8787", "--static-dir", "/opt/token-insight/frontend/dist"]
