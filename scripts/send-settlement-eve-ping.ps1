<#
.SYNOPSIS
  Sends the settlement-eve ntfy reminder, but only on days it's actually due.

.DESCRIPTION
  Called daily by the "Daybook-SettlementEveCheck" Task Scheduler job created
  by register-scheduled-tasks.ps1 (SPEC.md section 10). Every unmarked day settles
  as Present, so a daily reminder would be noise - the only day worth pinging
  is the eve of a Cycle end, when a missed Leave/Off is still cheaply fixable.

  This script runs scripts/next-cycle-end.ts (via tsx) in --check mode, which
  reads the daybook_* tables (DATABASE_URL from .env) READ-ONLY and, using the app's own cycleWindows()
  logic, exits 0 if tomorrow is the current Cycle end for at least one active
  Worker, or 1 otherwise. Only on exit 0 does this script post to ntfy.

  Requires: Node.js + npx on PATH (already required to run the app), curl.exe
  (ships with Windows 11), outbound internet access.

.PARAMETER NtfyTopic
  The secret ntfy.sh topic name chosen during setup (see docs/ops-setup.md).
  Never hardcode a real topic name in this file - always pass it in.

.PARAMETER AppUrl
  The Daybook Funnel URL (PUBLIC_ORIGIN), included in the message.

.PARAMETER ProjectPath
  Path to the Daybook project root (where package.json, scripts/, and
  .env live). Defaults to the parent of this script's
  directory, which is correct if this file stays inside scripts/.

.EXAMPLE
  ./send-settlement-eve-ping.ps1 -NtfyTopic "daybook-x7qp29" -AppUrl "https://myhost.tailXXXX.ts.net"
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$NtfyTopic,

  [Parameter(Mandatory = $true)]
  [string]$AppUrl,

  [string]$ProjectPath = (Split-Path -Parent $PSScriptRoot)
)

$ErrorActionPreference = "Stop"

Push-Location $ProjectPath
try {
  & npx tsx --env-file-if-exists=.env (Join-Path $ProjectPath "scripts\next-cycle-end.ts") --check
  $checkExitCode = $LASTEXITCODE
}
finally {
  Pop-Location
}

# IMPORTANT: this script's own exit code is what Task Scheduler records as
# task success/failure in its history. "No cycle end tomorrow" is the normal,
# expected outcome on most days and must exit 0 (success) — only an actual
# delivery problem should exit non-zero. Each branch below sets its exit code
# explicitly rather than falling through and inheriting $LASTEXITCODE from
# next-cycle-end.ts (which is 1 on the ordinary no-op day).
if ($checkExitCode -eq 0) {
  $message = "Settlement eve: a Cycle closes tomorrow. Any Leave or Off days to mark before payday? $AppUrl"
  & curl.exe -sS -d $message "https://ntfy.sh/$NtfyTopic"
  if ($LASTEXITCODE -ne 0) {
    Write-Error "curl.exe exited with code $LASTEXITCODE - ntfy ping may not have been delivered."
    exit $LASTEXITCODE
  }
  Write-Output "Settlement-eve ping sent to ntfy.sh/$NtfyTopic"
  exit 0
}
elseif ($checkExitCode -eq 1) {
  Write-Output "No active worker's cycle ends tomorrow - skipping ntfy ping."
  exit 0
}
else {
  Write-Warning "next-cycle-end.ts --check exited with code $checkExitCode (2 = database unreachable or not configured). Skipping ntfy ping."
  exit $checkExitCode
}
