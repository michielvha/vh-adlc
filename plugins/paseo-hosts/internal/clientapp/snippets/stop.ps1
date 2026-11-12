# Stops the Paseo app on Windows and waits for its update installer.
# Inputs: wait_ms, the time the app has to quit by itself after
# window.close(), 0 to stop it at once; floor_ms, the least time to wait
# once the app is gone; limit_ms, the longest time to wait for the
# installer.
# The app's built-in daemon and terminal workers also run as Paseo.exe, and
# they can outlive the app, so only the main process counts.
function MainProcess { @(Get-CimInstance Win32_Process -Filter "Name = 'Paseo.exe'" | Where-Object { $_.CommandLine -notmatch '--type=|\.m?js(\s|"|$)' }) }
function Running { @(MainProcess).Count -gt 0 }
function Gone($ms) {
    $deadline = [DateTime]::UtcNow.AddMilliseconds($ms)
    while ([DateTime]::UtcNow -lt $deadline) {
        if (-not (Running)) { return $true }
        Start-Sleep -Milliseconds 100
    }
    return (-not (Running))
}
# installer read: begin
# The app updates itself, so read the updater's cache directory on each run.
$installer = '@getpaseodesktop-updater'
$source = 'fallback'
try {
    $yml = [IO.Path]::Combine($env:LOCALAPPDATA, 'Programs', 'Paseo', 'resources', 'app-update.yml')
    foreach ($line in [IO.File]::ReadAllLines($yml)) {
        if ($line -match '^\s*updaterCacheDirName:\s*(.*?)\s*$') {
            $value = $Matches[1]
            if ($value -match '^''(.*)''$' -or $value -match '^"(.*)"$') { $value = $Matches[1] }
            if ($value -ne '' -and $value -ne '.' -and $value -ne '..' -and $value.IndexOfAny([char[]]'\/:*?"<>|') -lt 0) {
                $installer = $value
                $source = 'file'
            }
            break
        }
    }
} catch {
}
Write-Output "INSTALLER=$installer"
Write-Output "INSTALLER_SOURCE=$source"
# installer read: end
$installerDir = [IO.Path]::Combine($env:LOCALAPPDATA, $installer) + '\'
function Installing {
    @(Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -and $_.ExecutablePath.StartsWith($installerDir, [StringComparison]::OrdinalIgnoreCase) }).Count -gt 0
}
if (-not (Running)) {
    $stopped = 'none'
} elseif ([int]$wait_ms -gt 0 -and (Gone ([int]$wait_ms))) {
    $stopped = 'graceful'
} else {
    Get-Process -Name 'Paseo' -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
    if (-not (Gone 10000)) {
        Write-Output 'FAIL: the Paseo app did not stop'
        exit 1
    }
    $stopped = 'KILL'
}
Write-Output "STOPPED=$stopped"
$start = [DateTime]::UtcNow
while ($true) {
    $waited = ([DateTime]::UtcNow - $start).TotalMilliseconds
    if ($waited -ge [int]$floor_ms -and -not (Installing)) { break }
    if ($waited -ge [int]$limit_ms) {
        Write-Output 'INSTALLING=yes'
        exit 0
    }
    Start-Sleep -Milliseconds 100
}
