<#
.SYNOPSIS
  Registers the two Daybook reminder jobs in Windows Task Scheduler.

.DESCRIPTION
  Creates two scheduled tasks (SPEC.md section 10 / docs/ops-setup.md):

    Daybook-WeeklyNudge
      Weekly, posts a generic "any Leave/Off days to mark?" ntfy reminder.
      Runs scripts/send-weekly-nudge.ps1.

    Daybook-SettlementEveCheck
      Runs DAILY, but only actually pings ntfy on days a Cycle closes
      tomorrow for at least one active worker. Every unmarked day settles as
      Present (SPEC.md section 1.4), so a reminder is only worth sending the day
      before it stops being editable-for-free - see
      scripts/next-cycle-end.ts and scripts/send-settlement-eve-ping.ps1 for
      how "tomorrow" is determined (reuses the app's own cycleWindows()
      logic against the daybook_* tables via DATABASE_URL in .env, read-only).

      Design choice: rather than dynamically re-registering a fresh
      Task Scheduler trigger for each worker's next cycle end (fiddly and
      easy to get out of sync with rate/cycle-day changes), this runs the
      lightweight check once a day and no-ops most days. It costs one extra
      Node process launch per day; in exchange the task never needs to be
      touched again after registration, even as workers are added, archived,
      or have their Cycle start day changed.

  Both tasks are configured with:
    - StartWhenAvailable  ("run task as soon as possible after a scheduled
      start is missed" in the Task Scheduler UI) - so a task due while the
      laptop was asleep/off fires at next boot/logon instead of being
      silently skipped. This is the "run when missed" behavior requested by
      the ticket.
    - RunOnlyIfNetworkAvailable - no point trying to curl ntfy.sh offline;
      combined with StartWhenAvailable, it'll retry once connectivity is
      back rather than fail outright.

  This script does NOT run any curl/ntfy call itself - it only registers the
  two scheduled tasks. It also does not hardcode any ntfy topic; you must
  pass -NtfyTopic explicitly.

  SAFETY: this script uses ShouldProcess, so by default it will ask for
  confirmation before registering each task (or overwriting an existing one
  of the same name). Read this whole file before running it. Use -WhatIf to
  preview without registering anything, or -Confirm:$false to skip prompts
  once you're sure.

.PARAMETER NtfyTopic
  The secret ntfy.sh topic you chose (see docs/ops-setup.md step 2). Not
  defaulted on purpose - there is no safe default for a secret.

.PARAMETER AppUrl
  The Daybook Funnel URL, e.g. https://<machine>.<tailnet>.ts.net - the same
  value you set as PUBLIC_ORIGIN for the server.

.PARAMETER ProjectPath
  Path to the Daybook project root. Defaults to the parent of this script's
  directory (correct as long as this file stays inside scripts/).

.PARAMETER WeeklyDay
  Day of week for the weekly nudge. Default: Monday.

.PARAMETER WeeklyTime
  Time of day (HH:mm, 24h) for the weekly nudge. Default: 09:00.

.PARAMETER DailyCheckTime
  Time of day (HH:mm, 24h) the settlement-eve check runs every day. Default:
  09:00. Keep this reasonably early in the day - "tomorrow" is computed from
  the calendar date at the moment this runs.

.EXAMPLE
  # Preview only - registers nothing:
  ./register-scheduled-tasks.ps1 -NtfyTopic "daybook-x7qp29" -AppUrl "https://myhost.tailabc12.ts.net" -WhatIf

.EXAMPLE
  # Actually register both tasks, confirming each one:
  ./register-scheduled-tasks.ps1 -NtfyTopic "daybook-x7qp29" -AppUrl "https://myhost.tailabc12.ts.net"
#>
[CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = "High")]
param(
  [Parameter(Mandatory = $true)]
  [string]$NtfyTopic,

  [Parameter(Mandatory = $true)]
  [string]$AppUrl,

  [string]$ProjectPath = (Split-Path -Parent $PSScriptRoot),

  [ValidateSet("Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday")]
  [string]$WeeklyDay = "Monday",

  [ValidatePattern("^([01]\d|2[0-3]):[0-5]\d$")]
  [string]$WeeklyTime = "09:00",

  [ValidatePattern("^([01]\d|2[0-3]):[0-5]\d$")]
  [string]$DailyCheckTime = "09:00"
)

