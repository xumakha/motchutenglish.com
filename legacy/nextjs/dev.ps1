$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
$taskNodeDirectory = Join-Path $PSScriptRoot '.tools/node-v22.16.0-win-x64'
if (Test-Path (Join-Path $taskNodeDirectory 'node.exe')) {
    $env:PATH = $taskNodeDirectory + ';' + $env:PATH
    & (Join-Path $taskNodeDirectory 'npm.cmd') run dev
} else {
    npm.cmd run dev
}
