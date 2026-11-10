# Prints the client key's public half, if it exists. Input: key_name.
$f = Join-Path (Join-Path $env:USERPROFILE '.ssh') "$key_name.pub"
if (Test-Path -LiteralPath $f) { Write-Output ('PUB=' + ([IO.File]::ReadAllText($f) -split "`r?`n")[0]) }
