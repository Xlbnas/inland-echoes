# 极乐迪斯科｜内陆回声

一个非官方、完全开源的《极乐迪斯科》相关中文文本改写工作台。支持 DeepSeek、通义千问、OpenAI、SiliconFlow，以及显式启用后的 OpenAI Chat Completions 兼容接口；最多可以同时选择三个模型并列比较流式输出。

> 本项目为非官方开源项目，不内置或检索游戏原文。

## 功能

- 四种改写预设：心理黑色侦探、黑色幽默、多声部内心独白、抒情意识流
- 多供应商并行流式输出（NDJSON）
- DeepSeek、通义千问、OpenAI、SiliconFlow 内置配置
- 默认关闭的自定义 OpenAI 兼容接口地址、模型和临时接口密钥
- 本地确定性结构演示，无需任何接口密钥即可开发和自动测试；不代表真实模型文学质量，也不参与模型推荐
- 按供应商数量、文本长度和判定成本加权的 Redis 限流；Redis 不可用时自动退回有界进程内限流
- 自定义供应商 URL 的 DNS 校验、连接地址绑定、重定向拒绝和响应体限制
- 响应式界面、键盘焦点、完整减少动效模式
- 统一的“档案 / 信号 / 压印”动效系统；远端增量进入独立 Unicode 打字队列，不为每个字符创建 DOM 节点
- 结构化 system/user 提示词、分长度合同、认知频道/判定结果质量校验与一次定向修复
- 闭世界事实边界、确定性数字/日期/时间/金额/百分比/引语锚点，以及默认关闭的独立事实审计器
- 上游鉴权、限流、超时、不可用、空响应、截断与质量失败的稳定错误分类
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
- 保持 `CUSTOM_PROVIDERS_ENABLED=false`；公开部署不建议开放用户自定义模型地址。
- 保持 `ALLOW_LOCAL_PROVIDER=false`；只有已开启自定义线路且可信私有网络需要访问本地 HTTP 模型接口时才启用。

## 模型供应商

所有内置供应商都可以通过 `.env` 配置。也可以在页面中输入临时密钥；临时密钥只保存在页面内存，并随单次请求发送，不会进入 localStorage、数据库或日志。

| 供应商 | 密钥变量 | 接口地址变量 | 默认模型 |
| --- | --- | --- | --- |
| DeepSeek | `DEEPSEEK_API_KEY` | `DEEPSEEK_BASE_URL` | `deepseek-chat` |
| 通义千问 | `QWEN_API_KEY` | `QWEN_BASE_URL` | `qwen-plus` |
| SiliconFlow | `SILICONFLOW_API_KEY` | `SILICONFLOW_BASE_URL` | `deepseek-ai/DeepSeek-V4-Flash` |
| OpenAI | `OPENAI_API_KEY` | `OPENAI_BASE_URL` | `gpt-5.6-luna` |

### SiliconFlow 模型选择

SiliconFlow 使用固定的内置接口地址，但允许在页面选择两种模型来源：

- 系统推荐：来自服务端维护的推荐目录，可以使用部署服务器 Key 或用户临时 Key。
- 自定义模型 ID：仍调用内置 SiliconFlow 地址，不属于“自定义供应商”，也不受 `CUSTOM_PROVIDERS_ENABLED` 控制。

服务端会根据 `modelId` 是否在推荐白名单中重新判定来源，不信任客户端声明。自定义模型 ID 默认必须使用用户自己的临时 Key；只有管理员明确设置 `SILICONFLOW_ALLOW_CUSTOM_MODEL_WITH_SERVER_KEY=true` 才能消耗服务器 Key。临时 Key 只存在当前页面内存，不进入 localStorage、URL、日志、响应或基准报告。

推荐目录可通过 `SILICONFLOW_RECOMMENDED_MODELS_JSON` 配置并由 Zod 校验。配置为空或非法时，应用安全回退到 `SILICONFLOW_MODEL`，并把它标记为“待验证候选”，不会冒充已完成项目实测。系统推荐来自本项目自己的完整基准，不是 SiliconFlow 官方排名；平台模型可用性随时可能变化。

示例：

```dotenv
SILICONFLOW_RECOMMENDED_MODELS_JSON=[{"id":"vendor/model","label":"综合候选","profile":"balanced","description":"项目完整基准确认","strengths":["事实保真稳定"],"cautions":["响应较慢"],"benchmarkStatus":"verified","verifiedAt":"2026-07-15T00:00:00.000Z"}]
SILICONFLOW_ALLOW_CUSTOM_MODEL_WITH_SERVER_KEY=false
SILICONFLOW_AUDIT_MODEL=
REWRITE_FACT_AUDIT_ENABLED=false
```

事实审计默认关闭，避免未经评估直接增加生产费用。开启后，生成仍最多只修复一次；审计服务失败不会被报告成正文生成失败。

### 自定义线路安全

自定义线路默认关闭。只有明确设置以下变量时，页面才显示自定义线路入口，服务端才接受未知供应商 ID：

