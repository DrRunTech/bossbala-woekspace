# 一键启动本地 AI 网关（Windows / PowerShell）
# 自动：启动 Ollama → 拉模型 → 生成鉴权 Key → 启动网关 → 建公网隧道 → 打印配置
# 用法：右键“用 PowerShell 运行”，或：powershell -ExecutionPolicy Bypass -File start-windows.ps1
$ErrorActionPreference = "Stop"
$Dir = Split-Path -Parent $MyInvocation.MyCommand.Definition
Set-Location $Dir
$GatewayPort = if ($env:GATEWAY_PORT) { $env:GATEWAY_PORT } else { "8080" }
$OllamaPort  = if ($env:OLLAMA_PORT)  { $env:OLLAMA_PORT }  else { "11434" }
$EnvFile = Join-Path $Dir ".gateway-env"

function Say($m){ Write-Host "» $m" -ForegroundColor Cyan }
function Err($m){ Write-Host "✗ $m" -ForegroundColor Red }

# ---------- 1. Ollama ----------
if (-not (Get-Command ollama -ErrorAction SilentlyContinue)) {
  Err "未找到 ollama，请先安装：https://ollama.com/download"
  exit 1
}
$ollamaUp = $false
try { Invoke-RestMethod "http://127.0.0.1:$OllamaPort/v1/models" -TimeoutSec 3 -ErrorAction Stop | Out-Null; $ollamaUp = $true } catch {}
if (-not $ollamaUp) {
  Say "启动 Ollama（127.0.0.1:$OllamaPort）…"
  $p = Start-Process -FilePath "ollama" -ArgumentList "serve" -WindowStyle Hidden -PassThru
  $p.Id | Out-File (Join-Path $Dir ".ollama.pid")
  Start-Sleep -Seconds 5
}

# ---------- 2. 拉取模型 ----------
foreach ($m in @("qwen3","deepseek-r1:8b","nomic-embed-text")) {
  $present = $false
  try { Invoke-RestMethod "http://127.0.0.1:$OllamaPort/api/show" -Method POST -Body (@{name=$m}|ConvertTo-Json) -ContentType "application/json" -TimeoutSec 5 -ErrorAction Stop | Out-Null; $present = $true } catch {}
  if (-not $present) { Say "拉取模型 $m（首次较慢）…"; ollama pull $m }
}
Say "Ollama 就绪：127.0.0.1:$OllamaPort"

# ---------- 3. 生成 / 读取 API Key ----------
if (-not (Test-Path $EnvFile)) {
  $bytes = New-Object byte[] 24
  $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  $rng.GetBytes($bytes)
  $key = ($bytes | ForEach-Object { $_.ToString("x2") }) -join ""
  @"
GATEWAY_API_KEY=$key
GATEWAY_PORT=$GatewayPort
OLLAMA_HOST=127.0.0.1:$OllamaPort
"@ | Out-File -Encoding ASCII -FilePath $EnvFile
}
$envLines = Get-Content $EnvFile
$ApiKey = ($envLines | Where-Object { $_ -match "^GATEWAY_API_KEY=" }) -replace "GATEWAY_API_KEY=",""
Say "网关 API Key：$ApiKey"

# ---------- 4. 启动本地网关 ----------
$python = Get-Command python -ErrorAction SilentlyContinue
if (-not $python) { $python = Get-Command py -ErrorAction SilentlyContinue }
if (-not $python) { Err "未找到 Python 3，请安装：https://www.python.org/downloads/（安装时勾选 Add to PATH）"; exit 1 }
$pyExe = $python.Source

