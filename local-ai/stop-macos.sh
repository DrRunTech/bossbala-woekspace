#!/usr/bin/env bash
# 停止本地 AI 网关相关进程（macOS / Linux）
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
say() { printf "\033[1;36m» %s\033[0m\n" "$1"; }

for P in "$SCRIPT_DIR/.tunnel.pid" "$SCRIPT_DIR/.gateway.pid" "$SCRIPT_DIR/.ollama.pid"; do
  if [ -f "$P" ]; then
    kill "$(cat "$P")" 2>/dev/null && say "已停止 $(basename "$P")"
    rm -f "$P"
  fi
done
say "完成。"