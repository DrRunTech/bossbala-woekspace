#!/usr/bin/env bash
# 一键启动本地 AI 隧道：把本机 Ollama 暴露成公网 https 地址，
# 供 Base44 云端后端函数 (AI_PROVIDER=LOCAL) 调用 qwen3 / deepseek。
# 用法：bash start-local-ai.sh [--port 11434]
set -e

PORT="${PORT:-11434}"
[[ "${1:-}" == "--port" ]] && PORT="$2"

say() { printf "\033[1;36m» %s\033[0m\n" "$1"; }
err() { printf "\033[1;31m✗ %s\033[0m\n" "$1" >&2; }

# ---------- 1. Ollama ----------
if ! command -v ollama >/dev/null 2>&1; then
  err "未找到 ollama，请先安装：https://ollama.com/download"
  exit 1
fi

# 检查本机端口是否已有 Ollama 在跑
if ! curl -s "http://127.0.0.1:${PORT}/v1/models" >/dev/null 2>&1; then
  say "启动 Ollama（监听 0.0.0.0:${PORT}，允许外部来源）…"
  OLLAMA_HOST="0.0.0.0:${PORT}" OLLAMA_ORIGINS="*" nohup ollama serve >"$HOME/.ollama-serve.log" 2>&1 &
  echo $! > "$HOME/.ollama-ai.pid"
  sleep 3
fi

# 确认必备模型已拉取
for M in qwen3 deepseek-r1:8b qwen3-embedding:0.6b; do
  if ! curl -s "http://127.0.0.1:${PORT}/api/show" -d "{\"name\":\"$M\"}" >/dev/null 2>&1; then
    say "拉取模型 $M（首次较慢）…"
    ollama pull "$M" || err "拉取 $M 失败，可稍后手动 ollama pull $M"
  fi
done

say "Ollama 就绪：http://127.0.0.1:${PORT}"

# ---------- 2. 隧道 ----------
URL=""
if command -v cloudflared >/dev/null 2>&1; then
  say "使用 cloudflared 建立隧道…"
  cloudflared tunnel --url "http://127.0.0.1:${PORT}" >"$HOME/.cf-ai-tunnel.log" 2>&1 &
  echo $! > "$HOME/.cf-ai.pid"
  say "从日志中提取公网地址（最多 40s）…"
  for i in $(seq 1 40); do
    URL=$(grep -oE "https://[a-z0-9-]+\.trycloudflare\.com" "$HOME/.cf-ai-tunnel.log" 2>/dev/null | head -n1 || true)
    [[ -n "$URL" ]] && break
    sleep 1
  done
elif command -v ngrok >/dev/null 2>&1; then
  say "使用 ngrok 建立隧道…"
  ngrok http "${PORT}" --log=stdout >"$HOME/.ngrok-ai-tunnel.log" 2>&1 &
  echo $! > "$HOME/.ngrok-ai.pid"
  for i in $(seq 1 40); do
    URL=$(grep -oE "https://[a-z0-9-]+\.ngrok" "$HOME/.ngrok-ai-tunnel.log" 2>/dev/null | head -n1 || true)
    [[ -n "$URL" ]] && break
    sleep 1
  done
  if [[ -z "$URL" ]] && command -v curl >/dev/null 2>&1; then
    URL=$(curl -s http://127.0.0.1:4040/api/tunnels 2>/dev/null | grep -oE "https://[a-z0-9-]+\.ngrok" | head -n1 || true)
  fi
else
  err "未找到 cloudflared 或 ngrok。安装其一："
  echo "  macOS:  brew install cloudflared       # 或  brew install ngrok"
  echo "  Linux:  https://github.com/cloudflare/cloudflared/releases"
  exit 1
fi

if [[ -z "$URL" ]]; then
  err "未能自动获取公网地址，请查看日志："
  echo "  cloudflared: tail -f $HOME/.cf-ai-tunnel.log"
  echo "  ngrok:        tail -f $HOME/.ngrok-ai-tunnel.log"
  exit 1
fi

echo
printf "\033[1;32m========================================\033[0m\n"
printf "\033[1m公网地址（填入 Base44 secret LOCAL_AI_GATEWAY_URL）：\033[0m\n"
printf "\033[1;33m%s\033[0m\n" "$URL"
printf "\033[1;32m========================================\033[0m\n"
echo "日志：  cloudflared -> $HOME/.cf-ai-tunnel.log   Ollama -> $HOME/.ollama-serve.log"
echo "停止：  bash stop-local-ai.sh"