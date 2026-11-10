package testenv

import (
	"bufio"
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"time"
)

// FakeHash is the stand-in for hashDaemonPassword.
func FakeHash(password string) string {
	sum := sha256.Sum256([]byte(password))
	return "$2b$10$" + hex.EncodeToString(sum[:])
}

func root() string { return os.Getenv(envRoot) }

// hostDir resolves a host name or alias to its canonical directory.
func hostDir(name string) (string, bool) {
	if name == "" || strings.ContainsAny(name, "/") {
		return "", false
	}
	dir, err := filepath.EvalSymlinks(filepath.Join(root(), "hosts", name))
	if err != nil {
		return "", false
	}
	return dir, true
}

func callerDir() string {
	if h := os.Getenv(envHost); h != "" {
		dir, _ := hostDir(h)
		return dir
	}
	return ""
}

func marker(dir, name string) (string, bool) {
	if dir == "" {
		return "", false
	}
	data, err := os.ReadFile(filepath.Join(dir, name))
	if err != nil {
		return "", false
	}
	return strings.TrimSpace(string(data)), true
}

func setMarker(dir, name, content string) {
	_ = os.WriteFile(filepath.Join(dir, name), []byte(content), 0o600)
}

func hostPort(dir string) string {
	if p, ok := marker(dir, "ssh-port"); ok {
		return p
	}
	return "22"
}

func activePort(dir string) string {
	p, _ := marker(dir, "systemd-active")
	return p
}

func hostEnv(dir string) []string {
	name := filepath.Base(dir)
	user, _ := marker(dir, "user")
	home := filepath.Join(dir, "home")
	path := strings.Join([]string{filepath.Join(dir, "bin"), filepath.Join(root(), "bin"), filepath.Join(root(), "sys")}, string(os.PathListSeparator))
	env := []string{
		"HOME=" + home, "USER=" + user, "LOGNAME=" + user, "LANG=C.UTF-8", "PATH=" + path,
		"TMPDIR=" + filepath.Join(dir, "tmp"), envRoot + "=" + root(), envHost + "=" + name,
		"GORACE=" + os.Getenv("GORACE"),
	}
	if k, _ := marker(dir, "kind"); k == Windows {
		env = append(env, "OS=Windows_NT", "USERPROFILE="+home, "USERNAME="+user, "PASEO_TESTENV_HOSTDIR="+dir)
	}
	return env
}

func fail(code int, format string, args ...any) int {
	_, _ = fmt.Fprintf(os.Stderr, format+"\n", args...)
	return code
}

func exitCode(err error) int {
	var ee *exec.ExitError
	if errors.As(err, &ee) {
		return ee.ExitCode()
	}
	if err != nil {
		return 127
	}
	return 0
}

func passthrough(name string) func([]string) int {
	return func(args []string) int {
		cmd := exec.Command(realTool(root(), name), args...)
		cmd.Stdin, cmd.Stdout, cmd.Stderr = os.Stdin, os.Stdout, os.Stderr
		return exitCode(cmd.Run())
	}
}

type sshArgs struct {
	G, N    bool
	W, L, p string
	dest    string
	cmd     []string
}

func parseSSH(args []string) sshArgs {
	const withValue = "BbcDEeFIiJLlmOoPpQRSWw"
	var a sshArgs
	for i := 0; i < len(args); i++ {
		arg := args[i]
		if !strings.HasPrefix(arg, "-") || len(arg) < 2 {
			a.dest, a.cmd = arg, args[i+1:]
			return a
		}
		for j := 1; j < len(arg); j++ {
			c := arg[j]
			if strings.IndexByte(withValue, c) < 0 {
				switch c {
				case 'G':
					a.G = true
				case 'N':
					a.N = true
				}
				continue
			}
			v := arg[j+1:]
			if v == "" && i+1 < len(args) {
				i++
				v = args[i]
			}
			switch c {
			case 'W':
				a.W = v
			case 'L':
				a.L = v
			case 'p':
				a.p = v
			}
			break
		}
	}
	return a
}

