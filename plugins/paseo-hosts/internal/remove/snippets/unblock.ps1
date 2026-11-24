# Deletes a server's alias block, with the paseo-hosts or the local tool's
# paseo-host markers, from the Windows SSH config. Input: name.
$utf8 = New-Object System.Text.UTF8Encoding $false
$cfg = Join-Path (Join-Path $env:USERPROFILE '.ssh') 'config'
if (-not (Test-Path -LiteralPath $cfg)) { exit 0 }
$lines = @([IO.File]::ReadAllText($cfg) -split "`r?`n")
$begins = @("# BEGIN paseo-hosts $name", "# BEGIN paseo-host $name")
$ends = @("# END paseo-hosts $name", "# END paseo-host $name")
if (-not ($lines | Where-Object { $begins -contains $_ })) { exit 0 }
Copy-Item -LiteralPath $cfg -Destination "$cfg.bak-paseo-hosts" -Force
$out = New-Object System.Collections.Generic.List[string]
$skip = $false
foreach ($l in $lines) {
    if ($begins -contains $l) { $skip = $true; continue }
    if ($skip -and ($ends -contains $l)) { $skip = $false; continue }
    if (-not $skip) { $out.Add($l) }
}
while ($out.Count -gt 0 -and $out[$out.Count - 1] -eq '') { $out.RemoveAt($out.Count - 1) }
$text = ''
if ($out.Count -gt 0) { $text = ($out -join "`n") + "`n" }
[IO.File]::WriteAllText($cfg, $text, $utf8)
