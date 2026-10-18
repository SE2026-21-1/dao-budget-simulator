param(
    [string]$PostgresBin = 'C:\Program Files\PostgreSQL\18\bin'
)

# Start only a new, isolated cluster. Never connect to or drop an existing database.
$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$migration = Join-Path $repoRoot 'database\migrations\001_initial.sql'
$checks = Join-Path $repoRoot 'database\tests\001_initial_checks.sql'
foreach ($name in @('initdb', 'pg_ctl', 'psql')) {
    if (-not (Test-Path -LiteralPath (Join-Path $PostgresBin "$name.exe"))) {
        throw "Missing $name.exe in $PostgresBin. Pass -PostgresBin with your PostgreSQL bin directory."
    }
}
foreach ($file in @($migration, $checks)) {
    if (-not (Test-Path -LiteralPath $file)) { throw "Missing SQL file: $file" }
}

$runRoot = Join-Path ([IO.Path]::GetTempPath()) ('dao-be01-pg-' + [Guid]::NewGuid().ToString('N'))
$clusterDir = Join-Path $runRoot 'data'
$serverLog = Join-Path $runRoot 'postgres.log'
New-Item -ItemType Directory -Path $runRoot | Out-Null
$listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, 0)
$listener.Start()
$port = $listener.LocalEndpoint.Port
$listener.Stop()
$startAttempted = $false

try {
    & (Join-Path $PostgresBin 'initdb.exe') -D $clusterDir -U be01_test --auth=trust --encoding=UTF8 --locale=C
    if ($LASTEXITCODE -ne 0) { throw 'initdb failed.' }
    # Trust authentication is limited to a short-lived localhost test cluster.
    $startAttempted = $true
    & (Join-Path $PostgresBin 'pg_ctl.exe') start -w -t 30 -D $clusterDir -l $serverLog -o "-h 127.0.0.1 -p $port"
    if ($LASTEXITCODE -ne 0) { throw "PostgreSQL start failed. See $serverLog" }
    $psqlArgs = @('-X', '--no-password', '-h', '127.0.0.1', '-p', "$port", '-U', 'be01_test', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1')
    & (Join-Path $PostgresBin 'psql.exe') @psqlArgs -f $migration
    if ($LASTEXITCODE -ne 0) { throw 'Migration failed.' }
    & (Join-Path $PostgresBin 'psql.exe') @psqlArgs -f $checks
    if ($LASTEXITCODE -ne 0) { throw 'Database constraint checks failed.' }
    Write-Output 'PASS: BE01 migration and database constraints on isolated PostgreSQL.'
}
finally {
    if ($startAttempted) {
        & (Join-Path $PostgresBin 'pg_ctl.exe') status -D $clusterDir *> $null
        if ($LASTEXITCODE -eq 0) {
            & (Join-Path $PostgresBin 'pg_ctl.exe') stop -w -t 30 -m fast -D $clusterDir
            if ($LASTEXITCODE -ne 0) { Write-Warning "Could not stop test cluster. Inspect $clusterDir" }
        }
    }
    # Retain only this new cluster and logs for review; no recursive deletion.
    Write-Output "Temporary cluster and logs retained at: $runRoot"
}
