# Identifies a Windows client and, with need_app = 'yes', checks for the
# Paseo app and a signed-in desktop session.
function Fail($m) { Write-Output "FAIL: $m"; exit 1 }
Write-Output "OS=$env:OS"
if ($need_app -eq 'yes') {
    $app = Join-Path $env:LOCALAPPDATA 'Programs\Paseo\Paseo.exe'
    if (-not (Test-Path -LiteralPath $app)) { Fail "the Paseo app is not installed at $app" }
    $console = (Get-CimInstance Win32_ComputerSystem).UserName
    if (-not $console) { Fail "$env:USERNAME is not signed in to a desktop session" }
    if (-not $console.EndsWith("\$env:USERNAME")) { Fail "$env:USERNAME is not signed in to a desktop session" }
    Write-Output "APP=$app"
}
