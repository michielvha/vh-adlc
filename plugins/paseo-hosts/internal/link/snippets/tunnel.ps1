# Checks the tunnel from Windows. Inputs: name, port.
function Fail($m) { Write-Output "FAIL: $m"; exit 1 }
$request = "GET /api/health HTTP/1.0`r`nHost: 127.0.0.1`r`n`r`n"
$answer = @($request | & ssh -T -o BatchMode=yes -o ConnectTimeout=10 -W "127.0.0.1:$port" $name)
$status = ''
if ($answer.Count -gt 0) { $status = ([string]$answer[0]).Trim() }
if (-not ($status -match ' 200')) { Fail "the tunnel to 127.0.0.1:${port} answered: $status" }
& ssh -o BatchMode=yes -o ConnectTimeout=10 $name true | Out-Null
if ($LASTEXITCODE -eq 0) { Fail 'the tunnel key was allowed a shell command' }
