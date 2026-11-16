# Checks the tunnel from a Mac. Inputs: name, port.
set -eu
fail() { echo "FAIL: $*"; exit 1; }
status="$(printf 'GET /api/health HTTP/1.0\r\nHost: 127.0.0.1\r\n\r\n' \
  | ssh -T -o BatchMode=yes -o ConnectTimeout=10 -W "127.0.0.1:$port" "$name" 2>&1 | head -1 | tr -d '\r')" || true
case "$status" in
  *" 200"*) ;;
  *) fail "the tunnel to 127.0.0.1:$port answered: ${status:-nothing}" ;;
esac
if ssh -o BatchMode=yes -o ConnectTimeout=10 "$name" true </dev/null >/dev/null 2>&1; then
  fail "the tunnel key was allowed a shell command"
fi
