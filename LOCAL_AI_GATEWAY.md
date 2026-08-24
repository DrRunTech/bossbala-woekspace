# Local AI Gateway — qwen3 / deepseek 接入指南

BossBala 的后端 AI（Ask BossAI、自动风险检测、周期对比、生成分析）默认走云端大模型。
本指南让你切换到**本地 Ollama**（qwen3 + deepseek-r1），所有分析在本地推理完成。

---

## 0. 工作原理（为什么必须用隧道）

```
Base44 云端后端函数  ──HTTPS──▶  公网隧道  ──▶  你电脑上的 Ollama (11434)  ──▶  qwen3 / deepseek
```

> ⚠️ Base44 后端跑在云端沙箱，**无法访问 `127.0.0.1` / 局域网 IP**（平台会直接拦成 403，
> 这是 SSRF 防护）。所以你本机的 Ollama 必须通过**公网隧道**暴露成一个 https 地址，
> 再把这个地址填进 secret `LOCAL_AI_GATEWAY_URL`。

网关代码：`base44/shared/aiGateway.ts`（v2，直连 Ollama OpenAI 兼容接口）。
后端函数入口：`base44/functions/aiGateway/entry.ts`。

---

## 1. 安装 Ollama 并拉取模型

```bash
# macOS / Linux / Windows 按 https://ollama.com/download 安装
ollama pull qwen3                 # 默认对话 + 分析模型
ollama pull deepseek-r1:8b        # 推理模型
ollama pull nomic-embed-text      # 向量嵌入（可选，用于语义检索）
ollama list                       # 确认已拉取的模型名
```

> 模型名必须与 `ollama list` 显示的**完全一致**。如果你拉的是 `qwen3:8b`，
> 就把 secret `CHAT_MODEL` 填成 `qwen3:8b`，以此类推。

本地验证一下 Ollama 的 OpenAI 接口能用：

```bash
curl http://127.0.0.1:11434/v1/chat/completions -H "Content-Type: application/json" -d '{
  "model":"qwen3","stream":false,
  "messages":[{"role":"user","content":"说一句话证明你能工作"}]
}'
```

能看到 `choices[0].message.content` 返回内容即说明 Ollama 就绪。

---

## 2. 暴露成公网地址（二选一）

### 方案 A：cloudflared（推荐，免费、稳定）

```bash
# 安装：macOS  brew install cloudflared   |  Linux 见 https://github.com/cloudflare/cloudflared/releases
cloudflared tunnel --url http://127.0.0.1:11434
```

输出里会有一行：
```
Your quick Tunnel has been created! Visit it at:
  https://xxxx-xxxx-xxxx.trycloudflare.com
```
复制这个 https 地址。

### 方案 B：ngrok

```bash
# 安装：macOS  brew install ngrok   |  https://ngrok.com
ngrok http 11434
```
终端「Forwarding」行的 https 地址即是。

### 方案 C：一键脚本（已生成）

项目根目录已带 `start-local-ai.sh` / `stop-local-ai.sh`：

```bash
chmod +x start-local-ai.sh
./start-local-ai.sh        # 自动拉起 Ollama + 拉模型 + 建隧道，打印公网地址
./stop-local-ai.sh         # 停掉
```

> 每次重启隧道，临时域名会变；若要固定域名，用 cloudflared 的 named tunnel 绑自己的域名。

---

## 3. 在 Base44 里填 secrets

进入应用的 **Settings（设置）** → 后台 secrets（或通过 Builder 界面），设置：

| Secret | 值 |
|---|---|
| `AI_PROVIDER` | `LOCAL` |
| `LOCAL_AI_GATEWAY_URL` | 上一步的公网 https 地址，如 `https://xxxx.trycloudflare.com` |
| `LOCAL_AI_GATEWAY_API_KEY` | 任意字符串即可（Ollama 默认不校验；只有当隧道加了鉴权时才需匹配） |
| `CHAT_MODEL` | `qwen3`（或 `qwen3:8b`，与 `ollama list` 一致） |
| `ANALYSIS_MODEL` | `qwen3`（分析也用 qwen3；要更稳可填 `qwen3`） |
| `REASONING_MODEL` | `deepseek-r1:8b` |
| `EMBEDDING_MODEL` | `nomic-embed-text` |