$gwUp = $false
try { Invoke-RestMethod "http://127.0.0.1:$GatewayPort/healthz" -TimeoutSec 2 -ErrorAction Stop | Out-Null; $gwUp = $true } catch {}
if (-not $gwUp) {
  Say "启动本地网关（端口 $GatewayPort）…"
  $env:GATEWAY_API_KEY = $ApiKey
  $env:GATEWAY_PORT = $GatewayPort
  $env:OLLAMA_HOST = "127.0.0.1:$OllamaPort"
  $gw = Start-Process -FilePath $pyExe -ArgumentList "ollama_gateway.py" `
    -WorkingDirectory $Dir -WindowStyle Hidden -PassThru `
    -RedirectStandardOutput (Join-Path $Dir ".gateway.log") `
    -RedirectStandardError (Join-Path $Dir ".gateway-err.log")
  $gw.Id | Out-File (Join-Path $Dir ".gateway.pid")
  for ($i=0; $i -lt 15; $i++) {
    try { Invoke-RestMethod "http://127.0.0.1:$GatewayPort/healthz" -TimeoutSec 2 -ErrorAction Stop | Out-Null; break } catch { Start-Sleep -Seconds 1 }
  }
}
try { Invoke-RestMethod "http://127.0.0.1:$GatewayPort/healthz" -TimeoutSec 2 -ErrorAction Stop | Out-Null }
catch { Err "网关启动失败，查看 .gateway.log / .gateway-err.log"; exit 1 }
Say "网关就绪：http://127.0.0.1:$GatewayPort"

# ---------- 5. 公网隧道 ----------
$url = ""
function Find-Url($files) {
  foreach ($f in $files) {
    if (Test-Path $f) {
      $line = Select-String -Path $f -Pattern "https://[a-z0-9-]+\.(trycloudflare\.com|ngrok)" -ErrorAction SilentlyContinue | Select-Object -First 1
      if ($line) { return $line.Matches[0].Value }
    }
  }
  return $null
}

if (Get-Command cloudflared -ErrorAction SilentlyContinue) {
  Say "使用 cloudflared 建立隧道…"
  $t = Start-Process -FilePath "cloudflared" -ArgumentList "tunnel","--url","http://127.0.0.1:$GatewayPort" `
    -WindowStyle Hidden -PassThru `
    -RedirectStandardOutput (Join-Path $Dir ".tunnel.log") `
    -RedirectStandardError (Join-Path $Dir ".tunnel-err.log")
  $t.Id | Out-File (Join-Path $Dir ".tunnel.pid")
  for ($i=0; $i -lt 40; $i++) {
    $url = Find-Url @((Join-Path $Dir ".tunnel.log"), (Join-Path $Dir ".tunnel-err.log"))
    if ($url) { break }
    Start-Sleep -Seconds 1
  }
} elseif (Get-Command ngrok -ErrorAction SilentlyContinue) {
  Say "使用 ngrok 建立隧道…"
  $t = Start-Process -FilePath "ngrok" -ArgumentList "http",$GatewayPort `
    -WindowStyle Hidden -PassThru `
    -RedirectStandardOutput (Join-Path $Dir ".tunnel.log") `
    -RedirectStandardError (Join-Path $Dir ".tunnel-err.log")
  $t.Id | Out-File (Join-Path $Dir ".tunnel.pid")
  for ($i=0; $i -lt 40; $i++) {
    $url = Find-Url @((Join-Path $Dir ".tunnel.log"), (Join-Path $Dir ".tunnel-err.log"))
    if ($url) { break }
    Start-Sleep -Seconds 1
  }
} else {
  Err "未找到 cloudflared 或 ngrok。安装其一："
  Write-Host "  winget install --id Cloudflare.cloudflared   # 或  winget install ngrok"
  exit 1
}

if (-not $url) { Err "未能自动获取公网地址，查看 .tunnel.log / .tunnel-err.log"; exit 1 }

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "本地 AI 网关已启动" -ForegroundColor White
Write-Host "公网地址（填入 Base44 secret LOCAL_AI_GATEWAY_URL）：" -ForegroundColor White
Write-Host $url -ForegroundColor Yellow
Write-Host "API Key（填入 Base44 secret LOCAL_AI_GATEWAY_API_KEY）：" -ForegroundColor White
Write-Host $ApiKey -ForegroundColor Yellow
Write-Host "模型：qwen3 | deepseek-r1:8b | nomic-embed-text" -ForegroundColor White
Write-Host "========================================" -ForegroundColor Green
Write-Host "停止：powershell -ExecutionPolicy Bypass -File stop-windows.ps1"