func sshMain(args []string) int {
	a := parseSSH(args)
	if a.G {
		return sshConfigDump(a.dest)
	}
	var dir string
	var key *keyLine
	if os.Getenv(envHost) == "" {
		d, ok := hostDir(a.dest)
		if !ok {
			return fail(255, "ssh: Could not resolve hostname %s: Name or service not known", a.dest)
		}
		dir = d
		if _, down := marker(dir, "unreachable"); down {
			return fail(255, "ssh: connect to host %s port 22: Connection refused", a.dest)
		}
	} else {
		d, k, code := clientConnect(a.dest)
		if code != 0 {
			return code
		}
		dir, key = d, k
	}
	switch {
	case a.L != "":
		return forward(dir, a.L)
	case a.W != "":
		return tunnel(dir, key, a.W)
	case key != nil && key.command != "":
		if key.command == "/bin/false" {
			return 1
		}
		return fail(1, "testenv: unsupported forced command %q", key.command)
	}
	return runRemote(dir, strings.Join(a.cmd, " "))
}

func sshConfigDump(dest string) int {
	dir, _ := hostDir(dest)
	hostname := dest
	if v, ok := marker(dir, "ssh-hostname"); ok {
		hostname = v
	}
	user, ok := marker(dir, "user")
	if !ok {
		user = "operator"
	}
	fmt.Printf("host %s\nuser %s\nhostname %s\nport %s\n", dest, user, hostname, hostPort(dir))
	if v, ok := marker(dir, "hostkeyalias"); ok {
		fmt.Printf("hostkeyalias %s\n", v)
	}
	fmt.Println("userknownhostsfile ~/.ssh/known_hosts ~/.ssh/known_hosts2")
	return 0
}

// sshConfigBlock returns the options of the Host block that names dest.
func sshConfigBlock(home, dest string) map[string]string {
	data, err := os.ReadFile(filepath.Join(home, ".ssh", "config"))
	if err != nil {
		return nil
	}
	var block map[string]string
	in := false
	for _, line := range strings.Split(string(data), "\n") {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		k, v, _ := strings.Cut(strings.Replace(line, "=", " ", 1), " ")
		k, v = strings.ToLower(k), strings.TrimSpace(v)
		if k == "host" {
			in = false
			for _, n := range strings.Fields(v) {
				if n == dest {
					in = true
					if block == nil {
						block = map[string]string{}
					}
				}
			}
			continue
		}
		if in {
			if _, seen := block[k]; !seen {
				block[k] = v
			}
		}
	}
	return block
}

type keyLine struct {
	restrict, portForwarding bool
	permitOpen               []string
	command                  string
}

func parseKeyOptions(opts string) *keyLine {
	k := &keyLine{}
	var parts []string
	var cur strings.Builder
	quoted := false
	for _, r := range opts {
		switch {
		case r == '"':
			quoted = !quoted
			cur.WriteRune(r)
		case r == ',' && !quoted:
			parts = append(parts, cur.String())
			cur.Reset()
		default:
			cur.WriteRune(r)
		}
	}
	parts = append(parts, cur.String())
	for _, p := range parts {
		name, val, _ := strings.Cut(p, "=")
		val = strings.Trim(val, `"`)
		switch strings.ToLower(name) {
		case "restrict":
			k.restrict = true
		case "port-forwarding":
			k.portForwarding = true
		case "permitopen":
			k.permitOpen = append(k.permitOpen, val)
		case "command":
			k.command = val
		}
	}
	return k
}

