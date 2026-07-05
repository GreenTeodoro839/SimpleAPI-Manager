# SimpleAPI Manager

SimpleAPI Manager 是 SimpleAPI 的 Web 管理面板。Docker 镜像内置 SimpleAPI release 二进制，可以在一个容器里同时运行代理服务和管理面板；本地开发或自定义部署时，也可以只运行 manager-server 去连接外部 SimpleAPI。

- 浏览器只连接本项目的 `manager-server`。
- `manager-server` 保存 SimpleAPI 地址和 SimpleAPI `management.admin_key`。
- 前端请求 SimpleAPI 管理接口时走 `manager-server` 反向代理，浏览器不会持有 SimpleAPI 管理密钥。

## 技术栈

- Web：Vite、React、TypeScript、SCSS、axios、echarts、zustand、react-router-dom、CodeMirror。
- Manager Server：Go 标准库 HTTP 服务，JSON 文件存储面板配置。

## 开发

```bash
npm install
npm run dev
```

另开一个终端启动后端：

```bash
npm run manager-server:build
./bin/simpleapi-manager -listen 127.0.0.1:18318
```

Vite dev server 默认代理 `/api`、`/simpleapi`、`/health` 到 `http://127.0.0.1:18318`。

## 生产构建

```bash
npm run build
npm run manager-server:build
./bin/simpleapi-manager -listen 0.0.0.0:18318 -panel apps/web/dist
```

首次启动时，`manager-server` 会在日志里输出面板 Admin Key：

```text
SimpleAPI Manager admin key generated: ...
```

开发时也可以显式指定首次初始化用的面板 key：

```bash
./bin/simpleapi-manager -listen 127.0.0.1:18318 -panel apps/web/dist -admin-key test-admin-key
```

`-admin-key` 只在新的 data 目录尚未初始化时生效；已有 `data/manager.json` 时会继续使用已保存的面板凭据。

用这个 key 登录面板，然后在 Setup 页面填写：

- SimpleAPI 地址，例如 `http://127.0.0.1:8317`
- SimpleAPI 管理接口 Base Path，默认 `/v0/management`
- SimpleAPI Admin Key，即 SimpleAPI `config.yaml` 里的 `management.admin_key`

保存成功后，面板通过 `/simpleapi/api/*` 代理访问 SimpleAPI 管理 API。

请求监控页面通过 manager-server 同步 SimpleAPI 的 `GET /v0/management/call-log`，并写入本地 SQLite 数据库 `manager.db`。仪表盘和用量统计也从 `manager.db` 聚合，不再读取 SimpleAPI 的内存 `/usage`。SimpleAPI 侧日志容量由 `proxy.call_log_max_entries` 控制，`0` 表示关闭调用记录；manager-server 侧数据库会保留已同步的历史记录。

## Docker 镜像

每次 push 都会通过 GitHub Actions 构建并推送多架构镜像到 GHCR：

- 镜像：`ghcr.io/greenteodoro839/simpleapi-manager`
- 平台：`linux/amd64`、`linux/arm64`
- Tag：默认分支会推送 `latest` 和分支名；所有 push 都会推送分支或 tag 名，以及 `sha-<commit>`。

运行示例：

```bash
docker run -d \
  --name simpleapi-manager \
  -p 18318:18318 \
  -p 8317:8317 \
  -v simpleapi-manager-data:/data \
  -e SIMPLEAPI_MANAGER_ADMIN_KEY=change-me \
  -e PROXY_ADMIN_KEY=change-simpleapi-admin-key \
  ghcr.io/greenteodoro839/simpleapi-manager:latest
```

访问：

- 面板：`http://127.0.0.1:18318`
- SimpleAPI 客户端接口：`http://127.0.0.1:8317`

容器内默认使用：

- `HTTP_ADDR=0.0.0.0:18318`
- `DATA_DIR=/data`
- `PANEL_PATH=/app/panel`
- `SIMPLEAPI_LISTEN=0.0.0.0:8317`
- `SIMPLEAPI_CONFIG=/data/simpleapi/config.yaml`
- `SIMPLEAPI_MANAGER_AUTO_CONNECT=true`

镜像构建时会从 `GreenTeodoro839/SimpleAPI` release 下载对应架构的 `proxy-linux-amd64.tar.gz` / `proxy-linux-arm64.tar.gz`，并从仓库里的 `config.yaml` 带入默认配置模板。

启动时如果 `SIMPLEAPI_CONFIG` 指向的配置文件不存在，会把内置模板复制到该位置；如果文件已经存在，则不会覆盖。默认路径是 `/data/simpleapi/config.yaml`，所以生产部署应挂载 `/data`。
入口脚本会先修正 `/data` 下文件和目录的 owner，然后再以非 root 的 `app` 用户启动 SimpleAPI 和 manager-server；手动复制 `manager.json`、`config.yaml` 或创建 `simpleapi/` 目录后，一般不需要再单独处理容器内权限。

`SIMPLEAPI_MANAGER_ADMIN_KEY` 只在新的 `/data` 尚未初始化时生效；已有数据时会继续使用已保存的面板凭据。
`PROXY_ADMIN_KEY` 是 SimpleAPI `management.admin_key` 的环境变量；如果未设置，入口脚本会生成一个并持久化到 `/data/simpleapi/admin_key`，同时写入启动日志。
`/data` 同时保存 `manager.json`、请求监控 SQLite 数据库 `manager.db`、SimpleAPI 配置和自动生成的 SimpleAPI 管理 key。

默认情况下，manager-server 会在首次启动且尚未保存连接时自动连接容器内 SimpleAPI：`http://127.0.0.1:8317`，管理接口路径为 `/v0/management`。已有连接配置时不会覆盖。设置 `SIMPLEAPI_MANAGER_AUTO_CONNECT=false` 可以关闭这个行为。

如果你仍然想连接运行在 Docker 宿主机上的外部 SimpleAPI，可以在面板 Setup 页面把 `SimpleAPI 地址` 改成 `http://host.docker.internal:8317`。Linux Docker 需要在 `docker run` 加上：

```bash
--add-host=host.docker.internal:host-gateway
```

Docker Desktop 通常已内置这个主机名。

## 构建验证

```bash
npm run build
npm run manager-server:test
npm run manager-server:build
```
