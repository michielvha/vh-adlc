// Tests for plugins/vh-adlc/scripts/host/remote-control.sh, which keeps `claude remote-control` running
// as a per-user service. launchctl, systemctl, loginctl, ps, lsof, readlink, uname, id and hostname are
// stubs on PATH that record their calls, and HOME is a temporary directory, so no test touches the host.

import { afterEach, describe, expect, test } from "bun:test";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "..", "..");
const SCRIPT = join(ROOT, "plugins", "vh-adlc", "scripts", "host", "remote-control.sh");
const PYTHON = Bun.which("python3");

type Platform = "Darwin" | "Linux";

interface Host {
  root: string;
  home: string;
  repo: string;
  claude: string;
  bin: string;
  calls: string;
  state: string;
}

const hosts: string[] = [];
afterEach(() => {
  for (const root of hosts.splice(0)) rmSync(root, { recursive: true, force: true });
});

function stub(host: Host, name: string, body: string) {
  const path = join(host.bin, name);
  writeFileSync(path, `#!/bin/sh\necho "${name} $*" >> "${host.calls}"\n${body}\n`);
  chmodSync(path, 0o755);
}

// A host whose service manager remembers what was loaded or enabled under host.state.
function newHost(platform: Platform, loggedIn = true): Host {
  // realpath, because the script uses the physical path, as Claude does (macOS /var is /private/var).
  const root = Bun.spawnSync(["sh", "-c", 'cd "$1" && pwd -P', "sh", mkdtempSync(join(tmpdir(), "vh-adlc-rc-"))])
    .stdout.toString()
    .trim();
  hosts.push(root);
  const host: Host = {
    root,
    home: join(root, "home"),
    repo: join(root, "code", "vh-adlc"),
    claude: join(root, "tools", "claude"),
    bin: join(root, "bin"),
    calls: join(root, "calls.log"),
    state: join(root, "state"),
  };
  for (const dir of [host.home, host.repo, host.bin, host.state, join(root, "tools")]) mkdirSync(dir, { recursive: true });
  writeFileSync(host.calls, "");
  if (PYTHON) symlinkSync(PYTHON, join(host.bin, "python3"));

  writeFileSync(host.claude, `#!/bin/sh\necho '{"loggedIn": ${loggedIn}, "email": "someone@example.com"}'\n`);
  chmodSync(host.claude, 0o755);
  stub(host, "uname", `echo ${platform}`);
  stub(host, "id", `case "$1" in -u) echo 501 ;; -un) echo tester ;; esac`);
  stub(host, "hostname", "echo Workstation.local");
  stub(host, "sleep", "exit 0");
  stub(host, "ps", `cat "${host.state}/ps" 2>/dev/null; exit 0`);
  stub(host, "lsof", `pid=$3; [ -f "${host.state}/cwd-$pid" ] && { echo "p$pid"; echo fcwd; echo "n$(cat "${host.state}/cwd-$pid")"; }; exit 0`);
  stub(host, "readlink", `pid=$(echo "$1" | cut -d/ -f3); cat "${host.state}/cwd-$pid" 2>/dev/null`);
  stub(
    host,
    "launchctl",
    `case "$1" in
  print) [ -f "${host.state}/loaded" ] || exit 113; echo "	state = running"; echo "	pid = 10" ;;
  bootstrap) touch "${host.state}/loaded" ;;
  bootout) rm -f "${host.state}/loaded" ;;
esac`,
  );
  stub(
    host,
    "systemctl",
    `case "$2" in
  show) if [ -f "${host.state}/enabled" ]; then echo UnitFileState=enabled; echo ActiveState=active; echo MainPID=10; else echo UnitFileState=disabled; echo ActiveState=inactive; echo MainPID=0; fi ;;
  enable) touch "${host.state}/enabled" ;;
  disable) rm -f "${host.state}/enabled" ;;
esac`,
  );
  stub(host, "loginctl", `case "$1" in show-user) cat "${host.state}/linger" 2>/dev/null || echo no ;; enable-linger) echo yes > "${host.state}/linger" ;; esac`);
  return host;
}

function run(host: Host, args: string[], env: Record<string, string> = {}) {
  const result = Bun.spawnSync(["sh", SCRIPT, ...args], {
    cwd: host.repo,
    env: {
      PATH: `${host.bin}:/usr/bin:/bin`,
      HOME: host.home,
      VH_ADLC_RC_MANAGED_SETTINGS: join(host.root, "managed-settings.json"),
      ...env,
    },
    stdout: "pipe",
    stderr: "pipe",
  });
  const out = result.stdout.toString();
  return { code: result.exitCode, out, err: result.stderr.toString(), lines: out.trim().split("\n") };
}

