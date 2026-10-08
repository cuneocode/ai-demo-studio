import test from "node:test";
import assert from "node:assert/strict";
import postcss from "postcss";
import lightTheme, { lightValue } from "../scripts/postcss-light-theme.mjs";

const lightness = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  return (Math.max(r, g, b) + Math.min(r, g, b)) / 2;
};

test("dark surfaces become light and light text becomes dark", () => {
  assert.ok(lightness(lightValue("#0a1019", "background")) > 0.95);
  assert.ok(lightness(lightValue("#2a3748", "border-color")) > 0.6);
  assert.ok(lightness(lightValue("#eef2f8", "color")) < 0.3);
});

test("accents keep their hue but darken enough to read on white", () => {
  const blue = lightValue("#5f8ff2", "color");
  const [r, , b] = [1, 3, 5].map((i) => parseInt(blue.slice(i, i + 2), 16));
  assert.ok(b > r && lightness(blue) <= 0.5);
});

test("shadows turn soft navy and non-colour values pass through", () => {
  assert.match(lightValue("0 8px 24px rgba(0,0,0,.26)", "box-shadow"), /rgba\(16, ?24, ?40, ?0\.1/);
  assert.equal(lightValue("var(--text)", "color"), "var(--text)");
});

const run = (css, from = "/repo/app/x.css") => postcss([lightTheme()]).process(css, { from }).css;

test("the plugin adds scoped light rules after each original, outside keyframes and vendor CSS", () => {
  const out = run(".card{padding:4px;background:#121a25}@keyframes pulse{to{color:#fff}}");
  assert.match(out, /\.card\{padding:4px;background:#121a25\}:root\[data-theme="light"\] \.card\{background:#[0-9a-f]{6}\}/);
  assert.doesNotMatch(out, /data-theme="light"\] to/);
  assert.equal(run(".x{color:#fff}", "/repo/node_modules/pkg/x.css"), ".x{color:#fff}");
});

test("filled accent buttons stay filled with white text", () => {
  const out = run(".go{background:#2b4c95;color:#fff;border:1px solid #6d8fe0}");
  const light = out.slice(out.indexOf(':root[data-theme="light"]'));
  assert.match(light, /color:#ffffff/);
  const fill = light.match(/background:(#[0-9a-f]{6})/)[1];
  assert.ok(lightness(fill) > 0.45 && lightness(fill) < 0.6);
});