// clientConnect authenticates a client's connection to dest the way sshd
// would: its config block, known_hosts entry, user and authorized key.
func clientConnect(dest string) (string, *keyLine, int) {
	home := os.Getenv("HOME")
	cfg := sshConfigBlock(home, dest)
	if cfg == nil {
		return "", nil, fail(255, "ssh: Could not resolve hostname %s: Name or service not known", dest)
	}
	hostname := cfg["hostname"]
	if hostname == "" {
		hostname = dest
	}
	dir, ok := hostDir(hostname)
	if !ok {
		return "", nil, fail(255, "ssh: Could not resolve hostname %s: Name or service not known", hostname)
	}
	port := cfg["port"]
	if port == "" {
		port = "22"
	}
	if _, down := marker(dir, "unreachable"); down || port != hostPort(dir) {
		return "", nil, fail(255, "ssh: connect to host %s port %s: Connection refused", hostname, port)
	}
	name := hostname
	if port != "22" {
		name = "[" + hostname + "]:" + port
	}
	out, _ := exec.Command(realTool(root(), "ssh-keygen"), "-F", name, "-f", filepath.Join(home, ".ssh", "known_hosts")).Output()
	hk, _ := os.ReadFile(filepath.Join(dir, "hostkey.pub"))
	if f := strings.Fields(string(hk)); len(f) < 2 || !bytes.Contains(out, []byte(f[1])) || cfg["stricthostkeychecking"] != "yes" {
		return "", nil, fail(255, "Host key verification failed.")
	}
	if user, _ := marker(dir, "user"); cfg["user"] != user {
		return "", nil, fail(255, "%s@%s: Permission denied (publickey).", cfg["user"], hostname)
	}
	id := cfg["identityfile"]
	if strings.HasPrefix(id, "~/") {
		id = filepath.Join(home, id[2:])
	}
	pub, err := os.ReadFile(id + ".pub")
	fields := strings.Fields(string(pub))
	if err != nil || len(fields) < 2 || cfg["identitiesonly"] != "yes" {
		return "", nil, fail(255, "%s@%s: Permission denied (publickey).", cfg["user"], hostname)
	}
	ak, _ := os.ReadFile(filepath.Join(dir, "home", ".ssh", "authorized_keys"))
	for _, line := range strings.Split(string(ak), "\n") {
		f := strings.Fields(line)
		for i := range f {
			if f[i] == fields[1] && i >= 1 {
				if i == 1 {
					return dir, &keyLine{}, 0
				}
				return dir, parseKeyOptions(strings.Join(f[:i-1], " ")), 0
			}
		}
	}
	return "", nil, fail(255, "%s@%s: Permission denied (publickey).", cfg["user"], hostname)
}

func tunnel(dir string, key *keyLine, target string) int {
	if key != nil {
		allowed := !key.restrict || key.portForwarding
		if allowed && len(key.permitOpen) > 0 {
			allowed = false
			for _, p := range key.permitOpen {
				allowed = allowed || p == target
			}
		}
		if !allowed {
			return fail(255, "channel 0: open failed: administratively prohibited: open failed\nstdio forwarding failed")
		}
	}
	host, port, _ := net.SplitHostPort(target)
	if (host != "127.0.0.1" && host != "localhost") || port != activePort(dir) {
		return fail(255, "channel 0: open failed: connect failed: Connection refused\nstdio forwarding failed")
	}
	r := bufio.NewReader(os.Stdin)
	for {
		line, err := r.ReadString('\n')
		if err != nil || strings.TrimSpace(line) == "" {
			break
		}
	}
	fmt.Print("HTTP/1.1 200 OK\r\nContent-Type: application/json\r\n\r\n{\"status\":\"ok\"}\n")
	return 0
}

func runRemote(dir, command string) int {
	if k, _ := marker(dir, "kind"); k == Windows {
		if command == Bootstrap {
			return runPwsh(dir)
		}
		word, _, _ := strings.Cut(command, " ")
		if _, ok := marker(dir, "git-unix-tools"); ok && word == "uname" {
			fmt.Println("MINGW64_NT-10.0-19045")
			return 0
		}
		return fail(1, "'%s' is not recognized as an internal or external command,\noperable program or batch file.", word)
	}
	if command == "" {
		return fail(255, "testenv: interactive sessions are not supported")
	}
	cmd := exec.Command(filepath.Join(root(), "sys", "bash"), "-c", command)
	cmd.Dir = filepath.Join(dir, "home")
	cmd.Env = hostEnv(dir)
	cmd.Stdin, cmd.Stdout, cmd.Stderr = os.Stdin, os.Stdout, os.Stderr
	return exitCode(cmd.Run())
}

// pwshShims replace the Windows-only commands the snippets call.
const pwshShims = `function icacls { [IO.File]::AppendAllText((Join-Path $env:PASEO_TESTENV_HOSTDIR 'icacls.log'), ((@($args) | ForEach-Object { [string]$_ }) -join ' ') + "` + "`" + `n"); $global:LASTEXITCODE = 0 }
`

