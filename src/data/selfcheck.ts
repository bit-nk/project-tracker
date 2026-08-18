/**
 * Runnable check for the frontend's remaining non-trivial pure logic: the URL
 * safety helpers (the XSS guard for user-entered links). Run: `npm run check:data`.
 * The data-layer logic now lives in the backend and is covered by its own checks.
 */
import { safeHref, safeMailto } from "@/lib/url";

let passed = 0;
const failures: string[] = [];
function assert(cond: boolean, msg: string) {
  if (cond) passed++;
  else failures.push(msg);
}

assert(safeHref("https://example.com/doc") === "https://example.com/doc", "https passes");
assert(safeHref("http://example.com") === "http://example.com/", "http passes");
assert(safeHref("example.com/doc") === "https://example.com/doc", "bare host upgraded to https");
// eslint-disable-next-line no-script-url
assert(safeHref("javascript:alert(1)") === undefined, "javascript: scheme rejected");
assert(safeHref("data:text/html,<script>x</script>") === undefined, "data: scheme rejected");
assert(safeHref("vbscript:x") === undefined, "vbscript: scheme rejected");
assert(safeHref(" JAVASCRIPT:alert(1)") === undefined, "case/whitespace tricks rejected");
assert(safeHref("") === undefined && safeHref(undefined) === undefined, "empty rejected");
assert(safeMailto("a@b.co") === "mailto:a@b.co", "plain email passes");
assert(safeMailto("a@b.co?cc=evil@x.com") === undefined, "mailto header injection rejected");
assert(safeMailto("not-an-email") === undefined, "non-email rejected");

if (failures.length) {
  console.error(`\n❌ url-safety check: ${failures.length} failure(s):`);
  for (const f of failures) console.error("  - " + f);
  process.exit(1);
} else {
  console.log(`✅ url-safety check passed (${passed} assertions)`);
}
