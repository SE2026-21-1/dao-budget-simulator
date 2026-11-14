param(
  [ValidateRange(1, 65535)]
  [int]$Port = 5173
)

$ErrorActionPreference = 'Stop'
$frontend = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..\frontend')).Path
$vite = Join-Path $frontend 'node_modules\vite\bin\vite.js'
$node = Join-Path $env:ProgramFiles 'nodejs\node.exe'
$logDirectory = Join-Path $env:LOCALAPPDATA 'DAO-Budget-Simulator'
$cacheDirectory = Join-Path $logDirectory 'vite-cache'
$log = Join-Path $logDirectory 'vite.log'
$stdout = Join-Path $logDirectory 'vite.stdout.log'
$stderr = Join-Path $logDirectory 'vite.stderr.log'

New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null
New-Item -ItemType Directory -Path $cacheDirectory -Force | Out-Null
$env:DAO_VITE_CACHE_DIR = $cacheDirectory

while ($true) {
  try {
    if (-not (Test-Path -LiteralPath $node)) { throw "Node.js not found at $node" }
    if (-not (Test-Path -LiteralPath $vite)) { throw "Vite not found at $vite; run npm ci --prefix frontend" }

    Set-Location -LiteralPath $frontend
    Add-Content -LiteralPath $log -Value "$(Get-Date -Format o) Starting Vite on 127.0.0.1:$Port"
    $process = Start-Process -FilePath $node -ArgumentList @($vite, '--host', '127.0.0.1', '--port', $Port, '--strictPort') -WorkingDirectory $frontend -WindowStyle Hidden -RedirectStandardOutput $stdout -RedirectStandardError $stderr -Wait -PassThru
    Add-Content -LiteralPath $log -Value "$(Get-Date -Format o) Vite exited with code $($process.ExitCode); see vite.stderr.log"
  } catch {
    Add-Content -LiteralPath $log -Value "$(Get-Date -Format o) Startup error: $($_.Exception.Message)"
  }

  Start-Sleep -Seconds 5
}
