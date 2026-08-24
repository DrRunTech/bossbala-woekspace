#!/usr/bin/env bash
# 停止本脚本启动的 Ollama 与隧道进程
say() { printf "\033[1;36m» %s\033[0m\n" "$1"; }

for P in "$HOME/.cf-ai.pid" "$HOME/.ngrok-ai.pid" "$HOME/.ollama-ai.pid"; do
  [[ -f "$P" ]] && kill "$(cat "$P")" 2>/dev/null && say "已停止 $(basename "$P")" && rm -f "$P"
done
say "完成。"