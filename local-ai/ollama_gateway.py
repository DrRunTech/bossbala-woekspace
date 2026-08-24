#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Ollama 本地 AI 网关（零依赖，仅用 Python 标准库）
================================================================
把本机 Ollama 的 OpenAI 兼容接口再包一层，加上 Bearer Token 鉴权，
供 Base44 云端后端函数（AI_PROVIDER=LOCAL）通过公网隧道安全调用。

架构：
  Base44 云端后端  ──HTTPS──▶  公网隧道  ──▶  本网关(:8080, 鉴权)  ──▶  Ollama(127.0.0.1:11434)

暴露的接口（与 Ollama OpenAI 兼容）：
  GET  /healthz                 健康检查（无需鉴权）
  GET  /v1/models                模型列表
  POST /v1/chat/completions     对话 / 分析
  POST /v1/embeddings           向量嵌入
所有 /v1/* 接口要求请求头：Authorization: Bearer <GATEWAY_API_KEY>

配置（环境变量）：
  GATEWAY_API_KEY   必填，鉴权令牌（未设置则网关开放、无鉴权，不推荐）
  GATEWAY_PORT      网关监听端口，默认 8080
  OLLAMA_HOST        上游 Ollama 地址，默认 127.0.0.1:11434
  DEBUG=1            打印访问日志

运行：
  python3 ollama_gateway.py
或随启动脚本一起跑（脚本会自动注入环境变量）。
"""
import os
import sys
import json
import urllib.request
import urllib.error
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

OLLAMA_HOST = os.environ.get("OLLAMA_HOST", "127.0.0.1:11434").rstrip("/")
GATEWAY_PORT = int(os.environ.get("GATEWAY_PORT", "8080"))
API_KEY = (os.environ.get("GATEWAY_API_KEY") or "").strip()
DEBUG = os.environ.get("DEBUG", "0") == "1"

UPSTREAM_TIMEOUT = 600  # 本地模型首 token 可能较慢


def log(*args):
    print("[gateway]", *args, flush=True)


class GatewayHandler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    # ---- 工具方法 ----
    def _send_json(self, code, obj):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Authorization, Content-Type")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    def _check_auth(self):
        if not API_KEY:
            return True  # 未配置 key = 开放模式（不推荐，仅本机测试用）
        auth = self.headers.get("Authorization", "")
        if auth == "Bearer " + API_KEY:
            return True
        self._send_json(401, {"error": "unauthorized", "message": "Invalid or missing Bearer token"})
        return False

    def _proxy(self, method, path, body):
        url = "http://%s%s" % (OLLAMA_HOST, path)
        headers = {"Content-Type": "application/json"}
        req = urllib.request.Request(url, data=body, method=method, headers=headers)
        try:
            with urllib.request.urlopen(req, timeout=UPSTREAM_TIMEOUT) as resp:
                data = resp.read()
                ct = resp.headers.get("Content-Type", "application/json")
                self.send_response(resp.status)
                self.send_header("Content-Type", ct)
                self.send_header("Content-Length", str(len(data)))
                self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()
                if self.command != "HEAD":
                    self.wfile.write(data)
        except urllib.error.HTTPError as e:
            data = e.read()
            self.send_response(e.code)
            self.send_header("Content-Type", e.headers.get("Content-Type", "application/json") if e.headers else "application/json")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            if self.command != "HEAD":
                self.wfile.write(data)
        except Exception as e:  # 上游不可达等
            log("proxy error", path, repr(e))
            self._send_json(502, {"error": "upstream_error", "message": str(e)})

    # ---- HTTP 方法 ----
    def do_OPTIONS(self):
        self._send_json(200, {"ok": True})

    def do_GET(self):
        if self.path == "/healthz":
            return self._send_json(200, {"ok": True, "service": "ollama-gateway", "auth": bool(API_KEY)})
        if self.path == "/":
            return self._send_json(200, {"ok": True, "service": "ollama-gateway"})
        if not self._check_auth():
            return
        if self.path in ("/v1/models", "/api/tags"):
            return self._proxy("GET", self.path, None)
        return self._send_json(404, {"error": "not_found", "path": self.path})

    def do_POST(self):
        if not self._check_auth():
            return
        length = int(self.headers.get("Content-Length", "0") or "0")
        body = self.rfile.read(length) if length > 0 else None
        if self.path in ("/v1/chat/completions", "/v1/completions", "/v1/embeddings", "/api/generate", "/api/chat"):
            return self._proxy("POST", self.path, body)
        return self._send_json(404, {"error": "not_found", "path": self.path})

    def log_message(self, fmt, *args):
        if DEBUG:
            log(self.command, self.path, fmt % args)


def main():
    log("Ollama upstream : http://%s" % OLLAMA_HOST)
    log("Gateway listen  : 0.0.0.0:%d" % GATEWAY_PORT)
    log("Auth enabled    : %s" % ("yes" if API_KEY else "NO (open mode — set GATEWAY_API_KEY!)"))
    if not API_KEY:
        log("WARNING: 未设置 GATEWAY_API_KEY，网关对外开放、无鉴权。生产环境请务必设置。")
    try:
        server = ThreadingHTTPServer(("0.0.0.0", GATEWAY_PORT), GatewayHandler)
        server.serve_forever()
    except KeyboardInterrupt:
        log("shutting down")
        sys.exit(0)


if __name__ == "__main__":
    main()