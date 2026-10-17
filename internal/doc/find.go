package doc

import (
	"errors"
	"io/fs"
	"os"
	"path/filepath"
	"strings"

	"go.yaml.in/yaml/v3"
)

// Find returns the feature documents under featureRoot whose frontmatter
// issue names the issue number, or whose file name up to its first dot is
// the slug. Paths are relative to root, with forward slashes, in lexical
// order.
func Find(root, featureRoot, issue, slug string) ([]string, error) {
	found := []string{}
	dir := filepath.Join(root, filepath.FromSlash(featureRoot))
	err := filepath.WalkDir(dir, func(path string, e fs.DirEntry, err error) error {
		if err != nil {
			if errors.Is(err, fs.ErrNotExist) && path == dir {
				return filepath.SkipDir
			}
			return err
		}
		if e.IsDir() || !strings.HasSuffix(e.Name(), ".md") {
			return nil
		}
		raw, err := os.ReadFile(path)
		if err != nil {
			return err
		}
		fields, ok := frontmatter(raw)
		if !ok {
			return nil
		}
		match := false
		if issue != "" {
			v, _ := fields["issue"].(string)
			match = strings.HasSuffix(v, "/issues/"+issue) || v == "#"+issue
		}
		if slug != "" {
			name, _, _ := strings.Cut(e.Name(), ".")
			match = name == slug
		}
		if match {
			rel, err := filepath.Rel(root, path)
			if err != nil {
				return err
			}
			found = append(found, filepath.ToSlash(rel))
		}
		return nil
	})
	return found, err
}

func frontmatter(raw []byte) (map[string]any, bool) {
	text := strings.ReplaceAll(string(raw), "\r\n", "\n")
	rest, ok := strings.CutPrefix(text, "---\n")
	if !ok {
		return nil, false
	}
	block, _, ok := strings.Cut(rest, "\n---\n")
	if !ok {
		block, ok = strings.CutSuffix(rest, "\n---")
		if !ok {
			return nil, false
		}
	}
	var fields map[string]any
	if err := yaml.Unmarshal([]byte(block), &fields); err != nil || fields == nil {
		return nil, false
	}
	return fields, true
}
