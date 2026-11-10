# Trusts the server's host keys and writes the alias block on Windows.
# Inputs: name, known_name, host_keys (one "type base64" per line),
# host_name, port, user, key_name.
$utf8 = New-Object System.Text.UTF8Encoding $false
$sshDir = Join-Path $env:USERPROFILE '.ssh'
if (-not (Test-Path -LiteralPath $sshDir)) { New-Item -ItemType Directory -Path $sshDir | Out-Null }

function Read-Lines($path) {
    if (-not (Test-Path -LiteralPath $path)) { return @() }
    return @([IO.File]::ReadAllText($path) -split "`r?`n")
}

function Test-KnownName($field, $want) {
    if ($field.StartsWith('|1|')) {
        $parts = $field.Split('|')
        $hmac = New-Object System.Security.Cryptography.HMACSHA1 -ArgumentList (,[Convert]::FromBase64String($parts[2]))
        $hash = [Convert]::ToBase64String($hmac.ComputeHash([Text.Encoding]::ASCII.GetBytes($want)))
        return ($hash -eq $parts[3])
    }
    return ($field.Split(',') -contains $want)
}

$kh = Join-Path $sshDir 'known_hosts'
$known = New-Object System.Collections.Generic.List[string]
foreach ($l in (Read-Lines $kh)) {
    if ($l -eq '') { continue }
    if (Test-KnownName (($l -split '\s+')[0]) $known_name) { continue }
    $known.Add($l)
}
foreach ($k in ($host_keys -split "`n")) {
    if ($k -ne '') { $known.Add("$known_name $k") }
}
[IO.File]::WriteAllText($kh, (($known -join "`n") + "`n"), $utf8)

$cfg = Join-Path $sshDir 'config'
if (Test-Path -LiteralPath $cfg) { Copy-Item -LiteralPath $cfg -Destination "$cfg.bak-paseo-hosts" -Force }
$out = New-Object System.Collections.Generic.List[string]
$skip = $false
foreach ($l in (Read-Lines $cfg)) {
    if ($l -eq "# BEGIN paseo-hosts $name" -or $l -eq "# BEGIN paseo-host $name") { $skip = $true; continue }
    if ($skip -and ($l -eq "# END paseo-hosts $name" -or $l -eq "# END paseo-host $name")) { $skip = $false; continue }
    if (-not $skip) { $out.Add($l) }
}
while ($out.Count -gt 0 -and $out[$out.Count - 1] -eq '') { $out.RemoveAt($out.Count - 1) }
if ($out.Count -gt 0) { $out.Add('') }
$out.Add("# BEGIN paseo-hosts $name")
$out.Add("Host $name")
$out.Add("  HostName $host_name")
$out.Add("  Port $port")
$out.Add("  User $user")
$out.Add("  IdentityFile ~/.ssh/$key_name")
$out.Add('  IdentitiesOnly yes')
$out.Add('  StrictHostKeyChecking yes')
$out.Add("# END paseo-hosts $name")
[IO.File]::WriteAllText($cfg, (($out -join "`n") + "`n"), $utf8)
