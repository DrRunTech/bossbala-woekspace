# 本地 AI 网关 — 安装与操作指南（面向客户交付）

> BossBala 的后端 AI（Ask BossBala、自动风险检测、周期对比、生成分析）可切换到**本地 Ollama**（qwen3 + deepseek-r1），所有推理在你自己的电脑上完成，数据不出本机。
> 本包提供一套**可一键跑通**的本地网关 + 启停脚本 + 本指南，支持 **macOS / Windows / Linux**。

---

## 0. 它是怎么工作的

```
Base44 云端后端  ──HTTPS──▶  公网隧道  ──▶  本网关(:8080, Bearer 鉴权)  ──▶  本机 Ollama(11434)  ──▶  qwen3 / deepseek
```

为什么需要「公网隧道」：Base44 后端跑在云端沙箱，**无法访问你电脑的 `127.0.0.1` / 局域网 IP**（平台会拦成 403，这是 SSRF 防护）。所以本机的服务必须先暴露成一个公网 https 地址。

为什么需要「本网关」而不直连 Ollama：Ollama 自身**不校验 API Key**，谁拿到隧道地址都能白嫖你的显卡。本网关在 Ollama 前加一层 **Bearer Token 鉴权**，只有拿着 Key 的 Base44 后端能调用，安全可交付。

---

## 1. 环境准备

### 1.1 硬件
- 建议 16GB 以上内存、Apple Silicon（M1+）或带 8GB+ 显存的 NVIDIA / AMD GPU；纯 CPU 也能跑，但较慢。
- 磁盘：模型约 5~10GB。

### 1.2 安装 Ollama
- **macOS**：https://ollama.com/download 下载 `.dmg` 安装；或 `brew install ollama`。
- **Windows**：https://ollama.com/download 下载安装包；安装后在开始菜单启动一次 Ollama（任务栏出现羊驼图标）。
- **Linux**：`curl -fsSL https://ollama.com/install.sh | sh`

验证：终端执行 `ollama --version` 有版本号即成功。

### 1.3 安装 Python（仅 Windows 需要；macOS 自带 python3）
- Windows：https://www.python.org/downloads/ 下载 Python 3.8+，安装时**务必勾选 “Add python.exe to PATH”**。
- 验证：终端执行 `python --version`。

### 1.4 安装隧道工具（二选一，推荐 cloudflared）
- **cloudflared（推荐，免费免登录）**
  - macOS：`brew install cloudflared`
  - Windows（PowerShell）：`winget install --id Cloudflare.cloudflared`
  - Linux：见 https://github.com/cloudflare/cloudflared/releases
- **ngrok**（备选，需注册）
  - macOS：`brew install ngrok` ｜ Windows：`winget install ngrok`
  - 首次需 `ngrok config add-authtoken <你的token>`

> 隧道工具只需在「建立公网隧道」时用到。如果你已有别的把本机端口暴露成 https 的方式（如公司内网穿透、自有域名反代），可跳过隧道工具，直接把该地址指向网关端口 `8080`。

---

## 2. 一键启动

### macOS / Linux
```bash
cd local-ai
bash start-macos.sh
```

### Windows
- 方式一：右键 `start-windows.ps1` → “用 PowerShell 运行”。
- 方式二：在 PowerShell 里执行：
  ```powershell
  cd local-ai
  powershell -ExecutionPolicy Bypass -File start-windows.ps1
  ```
> 若提示执行策略受限，加 `-ExecutionPolicy Bypass` 即可（脚本只在本机启动进程，不改动系统）。

脚本会依次：启动 Ollama → 拉取模型（首次较慢，请耐心）→ 生成一个鉴权 Key（保存在 `.gateway-env`）→ 启动网关 → 建立公网隧道，最后打印类似：

```
========================================
本地 AI 网关已启动

公网地址（填入 Base44 secret LOCAL_AI_GATEWAY_URL）：
https://xxxx-xxxx-xxxx.trycloudflare.com
API Key（填入 Base44 secret LOCAL_AI_GATEWAY_API_KEY）：
a1b2c3...（48 位十六进制）
模型（填入 CHAT_MODEL / ANALYSIS_MODEL / REASONING_MODEL / EMBEDDING_MODEL）：
  qwen3  |  deepseek-r1:8b  |  nomic-embed-text
========================================
```

**把这两个值记下来**，下一步填进 Base44。

---

## 3. 在 Base44 配置 secrets

进入应用后台（Builder）→ 应用设置 → Secrets，填入：

| Secret | 值 |
|---|---|
| `AI_PROVIDER` | `LOCAL` |
| `LOCAL_AI_GATEWAY_URL` | 上一步的公网 https 地址，如 `https://xxxx.trycloudflare.com` |
| `LOCAL_AI_GATEWAY_API_KEY` | 上一步的 API Key |
| `CHAT_MODEL` | `qwen3` |
| `ANALYSIS_MODEL` | `qwen3` |
| `REASONING_MODEL` | `deepseek-r1:8b` |
| `EMBEDDING_MODEL` | `nomic-embed-text` |

> 切回云端模型：只需把 `AI_PROVIDER` 改成 `CLOUD`，其余不动。
> 模型名必须与 `ollama list` 显示的**完全一致**。若你拉的是 `qwen3:8b`，就把 `CHAT_MODEL` 也填 `qwen3:8b`。

---

## 4. 验证连通

