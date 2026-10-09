import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (path) => readFileSync(join(root, path), "utf8");
const manifest = JSON.parse(read("fixtures/manifest.json"));
const SHELL_OWNED = new Set(manifest.fixtures.filter((entry) => entry.owner === "shell").map((entry) => entry.path));
const TEST_PAN = "4111111111111111";

const walk = (dir) => readdirSync(join(root, dir)).flatMap((name) => {
  const path = `${dir}/${name}`;
  return statSync(join(root, path)).isDirectory() ? walk(path) : [path];
});

const marked = (value) => {
  if (Array.isArray(value)) return value.length > 0 && value.every(marked);
  if (!value || typeof value !== "object") return false;
  return value.synthetic === true || value.fictional === true || /synthetic|fictional/i.test(String(value._about ?? ""));
};

const luhn = (digits) => {
  let sum = 0;
  for (let i = 0; i < digits.length; i += 1) {
    let d = Number(digits[digits.length - 1 - i]);
    if (i % 2) d = d * 2 > 9 ? d * 2 - 9 : d * 2;
    sum += d;
  }
  return sum % 10 === 0;
};

/** Field values whose key names a card number, at any depth. */
const cardFields = (value, out = []) => {
  if (Array.isArray(value)) value.forEach((item) => cardFields(item, out));
  else if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      if (/card|(^|_)pan(_|$)/i.test(key) && typeof item === "string") out.push([key, item]);
      cardFields(item, out);
    }
  }
  return out;
};

const present = manifest.fixtures.filter((entry) => existsSync(join(root, entry.path)));

test("manifest entries are complete and marked synthetic", () => {
  assert.equal(manifest.synthetic, true);
  assert.ok(manifest.fixtures.length >= 10);
  const paths = new Set();
  for (const entry of manifest.fixtures) {
    assert.ok(entry.path && entry.description && entry.owner, `${entry.path} needs path, description, and owner`);
    assert.ok(Array.isArray(entry.demos) && entry.demos.length, `${entry.path} lists its demos`);
    assert.equal(entry.synthetic, true, `${entry.path} is synthetic`);
    assert.ok(!paths.has(entry.path), `${entry.path} is listed once`);
    paths.add(entry.path);
  }
});

test("every shell-owned fixture exists", () => {
  for (const path of SHELL_OWNED) assert.ok(existsSync(join(root, path)), `${path} exists`);
});

for (const entry of manifest.fixtures.filter((item) => !SHELL_OWNED.has(item.path))) {
  test(`${entry.owner} fixture ${entry.path}`, (t) => {
    if (!existsSync(join(root, entry.path))) {
      t.skip(`not written yet by the ${entry.owner} workstream`);
      return;
    }
    assert.ok(marked(JSON.parse(read(entry.path))), `${entry.path} is marked synthetic or fictional`);
  });
}

test("every file under fixtures/ is in the manifest", () => {
  const listed = new Set(manifest.fixtures.map((entry) => entry.path));
  const missing = walk("fixtures").filter((path) => path !== "fixtures/manifest.json" && !listed.has(path));
  assert.deepEqual(missing, [], "add these to fixtures/manifest.json");
});

test("every present fixture parses and is labelled synthetic", () => {
  for (const { path } of present) {
    const text = read(path);
    if (path.endsWith(".html")) {
      assert.match(text, /SYNTHETIC/, `${path} carries the synthetic banner`);
      assert.match(text, /FICTIONAL COMPANY/, `${path} names the company as fictional`);
    } else {
      assert.ok(marked(JSON.parse(text)), `${path} is marked synthetic or fictional`);
    }
  }
});

test("SSNs are 000-prefixed and phones, emails are reserved test values", () => {
  for (const { path } of present) {
    const text = read(path);
    for (const ssn of text.match(/\b\d{3}-\d{2}-\d{4}\b/g) ?? []) {
      assert.match(ssn, /^000-\d{2}-\d{4}$/, `${path}: ${ssn} must use the 000-xx-xxxx test form`);
    }
    for (const phone of text.match(/\(?\b\d{3}\)?[ .-]\d{3}-\d{4}\b/g) ?? []) {
      assert.match(phone, /555-01\d\d$/, `${path}: ${phone} must be a 555-01xx number`);
    }
    for (const email of text.match(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g) ?? []) {
      assert.match(email, /@example\.(com|org|net)$/, `${path}: ${email} must use an example domain`);
    }
  }
});

test("card numbers appear only masked or as the 4111 test PAN", () => {
  for (const { path } of present) {
    const text = read(path);
    const candidates = [
      ...(text.match(/\b\d{4}[ -]\d{4}[ -]\d{4}[ -]\d{1,7}\b/g) ?? []),
      ...(text.match(/\b\d{13,19}\b/g) ?? []),
    ];
    for (const candidate of candidates) {
      const digits = candidate.replace(/\D/g, "");
      const cardLike = /^[3-6]/.test(digits) && digits.length >= 13 && luhn(digits);
      assert.ok(!cardLike || digits === TEST_PAN, `${path}: ${candidate} looks like a real card number`);
    }
    if (path.endsWith(".json")) {
      for (const [key, value] of cardFields(JSON.parse(text))) {
        const digits = value.replace(/\D/g, "");
        if (digits.length <= 4) continue;
        assert.ok(digits === TEST_PAN, `${path}: ${key}=${value} must be masked (****1234) or the 4111 test PAN`);
      }
    }
  }
});

