# Lists or deletes the server's tunnel-only authorized_keys lines: those with
# both permitopen="127.0.0.1:<port>" and command="/bin/false".
# Inputs: port, action (list or delete), keys (key data, one per line),
# comment, all (yes or no). Delete drops a tunnel-only line whose key is in
# keys, whose comment is comment, or any one with all = yes.
set -euo pipefail
f="$HOME/.ssh/authorized_keys"
[[ -f "$f" ]] || exit 0
prog='
  function tunnel() { return index($1, "permitopen=\"127.0.0.1:" port "\"") && index($1, "command=\"/bin/false\"") }
  function rest(   s, i) { s = ""; for (i = 4; i <= NF; i++) s = s (i > 4 ? " " : "") $i; return s }
  BEGIN { n = split(ENVIRON["KEYS"], k, "\n"); for (i = 1; i <= n; i++) if (k[i] != "") want[k[i]] = 1 }
  action == "list" { if (tunnel()) print "LINE=" $3 " " rest(); next }
  tunnel() && (all == "yes" || ($3 in want) || (ENVIRON["COMMENT"] != "" && rest() == ENVIRON["COMMENT"])) { deleted++; next }
  { print }
  END { if (action == "delete") print deleted + 0 >"/dev/stderr" }
'
if [[ "$action" == list ]]; then
  KEYS="" COMMENT="" awk -v port="$port" -v action=list -v all=no "$prog" "$f"
  exit 0
fi
tmp="$(mktemp "$f.XXXXXX")"
count="$(KEYS="$keys" COMMENT="$comment" awk -v port="$port" -v action=delete -v all="$all" "$prog" "$f" 2>&1 >"$tmp")"
if [[ "$count" == 0 ]]; then
  rm -f "$tmp"
else
  cp -p "$f" "$f.bak-paseo-hosts"
  chmod 600 "$tmp"
  mv "$tmp" "$f"
fi
echo "DELETED=$count"