func runPwsh(dir string) int {
	pwsh := realTool(root(), "pwsh")
	if pwsh == "pwsh" {
		return fail(127, "testenv: pwsh is not installed")
	}
	script, err := io.ReadAll(os.Stdin)
	if err != nil {
		return fail(255, "testenv: %v", err)
	}
	cmd := exec.Command(pwsh, "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", "iex ([Console]::In.ReadToEnd())")
	cmd.Dir = filepath.Join(dir, "home")
	cmd.Env = hostEnv(dir)
	cmd.Stdin = strings.NewReader(pwshShims + string(script))
	cmd.Stdout, cmd.Stderr = os.Stdout, os.Stderr
	return exitCode(cmd.Run())
}

// forward serves -L by proxying to the fake app's DevTools listener for
// the remote port.
func forward(dir, spec string) int {
	parts := strings.Split(spec, ":")
	if len(parts) != 4 {
		return fail(255, "testenv: unsupported forward %q", spec)
	}
	ln, err := net.Listen("tcp", parts[0]+":"+parts[1])
	if err != nil {
		return fail(255, "bind [%s]:%s: Address already in use", parts[0], parts[1])
	}
	for {
		c, err := ln.Accept()
		if err != nil {
			return 255
		}
		go func() {
			defer func() { _ = c.Close() }()
			addr, err := appRequest(dir, http.MethodGet, "/devtools?port="+url.QueryEscape(parts[3]), nil)
			if err != nil {
				return
			}
			up, err := net.Dial("tcp", strings.TrimSpace(string(addr)))
			if err != nil {
				return
			}
			defer func() { _ = up.Close() }()
			go func() { _, _ = io.Copy(up, c) }()
			_, _ = io.Copy(c, up)
		}()
	}
}

func npmMain(args []string) int {
	if len(args) > 0 && (args[0] == "-v" || args[0] == "--version") {
		fmt.Println("10.9.0")
		return 0
	}
	var prefix, spec string
	for i := 0; i < len(args); i++ {
		switch {
		case args[i] == "--prefix" && i+1 < len(args):
			i++
			prefix = args[i]
		case strings.HasPrefix(args[i], "--prefix="):
			prefix = strings.TrimPrefix(args[i], "--prefix=")
		case strings.HasPrefix(args[i], "@getpaseo/cli@"):
			spec = args[i]
		}
	}
	if len(args) == 0 || args[0] != "install" || prefix == "" || spec == "" {
		return fail(1, "testenv npm: unsupported arguments %q", args)
	}
	version := strings.TrimPrefix(spec, "@getpaseo/cli@")
	nm := filepath.Join(prefix, "node_modules")
	exe, err := os.Executable()
	if err != nil {
		return fail(1, "%v", err)
	}
	files := map[string]string{
		"@getpaseo/cli/package.json":    fmt.Sprintf(`{"name":"@getpaseo/cli","version":%q,"bin":{"paseo":"bin/paseo"}}`, version),
		"@getpaseo/server/package.json": `{"name":"@getpaseo/server","type":"module","exports":{"./auth":"./auth.js","./configuration":"./configuration.js"}}`,
		"@getpaseo/server/auth.js": `import { createHash } from "node:crypto";
export async function hashDaemonPassword(p) { return "$2b$10$" + createHash("sha256").update(p).digest("hex"); }
`,
		"@getpaseo/server/configuration.js": `import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
export function readPersistedConfig(home) { try { return JSON.parse(readFileSync(join(home, "config.json"), "utf8")); } catch { return {}; } }
export function savePersistedConfig(home, c) { mkdirSync(home, { recursive: true }); writeFileSync(join(home, "config.json"), JSON.stringify(c, null, 2)); }
`,
	}
	for rel, content := range files {
		p := filepath.Join(nm, rel)
		if err := os.MkdirAll(filepath.Dir(p), 0o755); err != nil {
			return fail(1, "%v", err)
		}
		if err := os.WriteFile(p, []byte(content), 0o644); err != nil {
			return fail(1, "%v", err)
		}
	}
	for _, link := range []string{filepath.Join(nm, ".bin", "paseo"), filepath.Join(nm, "@getpaseo", "cli", "bin", "paseo")} {
		_ = os.MkdirAll(filepath.Dir(link), 0o755)
		_ = os.Remove(link)
		if err := os.Symlink(exe, link); err != nil {
			return fail(1, "%v", err)
		}
	}
	return 0
}

