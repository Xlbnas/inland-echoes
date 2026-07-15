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
- 响应式界面、键盘焦点、减少动效模式
- Docker 多阶段构建和 Docker Compose 一键启动

## 本地开发

```bash
npm install
npm run dev
```

打开 <http://localhost:3000>。默认选择“本地演示”，不需要配置接口。

## 使用 Docker Compose 部署

```bash
cp .env.example .env
docker compose up --build
```

服务：

- 应用：<http://localhost:3000>
- 健康检查：<http://localhost:3000/api/health>
- Redis：仅在 Compose 内部暴露

停止服务：

```bash
docker compose down
```

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
