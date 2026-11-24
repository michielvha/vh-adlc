package doc

import (
	"errors"
	"path"
	"regexp"
	"strings"
	"unicode/utf8"
)

// MatchCovers reports whether the repository-relative path p is covered. An
// entry ending in / covers its subtree, an entry with ** follows the
// docs-impact coverage matcher (plugins/vh-adlc/scripts/docs-impact/matching.ts),
// any other entry with *, ? or [ is a path.Match pattern, and any other entry
// covers that exact path.
func MatchCovers(covers []string, p string) bool {
	for _, c := range covers {
		switch {
		case strings.Contains(c, "**"):
			if re, directory, err := compileDoubleStar(c); err == nil {
				if directory && re.MatchString(p+"/") || !directory && re.MatchString(p) {
					return true
				}
			}
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

var errCoverage = errors.New("invalid coverage pattern")

// compileDoubleStar turns a covers entry containing ** into an anchored
// expression with the docs-impact meaning: ** followed by / at the start of a
// segment matches zero or more directories, any other ** matches across
// separators, * and ? stay within a segment, and [...] is a class that never
// matches /. An entry ending in / matches any directory prefix of the path.
func compileDoubleStar(pattern string) (*regexp.Regexp, bool, error) {
	for strings.HasPrefix(pattern, "./") {
		pattern = pattern[2:]
	}
	if pattern == "" || strings.HasPrefix(pattern, "/") || strings.Contains(pattern, "\x00") || strings.Contains(pattern, "//") || !utf8.ValidString(pattern) {
		return nil, false, errCoverage
	}
	for _, segment := range strings.Split(pattern, "/") {
		if segment == ".." {
			return nil, false, errCoverage
		}
	}
	chars := []rune(pattern)
	var b strings.Builder
	// (?s): Git paths may contain newlines, and ** and * must match them as the docs-impact matcher does.
	b.WriteString("(?s)^")
	for at := 0; at < len(chars); {
		char := chars[at]
		at++
		switch char {
		case '\\':
			if at == len(chars) {
				return nil, false, errCoverage
			}
			b.WriteString(regexp.QuoteMeta(string(chars[at])))
			at++
		case '*':
			start := at - 1
			for at < len(chars) && chars[at] == '*' {
				at++
			}
			separators := at-start >= 2
			switch {
			case separators && (start == 0 || chars[start-1] == '/') && at < len(chars) && chars[at] == '/':
				b.WriteString("(?:.*/)?")
				at++
			case separators:
				b.WriteString(".*")
			default:
				b.WriteString("[^/]*")
			}
		case '?':
			b.WriteString("[^/]")
		case '[':
			class, next, err := coverageClass(chars, at)
			if err != nil {
				return nil, false, err
			}
			b.WriteString(class)
			at = next
		default:
			b.WriteString(regexp.QuoteMeta(string(char)))
		}
	}
	directory := strings.HasSuffix(pattern, "/")
	if !directory {
		b.WriteString("$")
	}
	re, err := regexp.Compile(b.String())
	if err != nil {
		return nil, false, errCoverage
	}
	return re, directory, nil
}

// coverageClass reads a [...] class starting after the [, as the docs-impact
// matcher does: reversed ranges are empty, and no class matches /.
func coverageClass(chars []rune, at int) (string, int, error) {
	negated := at < len(chars) && chars[at] == '^'
	if negated {
		at++
	}
	read := func() (rune, error) {
		if at >= len(chars) || chars[at] == '-' || chars[at] == ']' {
			return 0, errCoverage
		}
		if chars[at] == '\\' {
			at++
			if at >= len(chars) {
				return 0, errCoverage
			}
		}
		r := chars[at]
		at++
		return r, nil
	}
	var ranges [][2]rune
	for {
		if at < len(chars) && chars[at] == ']' && len(ranges) > 0 {
			at++
			break
		}
		low, err := read()
		if err != nil {
			return "", 0, err
		}
		high := low
		if at < len(chars) && chars[at] == '-' {
			at++
			if high, err = read(); err != nil {
				return "", 0, err
			}
		}
		ranges = append(ranges, [2]rune{low, high})
		if at >= len(chars) {
			return "", 0, errCoverage
		}
	}
	var body strings.Builder
	for _, r := range ranges {
		if r[0] > r[1] {
			continue
		}
		body.WriteString(classRange(r[0], r[1]))
	}
	switch {
	case negated:
		return "[^/" + body.String() + "]", at, nil
	case body.Len() == 0:
		return `[^\x00-\x{10FFFF}]`, at, nil
	default:
		return "(?:[" + body.String() + "])", at, nil
	}
}

// classRange writes low..high for a character class, leaving out /.
func classRange(low, high rune) string {
	quote := func(r rune) string { return regexp.QuoteMeta(string(r)) }
	esc := func(r rune) string {
		if s := quote(r); s != string(r) || r == '-' || r == ']' || r == '^' {
			return `\` + string(r)
		}
		return string(r)
	}
	part := func(a, b rune) string {
		if a > b {
			return ""
		}
		if a == b {
			return esc(a)
		}
		return esc(a) + "-" + esc(b)
	}
	if low <= '/' && '/' <= high {
		return part(low, '/'-1) + part('/'+1, high)
	}
	return part(low, high)
}