> 切回云端只需把 `AI_PROVIDER` 改成 `CLOUD`，其余不动。

---

## 4. 验证（调试）

### 4.1 状态检查
调用 `aiGateway` 后端函数，action = `status`：

```js
// 在 Base44 后端测试面板执行 aiGateway，payload:
{ "action": "status" }
```

期望返回：
```json
{ "ok": true, "provider": "LOCAL", "gatewayStatus": "online",
  "ollamaStatus": "online", "models": ["qwen3","deepseek-r1:8b", ...] }
```

### 4.2 连通性测试
```js
{ "action": "test" }   // 会做一次健康检查 + 一次 ping 对话
```

### 4.3 真实问答
Ask BossAI 页面提问，或测试 `askBossAI` 函数：
```js
{ "question": "我的项目进展如何？" }
```
返回 `answer.conclusion` 有内容即成功。

---

## 5. 常见问题排查

| 现象 | 原因 / 解决 |
|---|---|
| `gatewayStatus: auth_error` (HTTP 403) | ① URL 还是 `127.0.0.1` → 换成公网隧道地址；② 隧道加了鉴权但 `LOCAL_AI_GATEWAY_API_KEY` 不匹配。 |
| `gatewayStatus: unreachable` | 隧道断了 / Ollama 没跑。重启 `./start-local-ai.sh`，本机 `curl http://127.0.0.1:11434/v1/models` 确认。 |
| `models: []` 但 status online | 模型名解析问题；用 `ollama list` 的确切名字填进 `CHAT_MODEL`。 |
| Ask BossAI 返回 `analysis_failed` / 空结论 | 多半是网关没通。先过 4.1 / 4.2；通了再查后端函数日志。 |
| 分析结果里混入 `“思考”/`` | 网关已自动剥离 `“思考”`块；若仍出现，确认用的是最新 `aiGateway.ts`（含 `stripReasoning`）。 |
| JSON 解析失败回退成字符串 | 给 qwen3 加 `“思考”`输出被剥离后仍非纯 JSON 时会回退；确保 `ANALYSIS_MODEL` 用 qwen3（非 r1 思考模型），并保持 prompt 指定 JSON schema。 |
| 慢 / 超时 | 本地模型首 token 慢；网关超时 30s。小显存用 `qwen3:4b` / `deepseek-r1:1.5b`。 |
| 隧道域名每次变 | 用 cloudflared named tunnel 绑固定域名，或在脚本里固定。 |

### 本机快速自检命令
```bash
curl http://127.0.0.1:11434/v1/models                      # Ollama 在跑？
curl https://<你的隧道地址>/v1/models                      # 隧道通？
# 隧道端对话测试
curl https://<你的隧道地址>/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model":"qwen3","stream":false,"messages":[{"role":"user","content":"ping"}]}'
```
本机通、隧道通，但 Base44 不通 → 多半是 URL 没填成公网地址（仍是 127.0.0.1）。

---

## 6. 架构与安全说明

- **密钥永不下发浏览器**：`LOCAL_AI_GATEWAY_API_KEY` 只在后端函数（云端）读取，前端不接触。
- **走后端代理**：前端永不直连 Ollama；所有 AI 调用经 `aiGateway` 后端函数 → 网关模块 → 隧道 → Ollama。
- **云/本地可热切**：改 `AI_PROVIDER` 即可，业务函数（askBossAI 等）签名与返回结构不变。
- **本地文档分析限制**：本地 Ollama 无云端多模态能力，`documentAnalyze` 在 LOCAL 模式下仅按文本 prompt 分析，不读文件图片内容；需要读图请用 `AI_PROVIDER=CLOUD`。

---

## 文件清单

- `base44/shared/aiGateway.ts` — 网关核心（v2，直连 Ollama OpenAI 接口）
- `base44/functions/aiGateway/entry.ts` — 后端代理入口（status/test/chat/analyze/embed）
- `base44/functions/askBossAI/entry.ts` 等 — 业务函数，调用网关
- `start-local-ai.sh` / `stop-local-ai.sh` — 一键启停 Ollama + 隧道
``