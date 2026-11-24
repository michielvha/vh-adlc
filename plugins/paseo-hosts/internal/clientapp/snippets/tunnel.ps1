# Waits for the app's SSH tunnel to a server. Inputs: name, port, wait_ms.
$pattern = '-W 127\.0\.0\.1:' + $port + ' ' + [regex]::Escape($name) + '( |"|$)'
$deadline = [DateTime]::UtcNow.AddMilliseconds([int]$wait_ms)
while ([DateTime]::UtcNow -lt $deadline) {
    $found = @(Get-CimInstance Win32_Process -Filter "Name = 'ssh.exe'" | Where-Object { $_.CommandLine -match $pattern })
    if ($found.Count -gt 0) { Write-Output 'TUNNEL=yes'; exit 0 }
    Start-Sleep -Milliseconds 200
}
Write-Output "FAIL: the app opened no SSH tunnel to $name within $([int]$wait_ms / 1000) seconds"
exit 1
