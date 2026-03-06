$files = Get-ChildItem -Recurse -Filter *.ts src |
  Where-Object {
    $_.FullName -notmatch "\\src\\tests\\" -and
    $_.FullName -notmatch "\\src\\tools\\"
  }

$forbiddenSessionRuntimeImports = $files | Select-String -Pattern "\b(setActiveSessionId|clearActiveSessionId)\b"

if ($forbiddenSessionRuntimeImports -and $forbiddenSessionRuntimeImports.Count -gt 0) {
  Write-Host "Forbidden active session runtime imports detected (first 10):"
  $forbiddenSessionRuntimeImports | Select-Object -First 10 | ForEach-Object {
    Write-Host "- $($_.Path):$($_.LineNumber) $($_.Line.Trim())"
  }
  throw "Use session lifecycle boundary APIs from sessionRuntime.ts instead of raw active-session setters."
}

$activeSessionMutations = $files | Select-String -Pattern "\bUPDATE\s+guild_runtime_state\s+SET\s+active_session_id\b|\bINSERT\s+(OR\s+REPLACE\s+)?INTO\s+guild_runtime_state\b[^\n]*\bactive_session_id\b" -CaseSensitive:$false

$allowlist = @(
  "src\sessions\sessionruntime.ts",
  "src\meepo\personastate.ts"
)

$violations = @()
if ($activeSessionMutations) {
  foreach ($match in $activeSessionMutations) {
    $normalized = $match.Path.Replace('/', [char]92).ToLowerInvariant()
    $isAllowed = $false
    foreach ($allowed in $allowlist) {
      if ($normalized.EndsWith($allowed)) {
        $isAllowed = $true
        break
      }
    }
    if (-not $isAllowed) {
      $violations += $match
    }
  }
}

if ($violations.Count -gt 0) {
  Write-Host "Forbidden active_session_id SQL mutations detected (first 10):"
  $violations | Select-Object -First 10 | ForEach-Object {
    Write-Host "- $($_.Path):$($_.LineNumber) $($_.Line.Trim())"
  }
  throw "active_session_id mutations must stay inside approved runtime boundary modules."
}

$personaStateActiveSessionUpdates = $files |
  Where-Object { $_.FullName -like "*\src\meepo\personaState.ts" } |
  Select-String -Pattern "\bUPDATE\s+guild_runtime_state\s+SET\s+active_session_id\b" -CaseSensitive:$false

if ($personaStateActiveSessionUpdates -and $personaStateActiveSessionUpdates.Count -gt 0) {
  Write-Host "Forbidden semantic active_session_id updates in personaState.ts (first 10):"
  $personaStateActiveSessionUpdates | Select-Object -First 10 | ForEach-Object {
    Write-Host "- $($_.Path):$($_.LineNumber) $($_.Line.Trim())"
  }
  throw "personaState.ts may shape runtime rows only; active_session_id truth is owned by session lifecycle/reconciliation."
}

Write-Host "PASS: active session runtime mutation boundary"