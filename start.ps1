param([int]$Port = 8080)
$ErrorActionPreference = 'Stop'
if ($Port -lt 1024 -or $Port -gt 65535) { throw 'Choose a local port between 1024 and 65535.' }
Push-Location $PSScriptRoot
try { & python tests/dev_server.py $Port } finally { Pop-Location }
