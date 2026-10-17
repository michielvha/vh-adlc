package doc

import (
	"path"
	"strings"
)

// MatchCovers reports whether the repository-relative path p is covered. An
// entry ending in / covers its subtree, an entry with *, ? or [ is a
// path.Match pattern, and any other entry covers that exact path.
func MatchCovers(covers []string, p string) bool {
	for _, c := range covers {
		switch {
		case strings.Contains(c, "**"):
			continue
		case strings.HasSuffix(c, "/"):
			if strings.HasPrefix(p, c) {
				return true
			}
		case strings.ContainsAny(c, "*?["):
			if ok, err := path.Match(c, p); err == nil && ok {
				return true
			}
		case c == p:
			return true
		}
	}
	return false
}