```dotenv
CUSTOM_PROVIDERS_ENABLED=true
```

自定义线路会把本次正文和页面内填写的临时密钥发送到用户提供的服务地址。公网部署不建议开启。服务端会在请求前解析全部 A/AAAA 地址，拒绝私网、环回、链路本地、保留地址、云环境 metadata 目标和公私混合解析，并把实际连接固定到已验证地址；TLS 仍使用原 hostname 完成 SNI 与证书校验。所有 3xx 重定向都会被拒绝，同时限制响应头等待时间、总请求时间、响应体、单个 SSE frame 和累计输出大小。

`ALLOW_LOCAL_PROVIDER` 与自定义线路开关职责不同：前者不会启用自定义线路，只在 `CUSTOM_PROVIDERS_ENABLED=true` 后允许可信私有部署访问本地 HTTP 服务。它不适合公网部署，metadata 目标仍会被拒绝。

### 可信代理与限流

默认 `TRUST_PROXY=false`，应用完全忽略 `X-Forwarded-For` 和 `X-Real-IP`，所有直连访客使用一个共享安全限流桶。这会降低直连模式的并发额度，但用户无法通过伪造请求头生成无限限流 key。

只有应用确实位于可信反向代理后方时才设置：

```dotenv
TRUST_PROXY=true
RATE_LIMIT_UNITS_PER_MINUTE=60
```

反向代理必须覆盖客户端传入的 `X-Forwarded-For` 和 `X-Real-IP`，不能在未经清理的用户头后简单追加。应用会严格解析代理头并把规范化地址哈希为固定长度标识。每次请求按供应商数量、文本长度和是否启用判定消耗单位，多供应商和长文本消耗更高；Redis 与内存回退使用相同语义。

### 判定关闭语义

关闭 2D6 判定后不会生成成功、失败、极佳通过或灾难性误判标签，也不会伪造骰点。多声部内心独白仍使用 2–4 个不带结果的原创认知频道；心理黑色侦探、黑色幽默和抒情意识流以自然叙事为主，频道标签可完全省略。

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

### SiliconFlow 生产质量基准

基准直接复用生产 Prompt、长度合同、质量校验、事实审计、定向修复和生成参数。固定矩阵包含 22 个原创、人工编写、非私人案例，覆盖 2–1000 字、四种判定结果、六个认知频道、四种风格、注入/XML/换行/中英混合/数字/引语等边界。长文本是独立自然叙述，不使用 `repeat` 或 `slice` 拼接。

先查询候选是否仍存在：

```bash
npm run siliconflow:models
```

该命令只在显式运行时访问上游，脱敏快照写入已被 Git 忽略的 `benchmark-results/model-snapshots/`；查询失败不会影响应用启动。

快速横向测试：

```bash
npm run benchmark:siliconflow:quality -- --models=deepseek-ai/DeepSeek-V4-Flash,Qwen/Qwen3.5-35B-A3B --runs=1
```

完整推荐矩阵至少运行 20 个案例 × 每模型 3 次：

```bash
npm run benchmark:siliconflow:quality -- --models=<候选模型列表> --runs=3
```

密钥只从 `SILICONFLOW_API_KEY` 读取；可用 `SILICONFLOW_JUDGE_MODEL` 指定独立评审模型，`SILICONFLOW_BENCHMARK_AUDIT=true` 可强制启用事实审计。为避免上游长请求污染同账户的后续模型，默认全局并发和每模型并发均为 1；可用 `SILICONFLOW_BENCHMARK_CONCURRENCY` 与 `SILICONFLOW_BENCHMARK_PER_MODEL_CONCURRENCY` 调整，但脚本把全局并发硬限制在 2 以内。基准会产生真实费用，请先确认账户预算。

报告分别记录 `generationStatus`、`localValidationStatus`、`auditStatus` 和 `judgeStatus`。Judge 超时或非法 JSON 不会覆盖正文生成状态；“仅成功平均分”和“全部请求综合分”同时展示，后者把生成失败、最终合同失败、Judge 失败及严重事实发明计为 0，避免幸存者偏差。报告、正文、模型快照和候选推荐文件都位于已被忽略的 `benchmark-results/`，基准不会自动改写生产推荐目录。

当前静态目录只把部署默认模型列为“待验证候选”，尚未据第二轮完整多模型基准宣称任何模型为正式推荐。本地演示继续保留，仅用于结构展示和自动测试。

## 隐私与部署提示

- 不要把生产接口密钥写进浏览器代码或提交到 Git。
- 服务不会主动记录输入文本和接口密钥；云平台的代理日志策略仍需单独核对。
- 对外开放前建议配置 HTTPS、WAF/验证码，以及供应商侧预算上限。
- 中国大陆公开网站部署还需按实际主体和云厂商要求处理备案与合规配置。

## 开源许可证

本项目采用 [MIT 许可证](./LICENSE) 完全开源。你可以自由使用、复制、修改、合并、发布、分发、再许可或销售本项目副本，但需保留原始版权与许可声明。
