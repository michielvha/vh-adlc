# Reports whether the Paseo app's main process runs on Windows. Inputs: app.
# The app's built-in daemon and terminal workers also run as Paseo.exe, so
# only the main process counts.
$main = @(Get-CimInstance Win32_Process -Filter "Name = 'Paseo.exe'" | Where-Object { $_.CommandLine -notmatch '--type=|\.m?js(\s|"|$)' })
if ($main.Count -gt 0) { Write-Output 'RUNNING=yes' } else { Write-Output 'RUNNING=no' }
