# SimpleAPI Manager

SimpleAPI Manager 是一个独立面板项目，不嵌入 SimpleAPI。连接方式参考 CPA-Manager-Plus：

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

请求监控页面通过 manager-server 同步 SimpleAPI 的 `GET /v0/management/call-log`，并写入本地 SQLite 数据库 `manager.db`。SimpleAPI 侧日志容量由 `proxy.call_log_max_entries` 控制，`0` 表示关闭调用记录；manager-server 侧数据库会保留已同步的历史记录。

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
  --add-host=host.docker.internal:host-gateway \
  -v simpleapi-manager-data:/data \
  -e SIMPLEAPI_MANAGER_ADMIN_KEY=change-me \
  ghcr.io/greenteodoro839/simpleapi-manager:latest
```

容器内默认使用：

- `HTTP_ADDR=0.0.0.0:18318`
- `DATA_DIR=/data`
- `PANEL_PATH=/app/panel`

`SIMPLEAPI_MANAGER_ADMIN_KEY` 只在新的 `/data` 尚未初始化时生效；已有数据时会继续使用已保存的面板凭据。
`/data` 同时保存 `manager.json` 和请求监控 SQLite 数据库 `manager.db`，生产部署应挂载 volume。

如果 SimpleAPI 运行在 Docker 宿主机上，面板的 `SimpleAPI 地址` 填 `http://host.docker.internal:8317`。Linux Docker 需要上面示例里的 `--add-host=host.docker.internal:host-gateway`；Docker Desktop 通常已内置这个主机名。

## 构建验证

```bash
npm run build
npm run manager-server:test
npm run manager-server:build
```
