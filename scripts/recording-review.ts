/** Review overlays are applied to response copies. Committed recordings remain unaltered. */
type Json = Record<string, unknown>;
const object = (value: unknown): Json => value && typeof value === "object" && !Array.isArray(value) ? value as Json : {};
export function reviewedRecording(service: string, name: string, original: Json): Json {
  const doc = structuredClone(original);
  if (service === "wealth") {
    const result = object(doc.result);
    const update = object(result.update);
    const claims = Array.isArray(update.claims) ? update.claims as Json[] : [];
    let changed = false;
    for (const claim of claims) {
      if (String(claim.text).includes("forward P/E is 11.5x") && String(claim.text).includes("24.1% discount")) {
        claim.original_verdict = { status: claim.status, reason: claim.reason };
        claim.status = "unverified";
        claim.check = "subsequent_review";
        claim.reason = "Review correction: this mixes forward P/E with a trailing peer median. The 24.1% discount belongs to trailing P/E (13.92x vs 18.35x).";
        changed = true;
      }
    }
    if (changed) {
      update.counts = { ...object(update.counts), verified: claims.filter(c => c.status === "verified").length, unverified: claims.filter(c => c.status === "unverified").length };
      result.review = "Review correction · The original verifier accepted a mixed-basis valuation claim. It is excluded below. The valid trailing comparison is 13.92x / 18.35x − 1 = −24.1%. The displayed forward values (11.5x vs 18.4x) imply 37.5%, but compare different earnings periods. Original event history is preserved.";
    }
  }
  if (service === "interbank" && name === "trd-847-allowed") {
    doc.review = "Review correction · The recorded report incorrectly labels Bank A’s active SSI as v3 effective 2024-03-01. The retrieved records show active v2; the unprocessed SSI-CHG-2209 change is v3, effective 2026-10-01. Bank B expects v3. The version mismatch and proposed human-approved remediation remain the supported conclusion. The original report and events are preserved below.";
  }
  return doc;
}
