param([Parameter(ValueFromRemainingArguments=$true)][string[]]$PhpArguments)
$ErrorActionPreference = 'Stop'
$MceRoot = $PSScriptRoot
$MceIni = Join-Path $MceRoot 'writable\local-ini'
New-Item -ItemType Directory -Force -Path $MceIni | Out-Null
$MceModules = @(php -m)
$MceSettings = ''
foreach ($MceModule in @('intl','fileinfo')) {
    if ($MceModules -notcontains $MceModule) { $MceSettings += "extension=$MceModule`n" }
}
[System.IO.File]::WriteAllText((Join-Path $MceIni 'extensions.ini'), $MceSettings, [System.Text.UTF8Encoding]::new($false))
$env:PHP_INI_SCAN_DIR = $MceIni
if (Test-Path -LiteralPath 'C:\xampp\mysql\bin\mysqldump.exe') { $env:MYSQLDUMP_BIN = 'C:\xampp\mysql\bin\mysqldump.exe' }
if (Test-Path -LiteralPath 'C:\xampp\mysql\bin\mysql.exe') { $env:MYSQL_BIN = 'C:\xampp\mysql\bin\mysql.exe' }
Push-Location $MceRoot
try { & php @PhpArguments; exit $LASTEXITCODE } finally { Pop-Location }
