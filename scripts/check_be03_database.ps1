param(
    [string]$PostgresBin = 'C:\Program Files\PostgreSQL\18\bin'
)

# This runner initializes a brand-new cluster. It never uses DATABASE_URL or any
# existing service, database or cluster, and retains its own files for review.
$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
foreach ($name in @('initdb', 'pg_ctl', 'psql')) {
    if (-not (Test-Path -LiteralPath (Join-Path $PostgresBin "$name.exe"))) {
        throw "Missing $name.exe in $PostgresBin. Pass -PostgresBin with your PostgreSQL bin directory."
    }
}
if (-not (Test-Path -LiteralPath (Join-Path $repoRoot 'node_modules\.bin\tsx.cmd'))) {
    throw 'Run npm ci before running the BE03 database tests.'
}

$runRoot = Join-Path ([IO.Path]::GetTempPath()) ('dao-be03-pg-' + [Guid]::NewGuid().ToString('N'))
$clusterDir = Join-Path $runRoot 'data'
$serverLog = Join-Path $runRoot 'postgres.log'
New-Item -ItemType Directory -Path $runRoot | Out-Null
$listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, 0)
$listener.Start()
$port = $listener.LocalEndpoint.Port
$listener.Stop()
$startAttempted = $false
$previousDatabaseUrl = $env:BE03_TEST_DATABASE_URL
$previousIsolated = $env:BE03_TEST_ISOLATED
$testExitCode = 1

try {
    & (Join-Path $PostgresBin 'initdb.exe') -D $clusterDir -U be03_test --auth=trust --encoding=UTF8 --locale=C
    if ($LASTEXITCODE -ne 0) { throw 'initdb failed.' }
    $startAttempted = $true
    & (Join-Path $PostgresBin 'pg_ctl.exe') start -w -t 30 -D $clusterDir -l $serverLog -o "-h 127.0.0.1 -p $port"
    if ($LASTEXITCODE -ne 0) { throw "PostgreSQL start failed. See $serverLog" }
    $psqlArgs = @('-X', '--no-password', '-h', '127.0.0.1', '-p', "$port", '-U', 'be03_test', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1')
    & (Join-Path $PostgresBin 'psql.exe') @psqlArgs -c 'CREATE DATABASE be03_test;'
    if ($LASTEXITCODE -ne 0) { throw 'Could not create the isolated BE03 test database.' }
    $env:BE03_TEST_DATABASE_URL = "postgresql://be03_test@127.0.0.1:$port/be03_test"
    $env:BE03_TEST_ISOLATED = '1'
    Push-Location -LiteralPath $repoRoot
    try {
        & (Join-Path $repoRoot 'node_modules\.bin\tsx.cmd') --test tests/indexer/checkpoint-storage.test.ts
        $testExitCode = $LASTEXITCODE
    }
    finally { Pop-Location }
    if ($testExitCode -ne 0) { throw 'BE03 PostgreSQL storage tests failed.' }
    Write-Output 'PASS: BE01 migration/constraints and BE03 storage on isolated real PostgreSQL.'
}
finally {
    $env:BE03_TEST_DATABASE_URL = $previousDatabaseUrl
    $env:BE03_TEST_ISOLATED = $previousIsolated
    if ($startAttempted) {
        & (Join-Path $PostgresBin 'pg_ctl.exe') status -D $clusterDir *> $null
        if ($LASTEXITCODE -eq 0) {
            & (Join-Path $PostgresBin 'pg_ctl.exe') stop -w -t 30 -m fast -D $clusterDir
            if ($LASTEXITCODE -ne 0) { throw "Could not stop owned test cluster. Inspect $clusterDir" }
        }
    }
    Write-Output "Temporary cluster and logs retained at: $runRoot"
}
