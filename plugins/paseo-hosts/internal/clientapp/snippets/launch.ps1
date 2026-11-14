# Starts the Paseo app in the signed-in user's desktop session through a
# one-time scheduled task. Inputs: app, debug_port (empty for none), wait_ms.
$task = 'paseo-hosts-launch'
# USERDOMAIN reads WORKGROUP in an SSH session, so take the name from the token.
$user = [Security.Principal.WindowsIdentity]::GetCurrent().Name
if ($debug_port) {
    $action = New-ScheduledTaskAction -Execute $app -Argument "--remote-debugging-port=$debug_port"
} else {
    $action = New-ScheduledTaskAction -Execute $app
}
$principal = New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::Zero)
$started = $false
try {
    Register-ScheduledTask -TaskName $task -Action $action -Principal $principal -Settings $settings -Force | Out-Null
    Start-ScheduledTask -TaskName $task
    $deadline = [DateTime]::UtcNow.AddMilliseconds([int]$wait_ms)
    while ([DateTime]::UtcNow -lt $deadline) {
        $main = @(Get-CimInstance Win32_Process -Filter "Name = 'Paseo.exe'" | Where-Object { $_.CommandLine -notmatch '--type=|\.m?js(\s|"|$)' })
        if ($main.Count -gt 0) { $started = $true; break }
        Start-Sleep -Milliseconds 200
    }
} finally {
    Unregister-ScheduledTask -TaskName $task -Confirm:$false -ErrorAction SilentlyContinue
}
if (-not $started) { Write-Output "FAIL: the Paseo app did not start in $user's desktop session"; exit 1 }
Write-Output 'LAUNCHED=yes'
