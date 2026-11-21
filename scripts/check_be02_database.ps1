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
    throw 'Run npm ci before running the BE02 database tests.'
}

$runRoot = Join-Path ([IO.Path]::GetTempPath()) ('dao-be02-pg-' + [Guid]::NewGuid().ToString('N'))
$clusterDir = Join-Path $runRoot 'data'
$serverLog = Join-Path $runRoot 'postgres.log'
New-Item -ItemType Directory -Path $runRoot | Out-Null
$listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, 0)
$listener.Start()
$port = $listener.LocalEndpoint.Port
$listener.Stop()
$startAttempted = $false
$previousDatabaseUrl = $env:BE02_TEST_DATABASE_URL
$previousIsolated = $env:BE02_TEST_ISOLATED
$testExitCode = 1

try {
    & (Join-Path $PostgresBin 'initdb.exe') -D $clusterDir -U be02_test --auth=trust --encoding=UTF8 --locale=C
    if ($LASTEXITCODE -ne 0) { throw 'initdb failed.' }
    $startAttempted = $true
    & (Join-Path $PostgresBin 'pg_ctl.exe') start -w -t 30 -D $clusterDir -l $serverLog -o "-h 127.0.0.1 -p $port"
    if ($LASTEXITCODE -ne 0) { throw "PostgreSQL start failed. See $serverLog" }
    $psqlArgs = @('-X', '--no-password', '-h', '127.0.0.1', '-p', "$port", '-U', 'be02_test', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1')
    & (Join-Path $PostgresBin 'psql.exe') @psqlArgs -c 'CREATE DATABASE be02_test;'
    if ($LASTEXITCODE -ne 0) { throw 'Could not create the isolated BE02 test database.' }
    $env:BE02_TEST_DATABASE_URL = "postgresql://be02_test@127.0.0.1:$port/be02_test"
    $env:BE02_TEST_ISOLATED = '1'
    Push-Location -LiteralPath $repoRoot
    try {
        & (Join-Path $repoRoot 'node_modules\.bin\tsx.cmd') --test tests/indexer/storage.test.ts
        $testExitCode = $LASTEXITCODE
    }
    finally { Pop-Location }
    if ($testExitCode -ne 0) { throw 'BE02 PostgreSQL storage tests failed.' }
    Write-Output 'PASS: BE01 migration/constraints and BE02 storage on isolated real PostgreSQL.'
}
finally {
    $env:BE02_TEST_DATABASE_URL = $previousDatabaseUrl
    $env:BE02_TEST_ISOLATED = $previousIsolated
    if ($startAttempted) {
        & (Join-Path $PostgresBin 'pg_ctl.exe') status -D $clusterDir *> $null
        if ($LASTEXITCODE -eq 0) {
            & (Join-Path $PostgresBin 'pg_ctl.exe') stop -w -t 30 -m fast -D $clusterDir
            if ($LASTEXITCODE -ne 0) { Write-Warning "Could not stop test cluster. Inspect $clusterDir" }
        }
    }
    Write-Output "Temporary cluster and logs retained at: $runRoot"
}
