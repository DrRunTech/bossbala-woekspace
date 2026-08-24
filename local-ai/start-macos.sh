#!/usr/bin/env bash
# 一键启动本地 AI 网关（macOS / Linux）
# 自动：启动 Ollama → 拉模型 → 生成鉴权 Key → 启动网关 → 建公网隧道 → 打印配置
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

GATEWAY_PORT="${GATEWAY_PORT:-8080}"
OLLAMA_PORT="${OLLAMA_PORT:-11434}"
ENV_FILE="$SCRIPT_DIR/.gateway-env"

say() { printf "\033[1;36m» %s\033[0m\n" "$1"; }
err() { printf "\033[1;31m✗ %s\033[0m\n" "$1" >&2; }

# ---------- 1. Ollama ----------
if ! command -v ollama >/dev/null 2>&1; then
  err "未找到 ollama，请先安装：https://ollama.com/download"
  exit 1
fi
if ! curl -s "http://127.0.0.1:${OLLAMA_PORT}/v1/models" >/dev/null 2>&1; then
  say "启动 Ollama（127.0.0.1:${OLLAMA_PORT}）…"
  nohup ollama serve >"$SCRIPT_DIR/.ollama.log" 2>&1 &
  echo $! > "$SCRIPT_DIR/.ollama.pid"
  sleep 4
fi

# ---------- 2. 拉取模型 ----------
for M in qwen3 deepseek-r1:8b nomic-embed-text; do
  if ! curl -s "http://127.0.0.1:${OLLAMA_PORT}/api/show" -d "{\"name\":\"$M\"}" >/dev/null 2>&1; then
    say "拉取模型 $M（首次较慢）…"
    ollama pull "$M" || err "拉取 $M 失败，可稍后手动 ollama pull $M"
  fi
done
say "Ollama 就绪：127.0.0.1:${OLLAMA_PORT}"

# ---------- 3. 生成 / 读取 API Key ----------
if [ ! -f "$ENV_FILE" ]; then
  KEY=$(openssl rand -hex 24 2>/dev/null || python3 -c "import secrets;print(secrets.token_hex(24))")
  cat > "$ENV_FILE" <<EOF
GATEWAY_API_KEY=$KEY
GATEWAY_PORT=$GATEWAY_PORT
OLLAMA_HOST=127.0.0.1:$OLLAMA_PORT
EOF
  chmod 600 "$ENV_FILE"
fi
source "$ENV_FILE"
say "网关 API Key：$GATEWAY_API_KEY"

# ---------- 4. 启动本地网关 ----------
if curl -s "http://127.0.0.1:${GATEWAY_PORT}/healthz" >/dev/null 2>&1; then
  say "网关已在运行（端口 $GATEWAY_PORT）"
else
  say "启动本地网关（端口 $GATEWAY_PORT）…"
  nohup env "GATEWAY_API_KEY=$GATEWAY_API_KEY" "GATEWAY_PORT=$GATEWAY_PORT" "OLLAMA_HOST=127.0.0.1:$OLLAMA_PORT" \
    python3 "$SCRIPT_DIR/ollama_gateway.py" >"$SCRIPT_DIR/.gateway.log" 2>&1 &
  echo $! > "$SCRIPT_DIR/.gateway.pid"
  for i in $(seq 1 15); do
    curl -s "http://127.0.0.1:${GATEWAY_PORT}/healthz" >/dev/null 2>&1 && break
    sleep 1
  done
fi
if ! curl -s "http://127.0.0.1:${GATEWAY_PORT}/healthz" >/dev/null 2>&1; then
  err "网关启动失败，查看 $SCRIPT_DIR/.gateway.log"
  exit 1
fi
say "网关就绪：http://127.0.0.1:${GATEWAY_PORT}"

# ---------- 5. 公网隧道 ----------
URL=""
if command -v cloudflared >/dev/null 2>&1; then
  say "使用 cloudflared 建立隧道…"
  cloudflared tunnel --url "http://127.0.0.1:${GATEWAY_PORT}" >"$SCRIPT_DIR/.tunnel.log" 2>&1 &
  echo $! > "$SCRIPT_DIR/.tunnel.pid"
  for i in $(seq 1 40); do
    URL=$(grep -oE "https://[a-z0-9-]+\.trycloudflare\.com" "$SCRIPT_DIR/.tunnel.log" 2>/dev/null | head -n1 || true)
    [ -n "$URL" ] && break
    sleep 1
  done
elif command -v ngrok >/dev/null 2>&1; then
  say "使用 ngrok 建立隧道…"
  ngrok http "${GATEWAY_PORT}" --log=stdout >"$SCRIPT_DIR/.tunnel.log" 2>&1 &
  echo $! > "$SCRIPT_DIR/.tunnel.pid"
  for i in $(seq 1 40); do
    URL=$(grep -oE "https://[a-z0-9-]+\.ngrok" "$SCRIPT_DIR/.tunnel.log" 2>/dev/null | head -n1 || true)
    [ -n "$URL" ] && break
    sleep 1
  done
  [ -z "$URL" ] && URL=$(curl -s http://127.0.0.1:4040/api/tunnels 2>/dev/null | grep -oE "https://[a-z0-9-]+\.ngrok" | head -n1 || true)
else
  err "未找到 cloudflared 或 ngrok。安装其一："
  echo "  macOS:  brew install cloudflared   # 或  brew install ngrok"
  echo "  也可手动用任意方式把 http://127.0.0.1:${GATEWAY_PORT} 暴露成公网 https"
  exit 1
fi

if [ -z "$URL" ]; then
  err "未能自动获取公网地址，请查看 $SCRIPT_DIR/.tunnel.log"
  exit 1
fi

echo
printf "\033[1;32m========================================\033[0m\n"
printf "\033[1m本地 AI 网关已启动\033[0m\n\n"
printf "公网地址（填入 Base44 secret LOCAL_AI_GATEWAY_URL）：\n"
printf "\033[1;33m%s\033[0m\n" "$URL"
printf "API Key（填入 Base44 secret LOCAL_AI_GATEWAY_API_KEY）：\n"
printf "\033[1;33m%s\033[0m\n" "$GATEWAY_API_KEY"
printf "模型（填入 CHAT_MODEL / ANALYSIS_MODEL / REASONING_MODEL / EMBEDDING_MODEL）：\n"
printf "  qwen3  |  deepseek-r1:8b  |  nomic-embed-text\n"
printf "\033[1;32m========================================\033[0m\n"
echo "停止：bash stop-macos.sh"