$ErrorActionPreference = "Stop"

$weeklyScript = Join-Path $ProjectPath "scripts\send-weekly-nudge.ps1"
$settlementScript = Join-Path $ProjectPath "scripts\send-settlement-eve-ping.ps1"

foreach ($path in @($weeklyScript, $settlementScript)) {
  if (-not (Test-Path $path)) {
    throw "Expected helper script not found: $path - is -ProjectPath correct?"
  }
}

# StartWhenAvailable = "run task as soon as possible after a scheduled start
# is missed" (Task Scheduler UI checkbox). RunOnlyIfNetworkAvailable pairs
# with it so a missed run only fires once there's actually a network path to
# ntfy.sh, rather than failing again immediately at boot.
$settings = New-ScheduledTaskSettingsSet `
  -StartWhenAvailable `
  -RunOnlyIfNetworkAvailable `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries

# S4U: runs whether the user is logged on or not, without needing to store a
# password (unlike -LogonType Password, which prompts Register-ScheduledTask
# for credentials interactively). Requires the account to have the "Log on
# as a batch job" right, which local user accounts have by default on
# Windows 11. If registration fails with a logon-right error, the fix is
# Local Security Policy > User Rights Assignment > Log on as a batch job.
$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType S4U -RunLevel Limited

# --- Daybook-WeeklyNudge ----------------------------------------------------

$weeklyAction = New-ScheduledTaskAction `
  -Execute "powershell.exe" `
  -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$weeklyScript`" -NtfyTopic `"$NtfyTopic`" -AppUrl `"$AppUrl`"" `
  -WorkingDirectory $ProjectPath

$weeklyTrigger = New-ScheduledTaskTrigger -Weekly -DaysOfWeek $WeeklyDay -At $WeeklyTime

if ($PSCmdlet.ShouldProcess("Daybook-WeeklyNudge", "Register scheduled task ($WeeklyDay $WeeklyTime weekly)")) {
  Register-ScheduledTask `
    -TaskName "Daybook-WeeklyNudge" `
    -Action $weeklyAction `
    -Trigger $weeklyTrigger `
    -Settings $settings `
    -Principal $principal `
    -Description "Daybook: weekly ntfy reminder to mark any Leave/Off days. See docs/ops-setup.md." `
    -Force | Out-Null
  Write-Output "Registered Daybook-WeeklyNudge ($WeeklyDay at $WeeklyTime)."
}

# --- Daybook-SettlementEveCheck ---------------------------------------------

$settlementAction = New-ScheduledTaskAction `
  -Execute "powershell.exe" `
  -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$settlementScript`" -NtfyTopic `"$NtfyTopic`" -AppUrl `"$AppUrl`" -ProjectPath `"$ProjectPath`"" `
  -WorkingDirectory $ProjectPath

$settlementTrigger = New-ScheduledTaskTrigger -Daily -At $DailyCheckTime

if ($PSCmdlet.ShouldProcess("Daybook-SettlementEveCheck", "Register scheduled task (daily at $DailyCheckTime, no-ops unless a cycle ends tomorrow)")) {
  Register-ScheduledTask `
    -TaskName "Daybook-SettlementEveCheck" `
    -Action $settlementAction `
    -Trigger $settlementTrigger `
    -Settings $settings `
    -Principal $principal `
    -Description "Daybook: runs daily, pings ntfy only the day before a worker's cycle ends. See docs/ops-setup.md." `
    -Force | Out-Null
  Write-Output "Registered Daybook-SettlementEveCheck (daily at $DailyCheckTime)."
}

Write-Output ""
Write-Output "Done. Inspect with: Get-ScheduledTask -TaskName 'Daybook-*' | Get-ScheduledTaskInfo"
Write-Output "Remove with: Unregister-ScheduledTask -TaskName 'Daybook-WeeklyNudge','Daybook-SettlementEveCheck' -Confirm:`$false"
