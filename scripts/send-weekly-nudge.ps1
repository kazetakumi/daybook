<#
.SYNOPSIS
  Sends the weekly "any Leave/Off days to mark?" ntfy reminder for Daybook.

.DESCRIPTION
  Called by the "Daybook-WeeklyNudge" Task Scheduler job created by
  register-scheduled-tasks.ps1 (SPEC.md section 10). Not meant to run standalone
  except for testing - it just posts one message to the ntfy topic.

  Requires curl.exe (ships with Windows 11) and outbound internet access.

.PARAMETER NtfyTopic
  The secret ntfy.sh topic name chosen during setup (see docs/ops-setup.md).
  Never hardcode a real topic name in this file - always pass it in.

.PARAMETER AppUrl
  The Daybook Funnel URL (PUBLIC_ORIGIN), included in the message so the
  reminder deep-links straight to the app.

.EXAMPLE
  ./send-weekly-nudge.ps1 -NtfyTopic "daybook-x7qp29" -AppUrl "https://myhost.tailXXXX.ts.net"
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$NtfyTopic,

  [Parameter(Mandatory = $true)]
  [string]$AppUrl
)

$ErrorActionPreference = "Stop"

$message = "Weekly check-in: any Leave or Off days to mark this week? $AppUrl"

& curl.exe -sS -d $message "https://ntfy.sh/$NtfyTopic"

if ($LASTEXITCODE -ne 0) {
  Write-Error "curl.exe exited with code $LASTEXITCODE - ntfy ping may not have been delivered."
  exit $LASTEXITCODE
}

Write-Output "Weekly nudge sent to ntfy.sh/$NtfyTopic"
