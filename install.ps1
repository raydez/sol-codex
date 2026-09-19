$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot
npm test
node scripts/install-local.mjs