### 4.1 本机自检
```bash
# 网关健康
curl http://127.0.0.1:8080/healthz
# 带 Key 调模型列表
curl http://127.0.0.1:8080/v1/models -H "Authorization: Bearer <你的Key>"
# 带 Key 跑一次对话
curl http://127.0.0.1:8080/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <你的Key>" \
  -d '{"model":"qwen3","stream":false,"messages":[{"role":"user","content":"说一句话证明你能工作"}]}'
```
Windows PowerShell：
```powershell
$h = @{ Authorization = "Bearer <你的Key>"; "Content-Type" = "application/json" }
Invoke-RestMethod http://127.0.0.1:8080/v1/models -Headers $h
```

### 4.2 公网自检
把上面的 `127.0.0.1:8080` 换成你的公网隧道地址再测一次。本机通、公网通，Base44 就能通。

### 4.3 在 Base44 里验证
调用 `aiGateway` 后端函数：
```json
{ "action": "status" }
```
期望返回：
```json
{ "ok": true, "provider": "LOCAL", "gatewayStatus": "online",
  "ollamaStatus": "online", "models": ["qwen3","deepseek-r1:8b", ...] }
```
再跑连通测试：
```json
{ "action": "test" }
```
返回 `ok: true` 且 `chat.content` 有内容即全链路打通。然后到「Ask BossBala」页面提问即可。

---

## 5. 停止

- macOS / Linux：`bash stop-macos.sh`
- Windows：`powershell -ExecutionPolicy Bypass -File stop-windows.ps1`

---

## 6. 常见问题排查

| 现象 | 原因 / 解决 |
|---|---|
| `gatewayStatus: auth_error` (HTTP 401) | 网关 API Key 与 Base44 里 `LOCAL_AI_GATEWAY_API_KEY` 不一致。重新看 `.gateway-env` 里的 `GATEWAY_API_KEY`。 |
| `gatewayStatus: unreachable` | 隧道断了 / 网关或 Ollama 没跑。重启启动脚本；本机 `curl http://127.0.0.1:8080/healthz` 确认网关，`curl http://127.0.0.1:11434/v1/models` 确认 Ollama。 |
| `models: []` 但 status online | 模型名不匹配。用 `ollama list` 的确切名字填进 `CHAT_MODEL` 等。 |
| 拉模型卡住 / 很慢 | 首次下载模型体积大，属正常；也可先只拉小模型 `qwen3:4b`、`deepseek-r1:1.5b` 验证链路。 |
| 分析返回里混入“思考” | 网关已剥离思考块；若仍出现，确认 `ANALYSIS_MODEL` 用 qwen3（非 deepseek-r1 思考模型）。 |
| 首次提问很慢 / 超时 | 本地模型首次加载慢；Base44 后端超时 30s，小显存建议用更小参数模型。 |
| 隧道域名每次重启都变 | 临时隧道特性。需固定域名：用 cloudflared named tunnel 绑你的域名，或在网关前用自有反代。 |
| Windows 下 `python` 找不到 | 安装 Python 时未勾选 Add to PATH；或改用 `py`。重装并勾选，或把 `py` 加入 PATH。 |
| Windows 执行脚本被拦截 | 加 `-ExecutionPolicy Bypass` 运行；或对脚本文件取消阻止（属性→勾选“解除锁定”）。 |

### 本机快速自检命令
```bash
curl http://127.0.0.1:11434/v1/models            # Ollama 在跑？
curl http://127.0.0.1:8080/healthz                # 网关在跑？
curl https://<你的隧道地址>/v1/models \
  -H "Authorization: Bearer <你的Key>"             # 公网 + 鉴权通？
```

---

## 7. 安全说明

- **API Key 只存本机 + Base44 后端**：Key 保存在本机 `.gateway-env`（已设 600 权限）和 Base44 secrets 里；Base44 前端永不接触 Key，所有调用经云端后端代理。
- **网关默认强制鉴权**：只要 `GATEWAY_API_KEY` 已设置（脚本会自动生成），任何不带正确 Bearer 的请求都会被拒。
- **数据不出本机**：推理全部在你本机的 Ollama 完成；只有文本 prompt 经隧道进出，文件正文不离开本机。
- **切回云端**：改 `AI_PROVIDER=CLOUD` 即用云端模型，本地服务可停。

---

## 8. 打包交付给客户

本目录 `local-ai/` 即为可交付包，包含：

| 文件 | 作用 |
|---|---|
| `ollama_gateway.py` | 本地网关（零依赖，仅 Python 标准库） |
| `start-macos.sh` / `stop-macos.sh` | macOS / Linux 启停脚本 |
| `start-windows.ps1` / `stop-windows.ps1` | Windows 启停脚本 |
| `README.md` | 本指南 |

交付建议：
1. 把整个 `local-ai/` 文件夹拷给客户。
2. 让客户按本指南第 1 节装好 Ollama（+ Windows 装 Python）和 cloudflared。
3. 客户运行 `start-macos.sh` / `start-windows.ps1`，把打印出的**公网地址**和 **API Key** 发回给你。
4. 你把这两个值填进该客户应用的 Base44 secrets（`LOCAL_AI_GATEWAY_URL` / `LOCAL_AI_GATEWAY_API_KEY`），并把 `AI_PROVIDER` 设为 `LOCAL`。
5. 用第 4 节验证连通即可。

> 提示：每个客户的网关 Key 相互独立；若一台机器服务多个客户应用，可分别用不同 `GATEWAY_PORT` 与 Key 启动多实例。