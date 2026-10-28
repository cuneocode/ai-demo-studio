// Derives the light theme from the dark stylesheets at build time, so the two
// cannot drift. Every colour declaration in app CSS gets a copy under
// :root[data-theme="light"] with its colours mapped: dark surfaces become
// white and pale grey-blue, light text becomes navy, and accents keep their
// hue at a lightness that reads on white.
const LIGHT = ':root[data-theme="light"]';
const COLOR_PROPS = /^(color|background(-color|-image)?|border(-(top|right|bottom|left|block|inline)(-start|-end)?)?(-color)?|outline(-color)?|box-shadow|text-shadow|fill|stroke|caret-color|accent-color|text-decoration-color|column-rule(-color)?|filter|--.*)$/;
const COLOR = /#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)|\b(white|black)\b/g;

function parse(token) {
  if (token === "white") return [255, 255, 255, 1];
  if (token === "black") return [0, 0, 0, 1];
  if (token.startsWith("#")) {
    let hex = token.slice(1);
    if (hex.length === 3 || hex.length === 4) hex = [...hex].map((c) => c + c).join("");
    if (hex.length !== 6 && hex.length !== 8) return null;
    const n = (i) => parseInt(hex.slice(i, i + 2), 16);
    return [n(0), n(2), n(4), hex.length === 8 ? n(6) / 255 : 1];
  }
  const parts = token.replace(/rgba?\(|\)/g, "").split(/[\s,/]+/).filter(Boolean);
  if (parts.length < 3 || parts.some((part) => part.includes("var"))) return null;
  const channel = (value) => (value.endsWith("%") ? (parseFloat(value) * 255) / 100 : parseFloat(value));
  const alpha = parts[3] === undefined ? 1 : parts[3].endsWith("%") ? parseFloat(parts[3]) / 100 : parseFloat(parts[3]);
  return [channel(parts[0]), channel(parts[1]), channel(parts[2]), alpha];
}

function toHsl([r, g, b]) {
  const [rn, gn, bn] = [r / 255, g / 255, b / 255];
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === rn ? (gn - bn) / d + (gn < bn ? 6 : 0) : max === gn ? (bn - rn) / d + 2 : (rn - gn) / d + 4;
  return [h * 60, s, l];
}

function fromHsl(h, s, l) {
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0), f(8), f(4)].map((v) => Math.round(v * 255));
}

const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

const luminance = (rgb) => rgb.map(value => {
  const channel = value / 255;
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}).reduce((total, value, index) => total + value * [0.2126, 0.7152, 0.0722][index], 0);
const LIGHT_SURFACE = luminance([243, 246, 250]);
const TEXT_COLOR = /^(color|text-decoration-color|--(blue|blue-soft|violet|mint|amber|danger|integration))$/;

function readableInk(rgb) {
  const [h, s, initial] = toHsl(rgb);
  for (let l = initial; l > 0 && (LIGHT_SURFACE + 0.05) / (luminance(rgb) + 0.05) < 4.5; l = Math.max(0, l - 0.01)) {
    rgb = fromHsl(h, s, Math.max(0, l - 0.01));
  }
  return rgb;
}

function mapColor(rgba, prop) {
  const [r, g, b, alpha] = rgba;
  const [h, s, l] = toHsl([r, g, b]);
  const shadow = /shadow|filter/.test(prop);
  let rgb;
  let a = alpha;
  if (shadow && l < 0.3) {
    rgb = [16, 24, 40];
    a = alpha * 0.4;
  } else if (shadow && l > 0.9) {
    return null;
  } else if (s > 0.3 && l >= 0.3 && l <= 0.82) {
    // Accents: same hue, darker so it reads on white.
    rgb = fromHsl(h, clamp(s * 1.05, 0, 0.85), clamp(0.3 + (l - 0.3) * 0.38, 0.3, 0.5));
    if (alpha < 1 && /^background/.test(prop)) a = alpha * 0.75;
  } else if (l < 0.17) {
    // Surfaces: more elevated in the dark theme means whiter here.
    rgb = fromHsl(h, Math.min(s, 0.45), 0.955 + (l / 0.17) * 0.045);
  } else if (l < 0.45) {
    // Borders, dividers, and subtle fills.
    rgb = fromHsl(h, Math.min(s, 0.4), 0.92 - ((l - 0.17) / 0.28) * 0.24);
  } else {
    // Text and icons: light on dark becomes navy on light.
    rgb = fromHsl(h, Math.min(s, 0.45), clamp(0.1 + (1 - l) * 0.85, 0.1, 0.55));
  }
  const [rr, gg, bb] = TEXT_COLOR.test(prop) ? readableInk(rgb) : rgb;
  return a >= 1 ? `#${[rr, gg, bb].map((v) => v.toString(16).padStart(2, "0")).join("")}` : `rgba(${rr}, ${gg}, ${bb}, ${+a.toFixed(3)})`;
}

