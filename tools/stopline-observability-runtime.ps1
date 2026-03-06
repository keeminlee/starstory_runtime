$allTsFiles = Get-ChildItem -Recurse -File -Filter *.ts src

# Strict runtime-zone allowlist.
$strictIncludePatterns = @(
  "\\src\\commands\\",
  "\\src\\sessions\\",
  "\\src\\voice\\",
  "\\src\\ledger\\",
  "\\src\\overlay\\",
  "\\src\\context\\",
  "\\src\\runtime\\",
  "\\src\\bot\.ts$"
)

# Temporary allowlist exceptions for legacy/dev paths with known console usage.
# Keep this list explicit and small; remove entries as files are migrated.
$strictExcludePatterns = @(
  "\\src\\commands\\deploy-commands\.ts$",
  "\\src\\commands\\deploy-dev\.ts$",
  "\\src\\commands\\meepoLegacy\.ts$",
  "\\src\\commands\\session\.ts$",
  "\\src\\sessions\\meecap\.ts$",
  "\\src\\voice\\audioFx\.ts$",
  "\\src\\voice\\stt\\debug\.ts$",
  "\\src\\voice\\stt\\provider\.ts$",
  "\\src\\voice\\tts\\provider\.ts$",
  "\\src\\voice\\tts\\noop\.ts$",
  "\\src\\ledger\\meepoActionLogging\.ts$",
  "\\src\\ledger\\awakeningStateRepo\.ts$",
  "\\src\\ledger\\scaffoldLabel\.ts$",
  "\\src\\ledger\\scaffoldMetrics\.ts$"
)

$strictFiles = $allTsFiles | Where-Object {
  $normalized = $_.FullName.Replace('/', [char]92)

  $isIncluded = $false
  foreach ($pattern in $strictIncludePatterns) {
    if ($normalized -match $pattern) {
      $isIncluded = $true
      break
    }
  }

  if (-not $isIncluded) {
    return $false
  }

  foreach ($excludePattern in $strictExcludePatterns) {
    if ($normalized -match $excludePattern) {
      return $false
    }
  }

  return $true
}

$consoleMatches = $strictFiles | Select-String -Pattern "\bconsole\.(log|warn|error|debug|info)\s*\(" -CaseSensitive:$false

if ($consoleMatches -and $consoleMatches.Count -gt 0) {
  Write-Host "Forbidden raw console.* usage detected in strict runtime zones (first 20):"
  $consoleMatches | Select-Object -First 20 | ForEach-Object {
    Write-Host "- $($_.Path):$($_.LineNumber) $($_.Line.Trim())"
  }
  throw "Stopline violation: use structured logger in strict runtime zones instead of raw console.*"
}

Write-Host "PASS: observability runtime stopline (strict zones use structured logger path)"