func stripFlags(args []string, flags ...string) ([]string, map[string]bool) {
	seen := map[string]bool{}
	var rest []string
	for _, a := range args {
		matched := false
		for _, f := range flags {
			if a == f {
				seen[f], matched = true, true
			}
		}
		if !matched {
			rest = append(rest, a)
		}
	}
	return rest, seen
}

func listenPort(home string) string {
	cfg := readJSON(filepath.Join(home, ".local", "share", "paseo", "state", "config.json"))
	d, _ := cfg["daemon"].(map[string]any)
	listen, _ := d["listen"].(string)
	_, port, _ := net.SplitHostPort(listen)
	return port
}

func systemctlMain(args []string) int {
	rest, flags := stripFlags(args, "--user", "-q", "--quiet", "--now", "--no-pager")
	if !flags["--user"] || len(rest) == 0 {
		return fail(1, "testenv systemctl: only --user is supported: %q", args)
	}
	dir := callerDir()
	home := os.Getenv("HOME")
	unit := "paseo.service"
	if len(rest) > 1 {
		unit = rest[1]
	}
	unitFile := filepath.Join(home, ".config", "systemd", "user", unit)
	_, statErr := os.Stat(unitFile)
	exists := statErr == nil
	quiet := flags["-q"] || flags["--quiet"]
	start := func() int {
		if !exists {
			return fail(5, "Failed to start %s: Unit %s not found.", unit, unit)
		}
		port := listenPort(home)
		if port == "" {
			return fail(1, "Job for %s failed because the control process exited with error code.", unit)
		}
		setMarker(dir, "systemd-active", port)
		return 0
	}
	switch rest[0] {
	case "daemon-reload", "reset-failed":
		return 0
	case "enable":
		if !exists {
			return fail(1, "Failed to enable unit: Unit file %s does not exist.", unit)
		}
		setMarker(dir, "systemd-enabled", "")
		if flags["--now"] {
			return start()
		}
		return 0
	case "disable":
		if !exists {
			return fail(1, "Failed to disable unit: Unit file %s does not exist.", unit)
		}
		_ = os.Remove(filepath.Join(dir, "systemd-enabled"))
		if flags["--now"] {
			_ = os.Remove(filepath.Join(dir, "systemd-active"))
		}
		return 0
	case "start", "restart":
		return start()
	case "stop":
		_ = os.Remove(filepath.Join(dir, "systemd-active"))
		return 0
	case "is-active":
		if activePort(dir) != "" {
			if !quiet {
				fmt.Println("active")
			}
			return 0
		}
		if !quiet {
			fmt.Println("inactive")
		}
		return 3
	case "is-enabled":
		if _, ok := marker(dir, "systemd-enabled"); ok {
			if !quiet {
				fmt.Println("enabled")
			}
			return 0
		}
		if !quiet {
			fmt.Println("disabled")
		}
		return 1
	case "status":
		if activePort(dir) == "" {
			fmt.Printf("○ %s\n     Active: inactive (dead)\n", unit)
			return 3
		}
		fmt.Printf("● %s\n     Active: active (running)\n", unit)
		return 0
	}
	return fail(1, "testenv systemctl: unsupported verb %q", rest[0])
}

func loginctlMain([]string) int {
	if _, ok := marker(callerDir(), "no-linger"); ok {
		fmt.Println("no")
		return 0
	}
	fmt.Println("yes")
	return 0
}

type serveHandler struct {
	Proxy string `json:"Proxy"`
}

type serveConfig struct {
	TCP map[string]struct {
		HTTPS bool `json:"HTTPS"`
	} `json:"TCP,omitempty"`
	Web map[string]struct {
		Handlers map[string]serveHandler `json:"Handlers"`
	} `json:"Web,omitempty"`
}

