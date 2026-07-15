# 极乐迪斯科｜内陆回声

一个非官方、完全开源的《极乐迪斯科》相关中文文本改写工作台。支持 DeepSeek、通义千问、OpenAI、SiliconFlow，以及任意 OpenAI Chat Completions 兼容接口；最多可以同时选择三个模型并列比较流式输出。

> 本项目为非官方开源项目，不内置或检索游戏原文。

## 功能

- 四种改写预设：心理黑色侦探、黑色幽默、多声部内心独白、抒情意识流
- 多供应商并行流式输出（NDJSON）
- DeepSeek、通义千问、OpenAI、SiliconFlow 内置配置
- 自定义 OpenAI 兼容接口地址、模型和临时接口密钥
- 本地确定性模拟服务，无需任何接口密钥即可开发和自动测试
- Redis 限流；Redis 不可用时自动退回进程内限流
- 自定义供应商 URL SSRF 基础防护
- 响应式界面、键盘焦点、完整减少动效模式
- 统一的“档案 / 信号 / 压印”动效系统，不对流式 token 逐字播放动画
- 原创 SVG favicon 与 180×180 Apple Touch Icon
- Docker 多阶段构建和 Docker Compose 一键启动

## 本地开发

```bash
npm install
npm run dev
```

打开 <http://localhost:3000>。默认选择“本地演示”，不需要配置接口。

## Docker 部署（推荐）

项目以 Docker 作为主要生产部署方式。镜像使用 `node:22-alpine` 多阶段构建与 Next.js standalone 输出；运行层不包含源码和完整 `node_modules`，以非 root 的 `nextjs` 用户启动，并内置 `/api/health` 健康检查。

### Docker Compose

```bash
cp .env.example .env
docker compose up --build -d
```

服务：

- 应用：<http://localhost:3000>
- 健康检查：<http://localhost:3000/api/health>
- Redis：仅在 Compose 内部暴露

如需更换宿主机端口，在 `.env` 中设置：

```dotenv
APP_PORT=8080
```

随后访问 <http://localhost:8080>。Compose 中的 Redis 只用于限流，关闭了持久化；容器重启会重置限流计数，不会存储正文或接口密钥。

查看状态和日志：

```bash
docker compose ps
docker compose logs -f app
```

停止服务：

```bash
docker compose down
```

更新部署：

```bash
git pull --ff-only
docker compose build --pull
docker compose up -d --remove-orphans
```

### 单容器运行

不需要 Redis 时，可以直接运行镜像。限流会自动退回当前应用进程的内存实现：

```bash
docker build -t inland-echoes .
docker run --rm -p 3000:3000 --name inland-echoes inland-echoes
```

需要外部 Redis 时增加 `-e REDIS_URL=redis://host:6379`。供应商密钥应通过运行时环境变量或部署平台的 Secret 功能注入，不要写入 Dockerfile、镜像或版本库。

### 生产部署检查

```bash
curl --fail http://127.0.0.1:3000/api/health
curl --fail http://127.0.0.1:3000/api/providers
docker inspect --format '{{json .State.Health}}' inland-echoes
```

当前 Dockerfile 与 Compose 已在 Linux arm64 容器环境完成镜像构建、非 root 运行、健康检查、Redis 连接、主页、供应商接口、图标请求和 NDJSON 流式改写验证。基础镜像提供 amd64/arm64 变体，应在目标架构上构建；需要发布多架构镜像时可使用 Docker Buildx 分别构建并生成 manifest。

公开部署时还应：

- 在容器前配置 HTTPS 反向代理，并转发流式响应而不是缓冲整个响应。
- 只暴露应用端口，不要把 Redis 端口发布到公网。
- 配置供应商预算上限、日志轮转以及主机或平台级监控。
- 保持 `ALLOW_LOCAL_PROVIDER=false`；只有可信私有网络需要访问本地 HTTP 模型接口时才启用。

## 模型供应商

所有内置供应商都可以通过 `.env` 配置。也可以在页面中输入临时密钥；临时密钥只保存在页面内存，并随单次请求发送，不会进入 localStorage、数据库或日志。

