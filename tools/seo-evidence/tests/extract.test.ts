import { expect, test } from "bun:test";
import { extract } from "../src/extract";
import { resolveFragment, identity } from "../src/url";
import { captured } from "./helpers/bundle";

const parse = (html: string, headers: Record<string, string[]> = {}, selector = "main") => extract(html, { ...captured(), headers }, selector);
test("HTML extraction keeps multiplicity, main content and syntax evidence", () => {
  const f = parse(`<html lang="en"><head><title> A  title </title><title>Other</title><meta name="description" content="Useful"><script type="application/ld+json">{"@type":"Article"}</script></head><body><nav>Shared shell</nav><main><h1> A heading </h1><script>ignore()</script><style>p{}</style><template>Ignore me</template><p>Body text</p><a href="/child#x">Child</a></main></body></html>`);
  expect(f.titles).toEqual(["A title", "Other"]); expect(f.language).toBe("en");
  expect(f.h1).toEqual(["A heading"]); expect(f.jsonld).toMatchObject({ count: 1, valid: true });
  expect(f.main_hash).not.toBeNull(); expect(f.anchors[0]).toMatchObject({ target: "https://example.test/child", fragment: "x", main: true });
  expect(parse("<main>A</main><main>B</main>").main_reason).toBe("multiple_roots");
  expect(parse("<div>Body</div>").main_reason).toBe("missing_root");
  expect(parse('<script type="application/ld+json">bad</script>').jsonld.valid).toBe(false);
});
test("the first base element controls resolution, including fallback", () => {
  for (const [bases, expected] of [
    ['<base href="/first/"><base href="/later/">', "https://example.test/first/child"],
    ['<base href="http://["><base href="/later/">', "https://example.test/child"],
    ['<base href="data:text/html,x"><base href="/later/">', "https://example.test/child"],
    ['<base href="javascript:go()"><base href="/later/">', "https://example.test/child"],
    ['<base href="mailto:x@example.test"><base href="/later/">', null],
    ['<base href=""><base href="/later/">', "https://example.test/child"],
  ] as const) expect(parse(`<head>${bases}</head><main><a href="child">child</a></main>`).anchors[0]?.target).toBe(expected);
});
test("fragments include raw, decoded, named and document-top targets", () => {
  const f = parse('<main><p id="a%20b"></p><p id="a b"></p><a name="old"></a></main>');
  for (const fragment of ["", "top", "TOP", "a%20b", "old"]) expect(resolveFragment(f, fragment)).toBe("valid");
  expect(resolveFragment(f, "missing")).toBe("missing");
  expect(resolveFragment(f, ":~:text=hello")).toBe("unverified");
  expect(resolveFragment(f, "%FF")).toBe("unverified");
});
test("URL identity preserves path, query ordering, repeated keys and encoded distinctions", () => {
  const urls = ["https://example.test/A", "https://example.test/a", "https://example.test/a/", "https://example.test/%61", "https://example.test/?x=1&y=2", "https://example.test/?y=2&x=1", "https://example.test/?x=1&x=2"];
  expect(new Set(urls.map(identity)).size).toBe(urls.length);
  expect(identity("https://EXAMPLE.test:443/a#part")).toBe("https://example.test/a");
});
test("generic controls combine negative rules without importing crawler scope", () => {
  const f = parse('<meta name="robots" content="index"><meta name="googlebot" content="noindex">', { "X-Robots-Tag": ["googlebot: noindex, nofollow", "max-snippet: 50, noindex"] });
  expect(f.controls.generic_blocked).toBe(true);
  expect(parse('', { "X-Robots-Tag": ["googlebot: noindex, nofollow"] }).controls.generic_blocked).toBe(false);
  for (const value of ["none", "noindex", "index, noindex"]) expect(parse(`<meta name="robots" content="${value}">`).controls.generic_blocked).toBe(true);
  expect(parse('', { "X-Robots-Tag": ["index", "NOINDEX"] }).controls.generic_blocked).toBe(true);
  expect(parse('', { "X-Robots-Tag": ["unknown-directive"] }).controls.generic_blocked).toBeNull();
});
test("HTML and HTTP canonicals agree or remain unavailable without source selection", () => {
  const html = '<head><link rel="canonical" href="/target"></head>';
  expect(parse(html, { Link: ['</target>; rel="canonical"; title="a,b", </x>; rel="next"'] }).controls).toMatchObject({ canonical_state: "valid", canonical: "https://example.test/target" });
  expect(parse(html, { Link: ['</other>; rel="canonical"'] }).controls.canonical_state).toBe("unavailable");
  expect(parse('', { Link: ['<https://example.test/path?a=1,2>; rel="canonical"'] }).controls.canonical).toBe("https://example.test/path?a=1,2");
  expect(parse('', { Link: ['broken; rel="canonical"'] }).controls.canonical_state).toBe("unavailable");
  expect(parse("").controls.canonical_state).toBe("absent");
});
test("HTTP canonical parameters require each separator while valid quoted syntax remains supported", () => {
  for (const value of ['</new> rel="canonical"', '</new>;; rel="canonical"', '</new>; rel="canonical";', '</new>; rel="canonical" title="missing separator"', '</bad path>; rel="canonical"', '</bad%XX>; rel="canonical"']) {
    const f = parse("", { Link: [value] });
    expect(f.controls.canonical_state).toBe("unavailable");
    expect(f.controls.issues.some(i => i.rule === "canonical_syntax")).toBe(true);
  }
  expect(parse("", { Link: ['</new>; rel="canonical"; title="a; b, c"'] }).controls.canonical_state).toBe("valid");
  expect(parse("", { Link: ['</new>; rel="next"; rel="canonical"'] }).controls.canonical_state).toBe("absent");
});
test("missing canonical href is unavailable while explicit empty href retains its URL meaning", () => {
  expect(parse('<head><link rel="canonical"></head>').controls).toMatchObject({ canonical_state: "unavailable", canonical: null });
  expect(parse('<head><link rel="canonical" href=""></head>').controls).toMatchObject({ canonical_state: "valid", canonical: "https://example.test/" });
});
test("HTTP Link anchor applies its context before contributing a document canonical", () => {
  for (const anchor of ["/unrelated", "#part"]) {
    const header = `</new>; rel="canonical"; anchor="${anchor}"`;
    expect(parse("", { Link: [header] }).controls.canonical_state).toBe("absent");
    expect(parse('<head><link rel="canonical" href="/old"></head>', { Link: [header] }).controls).toMatchObject({ canonical_state: "valid", canonical: "https://example.test/old" });
  }
  for (const anchor of ["/", "https://example.test/", ""]) expect(parse("", { Link: [`</new>; rel="canonical"; anchor="${anchor}"`] }).controls.canonical).toBe("https://example.test/new");
  for (const suffix of ['anchor="http://["', 'anchor="/"; anchor="/other"']) expect(parse("", { Link: [`</new>; rel="canonical"; ${suffix}`] }).controls.canonical_state).toBe("unavailable");
});
