import test from "node:test";
import assert from "node:assert/strict";
import { EDGE, cardWidth, intersects, mergeRects, place, scrollDelta } from "../app/guide/placement.ts";

const VIEW = { w: 1440, h: 900 };
const SIDEBAR = { x: 0, y: 64, w: 252, h: 836 };
const TOP = 64;
const box = (placement, h) => ({ x: placement.x, y: placement.y, w: placement.w, h });

test("card width follows the viewport", () => {
  assert.equal(cardWidth(1440), 360);
  assert.equal(cardWidth(1100), 320);
  assert.equal(cardWidth(800), 784);
});

test("no targets: centred", () => {
  const result = place({ targets: [], viewport: VIEW, card: { h: 260 }, top: TOP });
  assert.equal(result.mode, "center");
  assert.equal(result.w, 460);
  assert.equal(result.x, Math.round((1440 - 460) / 2));
});

test("a narrow target on the left: the card goes to its right", () => {
  const target = { x: 280, y: 200, w: 400, h: 120 };
  const result = place({ targets: [target], viewport: VIEW, card: { h: 260 }, top: TOP, sidebar: SIDEBAR });
  assert.equal(result.mode, "right");
  assert.ok(!intersects(box(result, 260), target));
});

test("the hint is tried first", () => {
  const target = { x: 700, y: 300, w: 200, h: 100 };
  const result = place({ targets: [target], viewport: VIEW, card: { h: 200 }, top: TOP, hint: "left" });
  assert.equal(result.mode, "left");
});

test("a full-width target with room below: below", () => {
  const target = { x: 270, y: 120, w: 1150, h: 200 };
  const result = place({ targets: [target], viewport: VIEW, card: { h: 260 }, top: TOP, sidebar: SIDEBAR });
  assert.equal(result.mode, "below");
  assert.ok(result.y >= target.y + target.h);
});

test("a full-width target with no room around it docks in the sidebar", () => {
  const target = { x: 270, y: 200, w: 1150, h: 560 };
  const result = place({ targets: [target], viewport: VIEW, card: { h: 300, dockH: 420 }, top: TOP, sidebar: SIDEBAR });
  assert.equal(result.mode, "dock");
  assert.equal(result.w, SIDEBAR.w - 20);
  assert.ok(!intersects(box(result, 420), target));
});

test("no sidebar and no room: a strip over the top bar", () => {
  const target = { x: 20, y: 80, w: 1400, h: 800 };
  const result = place({ targets: [target], viewport: VIEW, card: { h: 300 }, top: TOP, sidebar: null });
  assert.equal(result.mode, "strip");
  assert.ok(result.y + 48 <= TOP);
});

test("below the narrow breakpoint the card is a bottom sheet", () => {
  const result = place({ targets: [{ x: 10, y: 100, w: 300, h: 100 }], viewport: { w: 800, h: 900 }, card: { h: 240 }, top: 58 });
  assert.equal(result.mode, "sheet");
  assert.equal(result.y, 900 - 240 - 8);
});

test("the presenter bar is an obstacle", () => {
  const bar = { x: 0, y: 600, w: 1440, h: 300 };
  const target = { x: 270, y: 120, w: 1150, h: 300 };
  const result = place({ targets: [target], viewport: VIEW, card: { h: 260 }, obstacles: [bar], top: 0, sidebar: null });
  const height = result.mode === "strip" ? 48 : 260;
  assert.ok(!intersects(box(result, height), bar), `${result.mode} overlaps the presenter bar`);
  assert.ok(!intersects(box(result, height), target));
  const roomy = place({ targets: [{ x: 270, y: 120, w: 1150, h: 120 }], viewport: VIEW, card: { h: 260 }, obstacles: [bar], top: 0, sidebar: null });
  assert.equal(roomy.mode, "below");
  assert.ok(roomy.y + 260 <= bar.y);
});

test("the card never covers a target, across many layouts", () => {
  let seed = 7;
  const random = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let i = 0; i < 2000; i += 1) {
    const vw = random() < 0.5 ? 1440 : 1100;
    const sidebar = { x: 0, y: TOP, w: vw >= 1280 ? 252 : 235, h: 900 - TOP };
    const count = 1 + Math.floor(random() * 3);
    const targets = Array.from({ length: count }, () => {
      const w = 40 + random() * (vw - sidebar.w - 80);
      const h = 30 + random() * 500;
      return { x: sidebar.w + 10 + random() * (vw - sidebar.w - 20 - w), y: TOP + 10 + random() * (900 - TOP - 20 - h), w, h };
    });
    const h = 180 + random() * 200;
    const result = place({ targets, viewport: { w: vw, h: 900 }, card: { h, dockH: h * 1.5 }, top: TOP, sidebar });
    const height = result.mode === "dock" ? h * 1.5 : result.mode === "strip" ? 48 : h;
    for (const target of targets) assert.ok(!intersects(box(result, height), target), `${result.mode} covers a target in layout ${i}`);
    if (result.mode !== "strip") assert.ok(result.x >= (result.mode === "dock" ? 8 : EDGE - 1) && result.x + result.w <= vw - EDGE + 1, `${result.mode} leaves the viewport in layout ${i}`);
  }
});

test("overlapping holes merge; separate holes stay apart", () => {
  const merged = mergeRects([{ x: 0, y: 0, w: 100, h: 100 }, { x: 50, y: 50, w: 100, h: 100 }, { x: 400, y: 400, w: 10, h: 10 }]);
  assert.deepEqual(merged, [{ x: 0, y: 0, w: 150, h: 150 }, { x: 400, y: 400, w: 10, h: 10 }]);
});

test("scrolling: none when visible, centred otherwise, primary target first when too tall", () => {
  const band = { top: 80, bottom: 884 };
  assert.equal(scrollDelta([{ x: 0, y: 100, w: 10, h: 100 }], band), null);
  assert.equal(scrollDelta([{ x: 0, y: 1200, w: 10, h: 100 }], band), 1250 - (80 + 402));
  assert.equal(scrollDelta([{ x: 0, y: 1200, w: 10, h: 100 }], band, "start"), 1200 - 80);
  const tall = [{ x: 0, y: 1500, w: 10, h: 200 }, { x: 0, y: 2600, w: 10, h: 200 }];
  assert.equal(scrollDelta(tall, band), 1500 - 80);
});
