# Stops the Paseo app on Windows. Inputs: wait_ms, the time the app has to
# quit by itself after window.close(); 0 stops it at once.
function Running { @(Get-Process -Name 'Paseo' -ErrorAction SilentlyContinue).Count -gt 0 }
function Gone($ms) {
    $deadline = [DateTime]::UtcNow.AddMilliseconds($ms)
    while ([DateTime]::UtcNow -lt $deadline) {
        if (-not (Running)) { return $true }
        Start-Sleep -Milliseconds 100
    }
    return (-not (Running))
}
if (-not (Running)) { Write-Output 'STOPPED=none'; exit 0 }
if ([int]$wait_ms -gt 0) {
    if (Gone ([int]$wait_ms)) { Write-Output 'STOPPED=graceful'; exit 0 }
}
Get-Process -Name 'Paseo' -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
if (Gone 10000) { Write-Output 'STOPPED=KILL'; exit 0 }
Write-Output 'FAIL: the Paseo app did not stop'
exit 1
