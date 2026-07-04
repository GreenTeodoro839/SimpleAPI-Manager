# syntax=docker/dockerfile:1.7

FROM --platform=$BUILDPLATFORM node:22-alpine AS web-builder
WORKDIR /src

COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/package.json
RUN npm ci

COPY apps/web apps/web
RUN npm run build

FROM --platform=$BUILDPLATFORM golang:1.22-alpine AS server-builder
WORKDIR /src/apps/manager-server

COPY apps/manager-server/go.mod apps/manager-server/go.sum ./
RUN go mod download

COPY apps/manager-server ./
ARG TARGETOS
ARG TARGETARCH
ENV CGO_ENABLED=0
RUN GOOS=$TARGETOS GOARCH=$TARGETARCH go build -trimpath -ldflags="-s -w" -o /out/simpleapi-manager ./cmd/simpleapi-manager

FROM alpine:3.20
RUN apk add --no-cache ca-certificates && \
    addgroup -S app && \
    adduser -S -D -H -G app -u 10001 app && \
    mkdir -p /app /data && \
    chown -R app:app /app /data

COPY --from=server-builder --chown=app:app /out/simpleapi-manager /app/simpleapi-manager
COPY --from=web-builder --chown=app:app /src/apps/web/dist /app/panel

ENV HTTP_ADDR=0.0.0.0:18318
ENV DATA_DIR=/data
ENV PANEL_PATH=/app/panel

USER app
EXPOSE 18318
VOLUME ["/data"]
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 CMD wget -qO- http://127.0.0.1:18318/health || exit 1
ENTRYPOINT ["/app/simpleapi-manager"]