test("lifecycle customer carries what fraud, SAR, briefing, and advisory need", () => {
  const customer = JSON.parse(read("fixtures/customers/lifecycle-customer.json"));
  assert.equal(customer.household_id, "dana-whitfield");
  assert.equal(customer.person.ssn, "000-00-0158");
  assert.match(customer.person.phone, /555-0142$/);
  assert.equal(customer.person.email, "dana.whitfield@example.com");
  assert.equal(customer.kyc.employer_ticker, "HCYN");
  assert.equal(customer.kyc.pep, false);
  assert.ok(customer.kyc.risk_rating && customer.kyc.source_of_wealth);
  const types = customer.accounts.map((account) => account.type);
  assert.deepEqual(["checking", "credit_card", "brokerage"].filter((type) => types.includes(type)), ["checking", "credit_card", "brokerage"]);
  assert.equal(customer.accounts.find((account) => account.type === "credit_card").number_masked, "****1188");
  assert.equal(customer.accounts.find((account) => account.type === "brokerage").household_id, "dana-whitfield");
  const fraud = customer.service_events.find((event) => event.id === "cpp-orbit");
  assert.ok(fraud, "cpp-orbit fraud event is on file");
  assert.equal(fraud.amount, 286.4);
  assert.equal(fraud.merchant, "Orbit Digital Goods");
  assert.equal(fraud.channel, "card_not_present");
  assert.equal(fraud.date, "2026-10-02");
  assert.equal(fraud.refunded, true);
  assert.ok(Array.isArray(customer.alerts), "SAR alerts placeholder is an array");
});

test("issuer, customer, and household agree where they overlap", (t) => {
  const issuer = JSON.parse(read("fixtures/halcyon/issuer.json"));
  const customer = JSON.parse(read("fixtures/customers/lifecycle-customer.json"));
  assert.equal(issuer.ticker, "HCYN");
  assert.equal(issuer.fictional, true);
  assert.ok(existsSync(join(root, issuer.annual_report)), "annual report path resolves");
  assert.ok(issuer.peers.every((peer) => peer.real === true), "peers are labelled real");
  const dana = issuer.executives.find((exec) => exec.name === "Dana Whitfield");
  assert.match(dana.title, /Global Operations/);
  assert.match(customer.kyc.occupation, /Global Operations/);
  assert.match(read(issuer.annual_report), /Dana Whitfield/);

  const householdPath = "fixtures/households/dana-whitfield.json";
  if (!existsSync(join(root, householdPath))) {
    t.diagnostic(`${householdPath} not written yet; skipping household cross-checks`);
    return;
  }
  const household = JSON.parse(read(householdPath));
  assert.equal(household.id, customer.household_id);
  const brokerage = customer.accounts.find((account) => account.type === "brokerage");
  assert.ok(household.accounts.some((account) => account.number === brokerage.household_account_number),
    "brokerage account number matches the household");
});

test("SAR cases cite the fraud event, carry the injection, and agree with the scenarios", () => {
  const scenarios = JSON.parse(read("fixtures/sar/scenarios.json")).scenarios;
  const customer = JSON.parse(read("fixtures/customers/lifecycle-customer.json"));
  const card = customer.accounts.find((account) => account.type === "credit_card").number_masked;
  assert.deepEqual(scenarios.map((item) => item.id), ["mule-reyes", "structuring-harbor", "explained-novak", "injection-reyes"]);
  for (const item of scenarios) {
    assert.ok(existsSync(join(root, item.case)), `${item.id}: ${item.case} exists`);
    const sar = JSON.parse(read(item.case));
    assert.ok(sar.sample_draft?.sections?.length >= 6, `${item.id} has a sample narrative`);
    for (const section of sar.sample_draft.sections) {
      for (const sentence of section.sentences) assert.ok(sentence.cites.length, `${item.id}: "${sentence.text}" is cited`);
    }
  }
  const mule = JSON.parse(read("fixtures/sar/cases/mule-reyes.json"));
  assert.equal(mule.referral.linked_fraud_case, "cpp-orbit");
  const declined = mule.transactions.find((txn) => txn.status === "declined");
  assert.equal(declined.funding.card_masked, card, "the declined push uses the lifecycle customer's blocked card");
  const injected = mule.documents.injected.flatMap((doc) => doc.segments).join(" ");
  assert.match(injected, /Ignore all previous instructions/);
  assert.match(injected, new RegExp(TEST_PAN));
  assert.doesNotMatch(mule.documents.clean.flatMap((doc) => doc.segments).join(" "), /Ignore all previous/);
  assert.equal(JSON.parse(read("fixtures/sar/cases/explained-novak.json")).sample_draft.recommendation, "no_file");
});

test("fixture paths stay inside the repo", () => {
  for (const entry of manifest.fixtures) {
    assert.ok(!relative(root, join(root, entry.path)).startsWith(".."), `${entry.path} stays in the repo`);
  }
});
