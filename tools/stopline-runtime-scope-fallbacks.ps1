$runtimeFiles = Get-ChildItem -Recurse -File src |
  Where-Object {
    $_.FullName -match "\\src\\commands\\(missions|meeps|session)\.ts$" -or
    $_.FullName -match "\\src\\overlay\\.*\.ts$" -or
    $_.FullName -match "\\src\\bot\.ts$" -or
    $_.FullName -match "\\src\\voice\\.*\.ts$"
  }

$registryFallbackMatches = $runtimeFiles | Select-String -Pattern "\bloadRegistry\s*\("
if ($registryFallbackMatches -and $registryFallbackMatches.Count -gt 0) {
  Write-Host "Forbidden runtime registry fallback callsites (first 10):"
  $registryFallbackMatches | Select-Object -First 10 | ForEach-Object {
    Write-Host "- $($_.Path):$($_.LineNumber) $($_.Line.Trim())"
  }
  throw "Runtime zones must use loadRegistryForScope({ guildId, campaignSlug }) instead of loadRegistry()."
}

$legacyEventScopeMatches = $runtimeFiles |
  Select-String -Pattern "searchEventsByTitleScoped\s*\(\s*\{[^\}]*\bguildId\b" -CaseSensitive:$false
if ($legacyEventScopeMatches -and $legacyEventScopeMatches.Count -gt 0) {
  Write-Host "Forbidden legacy event scope callsites (first 10):"
  $legacyEventScopeMatches | Select-Object -First 10 | ForEach-Object {
    Write-Host "- $($_.Path):$($_.LineNumber) $($_.Line.Trim())"
  }
  throw "Runtime zones must pass explicit scope object: searchEventsByTitleScoped({ term, scope: { guildId, campaignSlug } })."
}

Write-Host "PASS: runtime scope fallback stopline"