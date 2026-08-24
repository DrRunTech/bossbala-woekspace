# 停止本地 AI 网关相关进程（Windows / PowerShell）
$Dir = Split-Path -Parent $MyInvocation.MyCommand.Definition
foreach ($n in @(".tunnel.pid",".gateway.pid",".ollama.pid")) {
  $f = Join-Path $Dir $n
  if (Test-Path $f) {
    $id = [int](Get-Content $f -First 1)
    Stop-Process -Id $id -ErrorAction SilentlyContinue
    Remove-Item $f -ErrorAction SilentlyContinue
    Write-Host "» 已停止 $n" -ForegroundColor Cyan
  }
}
Write-Host "» 完成。" -ForegroundColor Cyan