const calls = (host: Host) => readFileSync(host.calls, "utf8").trim().split("\n").filter(Boolean);
const writeJson = (path: string, value: unknown) => {
  mkdirSync(resolve(path, ".."), { recursive: true });
  writeFileSync(path, JSON.stringify(value));
};
const plist = (host: Host) => join(host.home, "Library", "LaunchAgents", "pro.vhco.claude-remote-control.vh-adlc.plist");
const unit = (host: Host) => join(host.home, ".config", "systemd", "user", "claude-remote-control-vh-adlc.service");
const ready = (host: Host) =>
  writeJson(join(host.home, ".claude.json"), { remoteDialogSeen: true, projects: { [host.repo]: { hasTrustDialogAccepted: true } } });

describe("remote-control.sh on macOS", () => {
  test("install writes a LaunchAgent that keeps claude remote-control running in worktree mode and loads it into gui/<uid>", () => {
    const host = newHost("Darwin");
    const out = run(host, ["install", "--dir", host.repo, "--name", "macbook-vh-adlc", "--claude", host.claude, "--path", "/opt/homebrew/bin:/usr/bin"]);

    expect(out.code).toBe(0);
    const xml = readFileSync(plist(host), "utf8");
    expect(xml).toContain("<key>Label</key><string>pro.vhco.claude-remote-control.vh-adlc</string>");
    expect(xml).toContain(
      `    <string>${host.claude}</string>\n    <string>remote-control</string>\n    <string>--spawn=worktree</string>\n    <string>--name</string>\n    <string>macbook-vh-adlc</string>`,
    );
    expect(xml).toContain(`<key>WorkingDirectory</key><string>${host.repo}</string>`);
    expect(xml).toContain("<key>PATH</key><string>/opt/homebrew/bin:/usr/bin</string>");
    expect(xml).toContain("<key>RunAtLoad</key><true/>\n  <key>KeepAlive</key><true/>\n  <key>ThrottleInterval</key><integer>60</integer>");
    expect(xml).toContain(`<key>StandardOutPath</key><string>${host.home}/Library/Logs/claude-remote-control-vh-adlc.log</string>`);
    expect(calls(host)).toContain(`launchctl bootstrap gui/501 ${plist(host)}`);
  });

  test("--spawn same-dir and an XML-unsafe name are written as given", () => {
    const host = newHost("Darwin");
    run(host, ["install", "--dir", host.repo, "--name", "a&b <c>", "--claude", host.claude, "--spawn", "same-dir"]);

    const xml = readFileSync(plist(host), "utf8");
    expect(xml).toContain("<string>--spawn=same-dir</string>");
    expect(xml).toContain("<string>a&amp;b &lt;c&gt;</string>");
  });

  test("the default name is the short host name and the folder", () => {
    const host = newHost("Darwin");
    run(host, ["install", "--dir", host.repo, "--claude", host.claude]);

    expect(readFileSync(plist(host), "utf8")).toContain("<string>workstation-vh-adlc</string>");
  });

  test("a second install with the same options changes nothing", () => {
    const host = newHost("Darwin");
    const args = ["install", "--dir", host.repo, "--name", "mac", "--claude", host.claude, "--path", "/usr/bin"];
    run(host, args);
    writeFileSync(host.calls, "");

    const out = run(host, args);

    expect(out.lines[0]).toBe(`unchanged: ${plist(host)}`);
    expect(calls(host).filter((line) => /launchctl (bootstrap|bootout)/.test(line))).toEqual([]);
  });

  test("changed options rewrite the plist and reload the loaded agent", () => {
    const host = newHost("Darwin");
    run(host, ["install", "--dir", host.repo, "--name", "old", "--claude", host.claude]);
    writeFileSync(host.calls, "");

    run(host, ["install", "--dir", host.repo, "--name", "new", "--claude", host.claude]);

    expect(readFileSync(plist(host), "utf8")).toContain("<string>new</string>");
    const reload = calls(host).filter((line) => /launchctl (bootstrap|bootout)/.test(line));
    expect(reload).toEqual(["launchctl bootout gui/501/pro.vhco.claude-remote-control.vh-adlc", `launchctl bootstrap gui/501 ${plist(host)}`]);
  });

  test("--dry-run writes nothing and loads nothing", () => {
    const host = newHost("Darwin");
    const out = run(host, ["install", "--dir", host.repo, "--claude", host.claude, "--dry-run"]);

    expect(out.code).toBe(0);
    expect(out.out).toContain(`would write: ${plist(host)}`);
    expect(existsSync(plist(host))).toBe(false);
    expect(calls(host).filter((line) => /launchctl (bootstrap|bootout)/.test(line))).toEqual([]);
  });

  test("install stops when claude cannot be found", () => {
    const host = newHost("Darwin");
    const out = run(host, ["install", "--dir", host.repo]);

    expect(out.code).toBe(1);
    expect(out.err).toContain("Claude Code was not found");
    expect(existsSync(plist(host))).toBe(false);
  });

  test("never records trust or consent, and gives the owner both steps in order", () => {
    const host = newHost("Darwin");
    const out = run(host, ["install", "--dir", host.repo, "--claude", host.claude]);

    expect(existsSync(join(host.home, ".claude.json"))).toBe(false);
    const steps = out.lines.slice(out.lines.indexOf("Steps left for the owner, in this order:") + 1);
    expect(steps[0]).toContain("[workspace trust] At a terminal, run claude in");
    expect(steps[1]).toContain("[remote control consent]");
    expect(steps[1]).toContain("answer y to 'Enable Remote Control?'. Then stop that terminal bridge with Ctrl+C");
  });

  test.skipIf(!PYTHON)("status is ready when trust, consent and login are recorded and no terminal bridge runs", () => {
    const host = newHost("Darwin");
    ready(host);
    run(host, ["install", "--dir", host.repo, "--claude", host.claude]);

    const out = run(host, ["status", "--dir", host.repo, "--claude", host.claude]);

    expect(out.code).toBe(0);
    expect(out.lines[0]).toBe("service pro.vhco.claude-remote-control.vh-adlc: installed yes, loaded yes, running yes (PID 10)");
    expect(out.lines.filter((line) => line.startsWith("ok "))).toHaveLength(6);
    expect(out.out).not.toContain("Steps left");
  });

  test.skipIf(!PYTHON)("trust recorded for a parent folder counts", () => {
    const host = newHost("Darwin");
    writeJson(join(host.home, ".claude.json"), { remoteDialogSeen: true, projects: { [resolve(host.repo, "..")]: { hasTrustDialogAccepted: true } } });

    const out = run(host, ["status", "--dir", host.repo, "--claude", host.claude]);

    expect(out.out).toContain(`ok workspace trust: accepted for ${resolve(host.repo, "..")}`);
  });

  test.skipIf(!PYTHON)("flags the traffic setting in every settings layer", () => {
    const host = newHost("Darwin");
    ready(host);
    const files = [
      join(host.home, ".claude", "settings.json"),
      join(host.repo, ".claude", "settings.json"),
      join(host.repo, ".claude", "settings.local.json"),
      join(host.root, "managed-settings.json"),
    ];
    for (const file of files) {
      writeJson(file, { env: { CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1" } });
      const out = run(host, ["status", "--dir", host.repo, "--claude", host.claude]);
      rmSync(file);

      expect(out.code).toBe(1);
      expect(out.out).toContain(`action nonessential traffic: CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC is set in ${file}`);
      expect(out.out).toContain("settings env overrides the shell");
    }
  });

  test.skipIf(!PYTHON)("reads only loggedIn from claude auth status and never prints the account", () => {
    const host = newHost("Darwin");
    const out = run(host, ["status", "--dir", host.repo, "--claude", host.claude]);

    expect(out.out).toContain("ok login: claude auth status reports a login");
    expect(out.out + out.err).not.toContain("someone@example.com");
  });

  test.skipIf(!PYTHON)("asks for a login, but reports it unknown over SSH where the Keychain is out of reach", () => {
    const host = newHost("Darwin", false);

    expect(run(host, ["status", "--dir", host.repo, "--claude", host.claude]).out).toContain("action login: claude auth status reports no login");
    const ssh = run(host, ["status", "--dir", host.repo, "--claude", host.claude], { SSH_CONNECTION: "192.0.2.1 50000 192.0.2.2 22" });
    expect(ssh.out).toContain("unknown login: over SSH the macOS Keychain is out of reach");
  });

  test("finds a terminal bridge serving the folder and ignores the service, other folders and other commands", () => {
    const host = newHost("Darwin");
    run(host, ["install", "--dir", host.repo, "--claude", host.claude]);
    writeFileSync(
      join(host.state, "ps"),
      ["   10 /opt/homebrew/bin/claude remote-control --spawn=worktree", "  200 claude remote-control", "  300 claude remote-control", "  400 claude --resume x", "  500 vim remote-control.md", ""].join("\n"),
    );
    writeFileSync(join(host.state, "cwd-10"), host.repo);
    writeFileSync(join(host.state, "cwd-200"), host.repo);
    writeFileSync(join(host.state, "cwd-300"), join(host.root, "elsewhere"));

    const out = run(host, ["status", "--dir", host.repo, "--claude", host.claude]);

    expect(out.code).toBe(1);
    expect(out.out).toContain(`action terminal bridge: a terminal claude remote-control (PID 200) already serves ${host.repo}`);
    expect(out.out).toContain("Stop the terminal bridge with Ctrl+C in its terminal, or kill 200.");
    expect(calls(host).filter((line) => line.startsWith("lsof")).map((line) => line.split(" ")[3])).toEqual(["200", "300"]);
  });

  test("uninstall unloads the agent, deletes the plist and keeps the log", () => {
    const host = newHost("Darwin");
    run(host, ["install", "--dir", host.repo, "--claude", host.claude]);

    const out = run(host, ["uninstall", "--dir", host.repo]);

    expect(out.code).toBe(0);
    expect(calls(host)).toContain("launchctl bootout gui/501/pro.vhco.claude-remote-control.vh-adlc");
    expect(existsSync(plist(host))).toBe(false);
    expect(out.out).toContain("kept: the log");
  });

  test("uninstall without a service changes nothing", () => {
    const host = newHost("Darwin");
    const out = run(host, ["uninstall", "--dir", host.repo]);

    expect(out.out.trim()).toBe(`no Remote Control service is installed for ${host.repo}`);
    expect(calls(host).filter((line) => line.startsWith("launchctl bootout"))).toEqual([]);
  });
});

describe("remote-control.sh on Linux", () => {
  test("install writes, enables and restarts a systemd --user unit, with linger on request", () => {
    const host = newHost("Linux");
    const out = run(host, ["install", "--dir", host.repo, "--name", "dev vm", "--claude", host.claude, "--path", "/usr/bin", "--linger"]);

    expect(out.code).toBe(0);
    const content = readFileSync(unit(host), "utf8");
    expect(content).toContain(`WorkingDirectory=${host.repo}\n`);
    expect(content).toContain('Environment="PATH=/usr/bin"\n');
    expect(content).toContain(`ExecStart="${host.claude}" "remote-control" "--spawn=worktree" "--name" "dev vm"\n`);
    expect(content).toContain("Restart=always\nRestartSec=60\n");
    expect(content).toContain("WantedBy=default.target\n");
    expect(calls(host)).toEqual(
      expect.arrayContaining([
        "systemctl --user daemon-reload",
        "systemctl --user enable claude-remote-control-vh-adlc.service",
        "systemctl --user restart claude-remote-control-vh-adlc.service",
        "loginctl enable-linger tester",
      ]),
    );
    expect(out.out).toContain("ok linger: enabled for tester");
  });

  test("a second install only starts the unchanged unit", () => {
    const host = newHost("Linux");
    run(host, ["install", "--dir", host.repo, "--name", "f", "--claude", host.claude]);
    writeFileSync(host.calls, "");

    run(host, ["install", "--dir", host.repo, "--name", "f", "--claude", host.claude]);

    const systemctl = calls(host).filter((line) => /systemctl --user (daemon-reload|enable|start|restart)/.test(line));
    expect(systemctl).toEqual(["systemctl --user enable claude-remote-control-vh-adlc.service", "systemctl --user start claude-remote-control-vh-adlc.service"]);
  });

  test("escapes systemd specifiers and variables", () => {
    const host = newHost("Linux");
    run(host, ["install", "--dir", host.repo, "--name", '100%$HOME "x"', "--claude", host.claude]);

    expect(readFileSync(unit(host), "utf8")).toContain('"100%%$$HOME \\"x\\""');
  });

  test("reports linger as optional when it is off", () => {
    const host = newHost("Linux");
    const out = run(host, ["status", "--dir", host.repo, "--claude", host.claude]);

    expect(out.out).toContain("optional linger: off for tester");
  });

  test("reads a terminal bridge's folder from /proc", () => {
    const host = newHost("Linux");
    writeFileSync(join(host.state, "ps"), "  200 /usr/bin/claude remote-control\n");
    writeFileSync(join(host.state, "cwd-200"), host.repo);

    const out = run(host, ["status", "--dir", host.repo, "--claude", host.claude]);

    expect(out.out).toContain("action terminal bridge: a terminal claude remote-control (PID 200)");
    expect(calls(host)).toContain("readlink /proc/200/cwd");
  });

  test("uninstall disables and stops the unit, deletes it and reloads systemd", () => {
    const host = newHost("Linux");
    run(host, ["install", "--dir", host.repo, "--claude", host.claude]);
    writeFileSync(host.calls, "");

    run(host, ["uninstall", "--dir", host.repo]);

    expect(calls(host)).toEqual(
      expect.arrayContaining(["systemctl --user disable --now claude-remote-control-vh-adlc.service", "systemctl --user daemon-reload"]),
    );
    expect(existsSync(unit(host))).toBe(false);
  });
});

describe("remote-control.sh usage", () => {
  test("rejects an unknown command, an unknown spawn mode and other platforms", () => {
    const host = newHost("Darwin");
    expect(run(host, ["start"]).code).toBe(2);
    expect(run(host, ["install", "--spawn", "elsewhere"]).code).toBe(2);
    stub(host, "uname", "echo FreeBSD");
    expect(run(host, ["status"]).err).toContain("supports macOS (LaunchAgent) and Linux (systemd --user) only");
  });
});