func readServe(dir string) serveConfig {
	var c serveConfig
	data, err := os.ReadFile(filepath.Join(dir, "serve.json"))
	if err == nil {
		_ = json.Unmarshal(data, &c)
	}
	return c
}

// serveRoute returns the proxy target of a host's Serve route on port.
func serveRoute(dir, port string) string {
	dns, _ := marker(dir, "dns")
	return readServe(dir).Web[dns+":"+port].Handlers["/"].Proxy
}

func tailscaleMain(args []string) int {
	dir := callerDir()
	dns, ok := marker(dir, "dns")
	if !ok {
		return fail(1, "failed to connect to local tailscaled")
	}
	rest, flags := stripFlags(args, "--json", "--bg", "--yes")
	if len(rest) == 1 && rest[0] == "status" && flags["--json"] {
		fmt.Printf(`{"Self":{"DNSName":%q,"Online":true}}`+"\n", dns+".")
		return 0
	}
	if len(rest) == 0 || rest[0] != "serve" {
		return fail(1, "testenv tailscale: unsupported %q", args)
	}
	rest = rest[1:]
	if len(rest) == 1 && rest[0] == "status" {
		data, err := os.ReadFile(filepath.Join(dir, "serve.json"))
		if err != nil {
			data = []byte("{}")
		}
		fmt.Println(string(data))
		return 0
	}
	var port, target string
	for _, a := range rest {
		if strings.HasPrefix(a, "--https=") {
			port = strings.TrimPrefix(a, "--https=")
		} else {
			target = a
		}
	}
	if port == "" || target == "" {
		return fail(1, "testenv tailscale: unsupported %q", args)
	}
	c := readServe(dir)
	key := dns + ":" + port
	if target == "off" {
		if _, ok := c.Web[key]; !ok {
			return fail(1, "error: failed to remove web serve: handler does not exist")
		}
		delete(c.Web, key)
		delete(c.TCP, port)
	} else {
		if c.TCP == nil {
			c.TCP = map[string]struct {
				HTTPS bool `json:"HTTPS"`
			}{}
			c.Web = map[string]struct {
				Handlers map[string]serveHandler `json:"Handlers"`
			}{}
		}
		c.TCP[port] = struct {
			HTTPS bool `json:"HTTPS"`
		}{true}
		c.Web[key] = struct {
			Handlers map[string]serveHandler `json:"Handlers"`
		}{map[string]serveHandler{"/": {Proxy: target}}}
	}
	data, _ := json.Marshal(c)
	if len(c.Web) == 0 {
		data = []byte("{}")
	}
	setMarker(dir, "serve.json", string(data))
	return 0
}

func curlMain(args []string) int {
	var raw string
	for _, a := range args {
		if strings.Contains(a, "://") {
			raw = a
		}
	}
	u, err := url.Parse(raw)
	if err != nil || raw == "" {
		return fail(3, "curl: (3) URL rejected: Malformed input to a URL function")
	}
	port := u.Port()
	ok := false
	switch {
	case u.Hostname() == "127.0.0.1" || u.Hostname() == "localhost":
		ok = callerDir() != "" && port == activePort(callerDir())
	case u.Scheme == "https":
		if dir, found := hostDir(u.Hostname()); found {
			_, proxyPort, _ := net.SplitHostPort(strings.TrimPrefix(serveRoute(dir, port), "http://"))
			ok = proxyPort != "" && proxyPort == activePort(dir)
		}
	}
	if !ok {
		return fail(7, "curl: (7) Failed to connect to %s port %s: Connection refused", u.Hostname(), port)
	}
	fmt.Println(`{"status":"ok"}`)
	return 0
}

var portRE = regexp.MustCompile(`:(\d+)`)

func ssMain(args []string) int {
	fmt.Println("State  Recv-Q Send-Q Local Address:Port Peer Address:Port Process")
	if len(args) == 0 {
		return 0
	}
	m := portRE.FindStringSubmatch(args[len(args)-1])
	if m == nil {
		return 0
	}
	dir := callerDir()
	busy, _ := marker(dir, "busy-port")
	if m[1] == activePort(dir) || m[1] == busy {
		fmt.Printf("LISTEN 0      511    127.0.0.1:%s 0.0.0.0:*\n", m[1])
	}
	return 0
}

