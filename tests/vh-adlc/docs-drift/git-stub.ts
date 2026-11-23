// Fixture `git` and `gh` wrappers written as POSIX shell scripts. The docs-drift native paths call
// these wrappers thousands of times per test. A Bun script starts a JavaScript runtime for every
// call; these start only `sh` (and `awk` when they log), so each call costs a few milliseconds.

/** Quote a value as one POSIX shell word. */
export function shellWord(value: string): string {
  return "'" + value.replaceAll("'", "'\\''") + "'";
}

/**
 * Shell lines that append one JSON line holding `fields` (shell expressions, in order) and then
 * `"args"`, the script's arguments. JSON.parse reads back the strings JSON.stringify would have
 * written: awk escapes quotes, backslashes and every control character.
 */
function jsonLine(file: string, fields: Array<[name: string, shellValue: string]>, options: { private: boolean }): string[] {
  const awk = [
    "BEGIN { for (i = 1; i < 32; i++) code[sprintf(\"%c\", i)] = sprintf(\"\\\\u%04x\", i)",
    '  code["\\b"] = "\\\\b"; code["\\f"] = "\\\\f"; code["\\n"] = "\\\\n"; code["\\r"] = "\\\\r"; code["\\t"] = "\\\\t"',
    "  fixed = ARGV[1]; line = \"{\"",
    "  for (i = 2; i < ARGC; i++) { s = ARGV[i]; out = \"\"",
    "    for (j = 1; j <= length(s); j++) { c = substr(s, j, 1)",
    '      if (c == "\\\\") c = "\\\\\\\\"; else if (c == "\\"") c = "\\\\\\""; else if (c in code) c = code[c]',
    "      out = out c }",
    "    k = i - 2",
    '    if (k < 2 * fixed) line = line (k % 2 == 0 ? (k > 0 ? "," : "") "\\"" out "\\":" : "\\"" out "\\"")',
    '    else line = line (k == 2 * fixed ? (fixed > 0 ? "," : "") "\\"args\\":[" : ",") "\\"" out "\\"" }',
    '  print line (ARGC - 2 == 2 * fixed ? (fixed > 0 ? "," : "") "\\"args\\":[" : "") "]}"; exit }',
  ].join("\n");
  const values = fields.flatMap(([name, value]) => [shellWord(name), value]).join(" ");
  return [`(${options.private ? "umask 077; " : ""}awk ${shellWord(awk)} ${fields.length} ${values} "$@" >> ${shellWord(file)}) || exit 1`];
}

export type GitStubOptions = {
  /** The real Git executable the stub runs after its checks. */
  git: string;
  /** The local repository that stands in for https://github.com/fixture/docs.git. */
  origin: string;
  /** Refuse pushes and any HTTPS fetch other than the fixture URL with exit 91. */
  refuseRemote?: boolean;
  /** Append each call as a private JSON line `{ "program": "git", "args": [...] }` before running it. */
  log?: string;
  /** After Git returns, run `command` when an argument contains `contains`; exit with Git's status. */
  after?: { contains: string; command: string[] };
};

/**
 * The redirecting fixture Git. The first fixture URL becomes `origin`, and
 * `-c protocol.file.allow=always` goes before the first `fetch`, or before the last argument when
 * there is no `fetch` (the position the earlier stub's `splice(indexOf("fetch"), 0, ...)` chose).
 */
export function gitStub(options: GitStubOptions): string {
  const lines = ["#!/bin/sh", "target=-1 fetch=-1 push=0 https=0 n=0", "for a do",
    '  [ "$a" = push ] && push=1',
    '  [ "$a" = fetch ] && [ "$fetch" -lt 0 ] && fetch=$n',
    '  [ "$a" = https://github.com/fixture/docs.git ] && [ "$target" -lt 0 ] && target=$n',
    "  case $a in https://*) https=1;; esac",
    "  n=$((n + 1))", "done"];
  if (options.log) lines.push(...jsonLine(options.log, [["program", "git"]], { private: true }));
  if (options.refuseRemote) lines.push(
    '[ "$push" = 1 ] && exit 91',
    '[ "$fetch" -ge 0 ] && [ "$https" = 1 ] && [ "$target" -lt 0 ] && exit 91');
  lines.push(
    'if [ "$target" -ge 0 ]; then',
    '  insert=$fetch; [ "$insert" -lt 0 ] && insert=$((n - 1))',
    "  i=0",
    "  for a do",
    '    [ "$i" = 0 ] && set --',
    '    [ "$i" = "$insert" ] && set -- "$@" -c protocol.file.allow=always',
    '    if [ "$i" = "$target" ]; then set -- "$@" ' + shellWord(options.origin) + '; else set -- "$@" "$a"; fi',
    "    i=$((i + 1))",
    "  done",
    "fi");
  if (options.after) lines.push(
    shellWord(options.git) + ' "$@"; status=$?',
    "for a do case $a in *" + shellWord(options.after.contains) + "*) " + options.after.command.map(shellWord).join(" ") + "; break;; esac; done",
    'exit "$status"', "");
  else lines.push("exec " + shellWord(options.git) + ' "$@"', "");
  return lines.join("\n");
}

export type OwnedWrapperOptions = {
  /** `git` runs reads directly and sends fetch and push to the service; `gh` always uses the service. */
  name: "git" | "gh";
  git: string;
  flock: string;
  lock: string;
  /** The Bun executable and the fake service program. */
  bun: string;
  service: string;
  /** Before anything else, append `{ "cwd": <physical cwd>, "args": [...] }` to this file. */
  record?: string;
};

/** The owned native service wrapper. Read-only Git refuses HTTPS; other calls hold the state lock. */
export function ownedWrapper(options: OwnedWrapperOptions): string {
  const lines = ["#!/bin/sh"];
  if (options.record) lines.push(...jsonLine(options.record, [["cwd", '"$(pwd -P)"']], { private: false }));
  lines.push(
    `readonly=${options.name === "git" ? 1 : 0} https=0`,
    "for a do case $a in fetch|push) readonly=0;; https://*) https=1;; esac; done",
    "export GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_SYSTEM=/dev/null GIT_CONFIG_NOSYSTEM=1 GIT_CONFIG_COUNT=0",
    'if [ "$readonly" = 1 ]; then',
    '  [ "$https" = 1 ] && exit 91',
    "  exec " + shellWord(options.git) + ' "$@"',
    "fi",
    "exec " + [options.flock, "-x", options.lock, options.bun, options.service].map(shellWord).join(" ") + ' "$@"', "");
  return lines.join("\n");
}