| 供应商 | 密钥变量 | 接口地址变量 | 默认模型 |
| --- | --- | --- | --- |
| DeepSeek | `DEEPSEEK_API_KEY` | `DEEPSEEK_BASE_URL` | `deepseek-chat` |
| 通义千问 | `QWEN_API_KEY` | `QWEN_BASE_URL` | `qwen-plus` |
| SiliconFlow | `SILICONFLOW_API_KEY` | `SILICONFLOW_BASE_URL` | `deepseek-ai/DeepSeek-V4-Flash` |
| OpenAI | `OPENAI_API_KEY` | `OPENAI_BASE_URL` | `gpt-5.6-luna` |

自定义供应商必须提供 HTTPS 地址。可信私有部署如需连接本机 Ollama 等 HTTP 端点，可设置 `ALLOW_LOCAL_PROVIDER=true`；不要在公开服务中启用。

## 接口说明

`POST /api/rewrite`

```json
{
  "text": "今天下雨。",
  "style": "inner_monologue",
  "providers": [
    { "id": "mock", "label": "本地演示" },
    { "id": "qwen", "label": "通义千问", "apiKey": "临时密钥" }
  ]
}
```

响应类型为 `application/x-ndjson`。事件包括：

- `provider_start`
- `provider_delta`
- `provider_done`
- `provider_error`

## 质量检查

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run test:e2e
```

完整静态检查、单元测试和构建：

```bash
npm run check
```

Docker 发布前额外运行：

```bash
docker compose config
docker build -t inland-echoes:verify .
APP_PORT=3311 docker compose -p inland-echoes-verify up --build -d
docker compose -p inland-echoes-verify ps
docker compose -p inland-echoes-verify down --remove-orphans
```

### SiliconFlow 模型性价比测试

测试工具使用两组固定中文改写样本，以相同参数并发测试多个候选模型，再由独立模型按事实保真、风格完成度、原创性、可读性和指令遵循进行盲评。报告只保存模型输出、延迟、令牌用量和估算费用，不记录请求头或接口密钥。

```bash
npm run benchmark:siliconflow:dry
npm run benchmark:siliconflow
```

密钥从已被 Git 忽略的 `.env.local` 读取，报告生成在同样被忽略的 `benchmark-results/`。价格快照来自 SiliconFlow 官方价格页，运行前应确认平台实时价格是否变化。

2026-07-15 使用两组中文改写样本、生产用“生成后校验 + 必要时压缩”策略的结果：

| 模型 | 盲评质量 | 严格成功率 | 平均延迟 | 100 次估算费用 |
| --- | ---: | ---: | ---: | ---: |
| DeepSeek-V4-Flash | 7.4 / 10 | 2 / 2 | 13.98 s | ¥0.0338 |
| Qwen3.5-35B-A3B | 6.4 / 10 | 2 / 2 | 5.48 s | ¥0.0510 |
| Qwen3.6-35B-A3B | 6.9 / 10 | 2 / 2 | 4.91 s | ¥0.2494 |

因此默认使用 `deepseek-ai/DeepSeek-V4-Flash`：质量最高且估算费用最低；Qwen3.5 可作为更快的低价备选。DeepSeek-V3.2 文风优秀，但延迟和费用更高，且短文本长度遵循不稳定。样本量较小，生产决策前应加入真实业务文本复测。

## 隐私与部署提示

- 不要把生产接口密钥写进浏览器代码或提交到 Git。
- 服务不会主动记录输入文本和接口密钥；云平台的代理日志策略仍需单独核对。
- 对外开放前建议配置 HTTPS、WAF/验证码，以及供应商侧预算上限。
- 中国大陆公开网站部署还需按实际主体和云厂商要求处理备案与合规配置。

## 开源许可证

本项目采用 [MIT 许可证](./LICENSE) 完全开源。你可以自由使用、复制、修改、合并、发布、分发、再许可或销售本项目副本，但需保留原始版权与许可声明。
