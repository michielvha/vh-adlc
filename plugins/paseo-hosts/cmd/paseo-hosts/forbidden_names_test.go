package main

import (
	"io/fs"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// TestNoForbiddenNames searches the plugin's files for the comma-separated
// names in PASEO_HOSTS_FORBIDDEN_NAMES, such as the operator host's machine,
// user and tailnet names.
func TestNoForbiddenNames(t *testing.T) {
	var names []string
	for _, n := range strings.Split(os.Getenv("PASEO_HOSTS_FORBIDDEN_NAMES"), ",") {
		if n = strings.ToLower(strings.TrimSpace(n)); n != "" {
			names = append(names, n)
		}
	}
	if len(names) == 0 {
		t.Skip("PASEO_HOSTS_FORBIDDEN_NAMES is not set")
	}
	root := filepath.Join("..", "..")
	err := filepath.WalkDir(root, func(path string, d fs.DirEntry, err error) error {
		if err != nil || !d.Type().IsRegular() {
			return err
		}
		data, err := os.ReadFile(path)
		if err != nil {
			return err
		}
		content := strings.ToLower(path + "\n" + string(data))
		for _, n := range names {
			if strings.Contains(content, n) {
				t.Errorf("%s contains %q", path, n)
			}
		}
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
}
