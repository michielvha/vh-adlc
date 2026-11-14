# Creates the client's dedicated key if it is missing and keeps the
# private key readable only by the user. Input: key_name.
function Fail($m) { Write-Output "FAIL: $m"; exit 1 }
$sshDir = Join-Path $env:USERPROFILE '.ssh'
if (-not (Test-Path -LiteralPath $sshDir)) { New-Item -ItemType Directory -Path $sshDir | Out-Null }
$key = Join-Path $sshDir $key_name
if (-not (Test-Path -LiteralPath $key)) {
    # Windows PowerShell 5.1 drops empty native arguments, so -N "" goes in one argument string.
    $p = Start-Process -FilePath 'ssh-keygen' -ArgumentList "-q -t ed25519 -N `"`" -C paseo-hosts -f `"$key`"" -Wait -NoNewWindow -PassThru
    if ($p.ExitCode -ne 0) { Fail "ssh-keygen exited with $($p.ExitCode)" }
}
icacls $key /inheritance:r /grant:r "$($env:USERNAME):F" | Out-Null
if ($LASTEXITCODE -ne 0) { Fail "icacls could not restrict $key" }
$pub = [IO.File]::ReadAllText("$key.pub").Trim()
Write-Output "PUB=$pub"
