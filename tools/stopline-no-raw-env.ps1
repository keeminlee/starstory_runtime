$strictFiles = Get-ChildItem -Recurse -File src |
  Where-Object {
    $_.FullName -match "[\\/]src[\\/]voice[\\/].*\.ts$" -or
    $_.FullName -match "[\\/]src[\\/]bot\.ts$"
  }

$matches = $strictFiles | Select-String "process\.env"

if ($matches) {
  $paths = $matches | ForEach-Object { $_.Path } | Sort-Object -Unique
  throw "process.env found in config-only runtime path(s): $($paths -join ', ')"
}

Write-Host "PASS: no process.env usage found in config-only runtime paths"