const hasColor = (value) => [...value.matchAll(COLOR)].some(([token]) => parse(token));

export function lightValue(value, prop) {
  return value.replace(COLOR, (token) => {
    const rgba = parse(token);
    return rgba ? mapColor(rgba, prop) ?? token : token;
  });
}

function splitSelectors(selector) {
  const parts = [];
  let depth = 0, start = 0;
  for (let i = 0; i < selector.length; i++) {
    if (selector[i] === "(" || selector[i] === "[") depth++;
    else if (selector[i] === ")" || selector[i] === "]") depth--;
    else if (selector[i] === "," && depth === 0) { parts.push(selector.slice(start, i)); start = i + 1; }
  }
  parts.push(selector.slice(start));
  return parts.map((part) => part.trim()).filter(Boolean);
}

function scope(selector) {
  return splitSelectors(selector).map((part) => {
    if (part.startsWith(":root")) return LIGHT + part.slice(5);
    if (/^html\b/.test(part)) return part.replace(/^html/, `html[data-theme="light"]`);
    return `${LIGHT} ${part}`;
  }).join(", ");
}

const insideKeyframes = (node) => {
  for (let parent = node.parent; parent; parent = parent.parent) {
    if (parent.type === "atrule" && /keyframes$/.test(parent.name)) return true;
  }
  return false;
};

const firstColor = (value) => {
  for (const [token] of value.matchAll(COLOR)) {
    const rgba = parse(token);
    if (rgba) return rgba;
  }
  return null;
};

/** A filled accent with white text (a primary button): stays filled, brighter, with white text. */
function filledAccent(decls) {
  const text = decls.find((decl) => decl.prop === "color");
  const fill = decls.find((decl) => /^background(-color)?$/.test(decl.prop));
  const ink = text && firstColor(text.value);
  const paint = fill && firstColor(fill.value);
  if (!ink || !paint || ink[3] < 1 || paint[3] < 0.5) return null;
  const [, , inkL] = toHsl(ink);
  const [h, s, l] = toHsl(paint);
  if (inkL < 0.88 || s < 0.3 || l < 0.25 || l > 0.7) return null;
  const [r, g, b] = fromHsl(h, Math.max(s, 0.75), 0.52);
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

export default function lightTheme() {
  return {
    postcssPlugin: "fsi-light-theme",
    OnceExit(root) {
      const file = root.source?.input?.file ?? "";
      if (!/\/(?:app|demos\/[^/]+\/ui)\//.test(file) || file.includes("/node_modules/")) return;
      root.walkRules((rule) => {
        if (insideKeyframes(rule) || rule.selector.includes('data-theme="light"')) return;
        const decls = rule.nodes.filter((node) => node.type === "decl" && COLOR_PROPS.test(node.prop) && (!node.prop.startsWith("--") || hasColor(node.value)));
        if (!decls.length) return;
        const clone = rule.clone({ selector: scope(rule.selector), nodes: [] });
        const filled = filledAccent(decls);
        for (const decl of decls) {
          const value = !filled ? lightValue(decl.value, decl.prop)
            : decl.prop === "color" ? "#ffffff"
            : /^(background(-color)?|border(-color)?)$/.test(decl.prop) ? decl.value.replace(COLOR, (token) => (parse(token) ? filled : token))
            : lightValue(decl.value, decl.prop);
          clone.append(decl.clone({ value }));
        }
        rule.after(clone);
      });
    },
  };
}
lightTheme.postcss = true;