func readJSON(path string) map[string]any {
	data, err := os.ReadFile(path)
	m := map[string]any{}
	if err == nil {
		_ = json.Unmarshal(data, &m)
	}
	return m
}

func paseoMain(args []string) int {
	var home, host string
	var rest []string
	for i := 0; i < len(args); i++ {
		switch {
		case args[i] == "--home" && i+1 < len(args):
			i++
			home = args[i]
		case args[i] == "--host" && i+1 < len(args):
			i++
			host = args[i]
		default:
			rest = append(rest, args[i])
		}
	}
	rest, flags := stripFlags(rest, "--json", "-q")
	switch {
	case len(rest) == 5 && rest[0] == "daemon" && rest[1] == "config" && rest[2] == "set" && home != "":
		return configSet(home, rest[3], rest[4])
	case len(rest) == 1 && rest[0] == "ls" && host != "":
		dir, code := daemonAuth(host)
		if code != 0 {
			return code
		}
		_ = dir
		if !flags["-q"] {
			fmt.Println("No agents")
		}
		return 0
	case len(rest) == 2 && rest[0] == "daemon" && rest[1] == "status" && host != "":
		dir, code := daemonAuth(host)
		if code != 0 {
			return code
		}
		fmt.Printf(`{"serverId":"srv_%s","status":"running"}`+"\n", filepath.Base(dir))
		return 0
	}
	return fail(1, "testenv paseo: unsupported arguments %q", args)
}

func configSet(home, key, raw string) int {
	path := filepath.Join(home, "config.json")
	cfg := readJSON(path)
	var v any
	if json.Unmarshal([]byte(raw), &v) != nil {
		v = raw
	}
	node := cfg
	parts := strings.Split(key, ".")
	for _, p := range parts[:len(parts)-1] {
		next, ok := node[p].(map[string]any)
		if !ok {
			next = map[string]any{}
			node[p] = next
		}
		node = next
	}
	node[parts[len(parts)-1]] = v
	data, _ := json.MarshalIndent(cfg, "", "  ")
	if err := os.MkdirAll(home, 0o700); err != nil {
		return fail(1, "%v", err)
	}
	if err := os.WriteFile(path, data, 0o600); err != nil {
		return fail(1, "%v", err)
	}
	return 0
}

// daemonAuth connects to the daemon a Paseo URL names and checks the
// password the way the real daemon does.
func daemonAuth(raw string) (string, int) {
	u, err := url.Parse(raw)
	if err != nil {
		return "", fail(1, "Error: invalid host %q", raw)
	}
	var dir, port string
	switch u.Scheme {
	case "ssh":
		d, ok := hostDir(u.Host)
		if _, down := marker(d, "unreachable"); !ok || down {
			return "", fail(1, "Error: ssh: connect to host %s port 22: Connection refused", u.Host)
		}
		dir, port = d, u.Query().Get("daemonPort")
		if port == "" {
			port = "6767"
		}
	case "wss":
		d, ok := hostDir(u.Hostname())
		if !ok {
			return "", fail(1, "Error: getaddrinfo ENOTFOUND %s", u.Hostname())
		}
		_, p, _ := net.SplitHostPort(strings.TrimPrefix(serveRoute(d, u.Port()), "http://"))
		dir, port = d, p
	default:
		return "", fail(1, "Error: unsupported host %q", raw)
	}
	if port == "" || port != activePort(dir) {
		return "", fail(1, "Error: connect ECONNREFUSED 127.0.0.1:%s", port)
	}
	if n, ok := marker(dir, "daemon-503"); ok {
		if c, _ := strconv.Atoi(n); c > 0 {
			setMarker(dir, "daemon-503", strconv.Itoa(c-1))
			return "", fail(1, "Error: Unexpected server response: 503")
		}
	}
	if _, ok := marker(dir, "daemon-accepts-anyone"); ok {
		return dir, 0
	}
	pw := os.Getenv("PASEO_PASSWORD")
	if pw == "" {
		return "", fail(1, "Error: Password required")
	}
	cfg := readJSON(filepath.Join(dir, "home", ".local", "share", "paseo", "state", "config.json"))
	d, _ := cfg["daemon"].(map[string]any)
	a, _ := d["auth"].(map[string]any)
	if hash, _ := a["password"].(string); hash != FakeHash(pw) {
		return "", fail(1, "Error: Invalid password")
	}
	return dir, 0
}

