# Checks the tunnel from Windows. Inputs: name, port.
# Windows OpenSSH does not relay `ssh -W` over redirected pipes, so this opens
# a local forward and sends the request through it.
function Fail($m) { Write-Output "FAIL: $m"; exit 1 }
$listener = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Loopback, 0)
$listener.Start()
$local = $listener.LocalEndpoint.Port
$listener.Stop()
$psi = New-Object System.Diagnostics.ProcessStartInfo
$psi.FileName = 'ssh'
$psi.Arguments = "-N -T -o BatchMode=yes -o ConnectTimeout=10 -o ExitOnForwardFailure=yes -L 127.0.0.1:${local}:127.0.0.1:$port $name"
$psi.UseShellExecute = $false
$psi.RedirectStandardInput = $true
$psi.RedirectStandardOutput = $true
$psi.RedirectStandardError = $true
$ssh = [System.Diagnostics.Process]::Start($psi)
$status = ''
$deadline = [DateTime]::UtcNow.AddSeconds(20)
while ($status -eq '' -and -not $ssh.HasExited -and [DateTime]::UtcNow -lt $deadline) {
    Start-Sleep -Milliseconds 250
    $client = New-Object System.Net.Sockets.TcpClient
    try {
        $client.Connect('127.0.0.1', $local)
        $stream = $client.GetStream()
        $stream.ReadTimeout = 5000
        $request = [Text.Encoding]::ASCII.GetBytes("GET /api/health HTTP/1.0`r`nHost: 127.0.0.1`r`n`r`n")
        $stream.Write($request, 0, $request.Length)
        $status = ([string](New-Object System.IO.StreamReader($stream)).ReadLine()).Trim()
    } catch {
        $status = ''
    } finally {
        $client.Close()
    }
}
if (-not $ssh.HasExited) { $ssh.Kill() }
if (-not ($status -match ' 200')) {
    if ($status -eq '') { $status = 'nothing' }
    Fail "the tunnel to 127.0.0.1:${port} answered: $status"
}
& ssh -o BatchMode=yes -o ConnectTimeout=10 $name true | Out-Null
if ($LASTEXITCODE -eq 0) { Fail 'the tunnel key was allowed a shell command' }
