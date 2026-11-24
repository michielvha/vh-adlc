// Package snippets_test checks every embedded PowerShell snippet for syntax
// that PowerShell 7 accepts and Windows PowerShell 5.1 rejects or
// mishandles.
package snippets_test

import (
	"io/fs"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"testing"
)

var banned = []struct {
	name string
	re   *regexp.Regexp
}{
	{"&&", regexp.MustCompile(`&&`)},
	{"||", regexp.MustCompile(`\|\|`)},
	{"??", regexp.MustCompile(`\?\?`)},
	{"?.", regexp.MustCompile(`\?\.`)},
	{"ternary", regexp.MustCompile(`\s\?\s[^:]*\s:\s`)},
	{"redirection", regexp.MustCompile(`(^|[\s)])\d?>>?`)},
	{"Out-File", regexp.MustCompile(`(?i)\bOut-File\b`)},
	{"Set-Content", regexp.MustCompile(`(?i)\bSet-Content\b`)},
	{"Add-Content", regexp.MustCompile(`(?i)\bAdd-Content\b`)},
}

var (
	singleQuoted = regexp.MustCompile(`'[^']*'`)
	doubleQuoted = regexp.MustCompile("\"(?:`.|[^\"`])*\"")
)

// violations returns the banned constructs in a script, ignoring comments
// and string literals.
func violations(script string) []string {
	var found []string
	for i, line := range strings.Split(script, "\n") {
		line = singleQuoted.ReplaceAllString(line, "''")
		line = doubleQuoted.ReplaceAllString(line, `""`)
		if c := strings.Index(line, "#"); c >= 0 {
			line = line[:c]
		}
		for _, b := range banned {
			if b.re.MatchString(line) {
				found = append(found, b.name+" on line "+strconv.Itoa(i+1))
			}
		}
	}
	return found
}

func TestDetectsEachBannedConstruct(t *testing.T) {
	for line, want := range map[string]string{
		"a && b":                      "&&",
		"a || b":                      "||",
		"$x = $a ?? 'b'":              "??",
		"$x = $a?.Name":               "?.",
		"$x = $ok ? 'a' : 'b'":        "ternary",
		"Get-Thing > $path":           "redirection",
		"Get-Thing 2>> $path":         "redirection",
		"$x | Out-File $p":            "Out-File",
		"Set-Content -Path $p -Value": "Set-Content",
		"add-content $p 'x'":          "Add-Content",
	} {
		v := violations(line)
		if len(v) == 0 || !strings.HasPrefix(v[0], want) {
			t.Errorf("%q: got %v, want %s", line, v, want)
		}
	}
	if v := violations(`if ($a -gt 1) { Write-Output 'a > b && c' } # x > y`); len(v) != 0 {
		t.Errorf("strings and comments flagged: %v", v)
	}
}

func TestPowerShellSnippetsUseWindowsPowerShell51Syntax(t *testing.T) {
	var scripts []string
	err := filepath.WalkDir("..", func(p string, d fs.DirEntry, err error) error {
		if err == nil && !d.IsDir() && strings.HasSuffix(p, ".ps1") {
			scripts = append(scripts, p)
		}
		return err
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(scripts) == 0 {
		t.Fatal("no .ps1 snippets found under internal/")
	}
	for _, p := range scripts {
		data, err := os.ReadFile(p)
		if err != nil {
			t.Fatal(err)
		}
		for _, v := range violations(string(data)) {
			t.Errorf("%s: %s", p, v)
		}
	}
}