func unameMain(args []string) int {
	for _, a := range args {
		if a == "-m" {
			fmt.Println("arm64")
			return 0
		}
	}
	fmt.Println("Darwin")
	return 0
}

// appRequest calls the fake desktop app's control endpoint on the caller's
// host or on dir.
func appRequest(dir, method, path string, body any) ([]byte, error) {
	addr, ok := marker(dir, "app.addr")
	if !ok {
		return nil, errors.New("no app")
	}
	var r io.Reader
	if body != nil {
		data, err := json.Marshal(body)
		if err != nil {
			return nil, err
		}
		r = bytes.NewReader(data)
	}
	req, err := http.NewRequest(method, "http://"+addr+path, r)
	if err != nil {
		return nil, err
	}
	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer func() { _ = resp.Body.Close() }()
	data, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}
	if resp.StatusCode != http.StatusOK {
		return data, fmt.Errorf("%s", strings.TrimSpace(string(data)))
	}
	return data, nil
}

func openMain(args []string) int {
	var app string
	var appArgs []string
	for i := 0; i < len(args); i++ {
		switch {
		case args[i] == "-a" && i+1 < len(args):
			i++
			app = args[i]
		case args[i] == "--args":
			appArgs = args[i+1:]
			i = len(args)
		}
	}
	if _, err := os.Stat(app); err != nil {
		return fail(1, "Unable to find application named '%s'", app)
	}
	if _, err := appRequest(callerDir(), http.MethodPost, "/launch", appArgs); err != nil {
		return fail(1, "LSOpenURLsWithRole() failed: %v", err)
	}
	return 0
}

func osascriptMain(args []string) int {
	script := strings.Join(args, " ")
	if !strings.Contains(script, `"sh.paseo.desktop"`) || !strings.Contains(script, "to quit") {
		return fail(1, "testenv osascript: unsupported script %q", script)
	}
	if _, err := appRequest(callerDir(), http.MethodPost, "/quit", nil); err != nil {
		return fail(1, "execution error: %v", err)
	}
	return 0
}

// Proc is one process the fake app reports to pgrep.
type Proc struct {
	PID int    `json:"pid"`
	Cmd string `json:"cmd"`
}

func matchProcs(args []string) ([]Proc, string, int) {
	var pattern, sig string
	for i := 0; i < len(args); i++ {
		switch a := args[i]; {
		case a == "--" && i+1 < len(args):
			pattern = args[i+1]
			i = len(args)
		case a == "-f" || a == "-fl":
		case strings.HasPrefix(a, "-") && i+1 < len(args):
			sig = strings.TrimPrefix(a, "-")
		default:
			pattern = a
		}
	}
	re, err := regexp.Compile(pattern)
	if err != nil {
		return nil, "", fail(2, "pgrep: invalid pattern %q", pattern)
	}
	data, err := appRequest(callerDir(), http.MethodGet, "/ps", nil)
	if err != nil {
		return nil, sig, 1
	}
	var all, matched []Proc
	if err := json.Unmarshal(data, &all); err != nil {
		return nil, sig, fail(3, "%v", err)
	}
	for _, p := range all {
		if re.MatchString(p.Cmd) {
			matched = append(matched, p)
		}
	}
	if len(matched) == 0 {
		return nil, sig, 1
	}
	return matched, sig, 0
}

func pgrepMain(args []string) int {
	procs, _, code := matchProcs(args)
	for _, p := range procs {
		fmt.Println(p.PID)
	}
	return code
}

func pkillMain(args []string) int {
	procs, sig, code := matchProcs(args)
	if code != 0 {
		return code
	}
	if sig == "" {
		sig = "TERM"
	}
	for _, p := range procs {
		if _, err := appRequest(callerDir(), http.MethodPost, "/signal", map[string]any{"pid": p.PID, "signal": sig}); err != nil {
			return fail(1, "pkill: %v", err)
		}
	}
	return 0
}
