/*
 * Spectra color engine
 * OKLCH based palette generation with sRGB gamut mapping.
 * Pure functions, no DOM. Used by the plugin UI (ui.html).
 *
 * Pipeline for every output color:
 *   OKLCH -> OKLab -> linear sRGB -> (chroma reduce if out of gamut) -> gamma sRGB
 *
 * References:
 *   OKLab/OKLCH by Bjorn Ottosson
 *   CSS Color 4 gamut mapping (reduce chroma, keep L and H)
 */

/* ---------- small math helpers ---------- */
function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
function toRad(deg) { return (deg * Math.PI) / 180; }
function toDeg(rad) { let d = (rad * 180) / Math.PI; return d < 0 ? d + 360 : d; }

/* ---------- sRGB transfer function ---------- */
function linearToGamma(c) {
  // c is linear light 0..1
  const a = c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
  return a;
}
function gammaToLinear(c) {
  // c is gamma encoded 0..1
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/* ---------- OKLab <-> linear sRGB ---------- */
function oklabToLinearSrgb(L, a, b) {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.2914855480 * b;

  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;

  return {
    r: 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    g: -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    b: -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s,
  };
}

function linearSrgbToOklab(r, g, b) {
  const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b;
  const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b;
  const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b;

  const l_ = Math.cbrt(l);
  const m_ = Math.cbrt(m);
  const s_ = Math.cbrt(s);

  return {
    L: 0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_,
    a: 1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_,
    b: 0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_,
  };
}

/* ---------- OKLCH <-> OKLab ---------- */
function oklchToOklab(L, C, H) {
  return { L: L, a: C * Math.cos(toRad(H)), b: C * Math.sin(toRad(H)) };
}
function oklabToOklch(L, a, b) {
  const C = Math.sqrt(a * a + b * b);
  let H = toDeg(Math.atan2(b, a));
  return { L: L, C: C, H: H };
}

/* ---------- gamut check ---------- */
function inGamut(rgb, eps) {
  eps = eps === undefined ? 0.00001 : eps;
  return (
    rgb.r >= -eps && rgb.r <= 1 + eps &&
    rgb.g >= -eps && rgb.g <= 1 + eps &&
    rgb.b >= -eps && rgb.b <= 1 + eps
  );
}
function clipRgb(rgb) {
  return { r: clamp(rgb.r, 0, 1), g: clamp(rgb.g, 0, 1), b: clamp(rgb.b, 0, 1) };
}

/*
 * Map an OKLCH color into the sRGB gamut by reducing chroma while keeping
 * L and H fixed (CSS Color 4 style). Returns gamma encoded sRGB 0..1.
 */
function oklchToSrgb(L, C, H) {
  L = clamp(L, 0, 1);
  const lab0 = oklchToOklab(L, C, H);
  let lin = oklabToLinearSrgb(lab0.L, lab0.a, lab0.b);

  if (!inGamut(lin)) {
    // binary search the largest in gamut chroma between 0 and C
    let lo = 0, hi = C, best = 0;
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2;
      const lab = oklchToOklab(L, mid, H);
      const candidate = oklabToLinearSrgb(lab.L, lab.a, lab.b);
      if (inGamut(candidate, 0.0005)) { best = mid; lo = mid; } else { hi = mid; }
    }
    const labBest = oklchToOklab(L, best, H);
    lin = oklabToLinearSrgb(labBest.L, labBest.a, labBest.b);
  }

  lin = clipRgb(lin);
  return {
    r: linearToGamma(lin.r),
    g: linearToGamma(lin.g),
    b: linearToGamma(lin.b),
  };
}

/* ---------- hex <-> rgb (gamma, 0..1) ---------- */
function hexToRgb(hex) {
  hex = String(hex).trim().replace(/^#/, "");
  if (hex.length === 3) hex = hex.split("").map(function (c) { return c + c; }).join("");
  if (hex.length !== 6 || /[^0-9a-fA-F]/.test(hex)) return null;
  return {
    r: parseInt(hex.slice(0, 2), 16) / 255,
    g: parseInt(hex.slice(2, 4), 16) / 255,
    b: parseInt(hex.slice(4, 6), 16) / 255,
  };
}
function rgbToHex(rgb) {
  function h(v) {
    const n = Math.round(clamp(v, 0, 1) * 255);
    return n.toString(16).padStart(2, "0");
  }
  return ("#" + h(rgb.r) + h(rgb.g) + h(rgb.b)).toUpperCase();
}

/* hex (gamma) -> OKLCH */
function hexToOklch(hex) {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;
  const lin = { r: gammaToLinear(rgb.r), g: gammaToLinear(rgb.g), b: gammaToLinear(rgb.b) };
  const lab = linearSrgbToOklab(lin.r, lin.g, lin.b);
  return oklabToOklch(lab.L, lab.a, lab.b);
}

/* ---------- scale presets ----------
 * Each preset defines the stops. For every stop:
 *   key    -> the label used for the style name and swatch (e.g. "500")
 *   L      -> target OKLCH lightness 0..1 for that step
 *   cMul   -> chroma multiplier applied to the base chroma, tapered at the
 *             extremes so very light / very dark steps stay clean
 * The base hue is always kept constant (that is the whole point of OKLCH),
 * and the base chroma comes from the seed color the user picks.
 */

// Default perceptual scale, Tailwind style 50..950.
const DEFAULT_SCALE = [
  { key: "50",  L: 0.971, cMul: 0.22 },
  { key: "100", L: 0.946, cMul: 0.35 },
  { key: "200", L: 0.903, cMul: 0.55 },
  { key: "300", L: 0.842, cMul: 0.75 },
  { key: "400", L: 0.760, cMul: 0.92 },
  { key: "500", L: 0.680, cMul: 1.00 },
  { key: "600", L: 0.600, cMul: 1.00 },
  { key: "700", L: 0.515, cMul: 0.92 },
  { key: "800", L: 0.440, cMul: 0.80 },
  { key: "900", L: 0.378, cMul: 0.68 },
  { key: "950", L: 0.285, cMul: 0.52 },
];

// Material 3 inspired tonal scale (tones 0..100, lighter = higher tone).
const MATERIAL_SCALE = [
  { key: "0",   L: 0.000, cMul: 0.00 },
  { key: "10",  L: 0.240, cMul: 0.55 },
  { key: "20",  L: 0.330, cMul: 0.80 },
  { key: "30",  L: 0.420, cMul: 0.95 },
  { key: "40",  L: 0.505, cMul: 1.00 },
  { key: "50",  L: 0.590, cMul: 1.00 },
  { key: "60",  L: 0.670, cMul: 0.98 },
  { key: "70",  L: 0.760, cMul: 0.88 },
  { key: "80",  L: 0.838, cMul: 0.72 },
  { key: "90",  L: 0.910, cMul: 0.50 },
  { key: "95",  L: 0.952, cMul: 0.34 },
  { key: "99",  L: 0.985, cMul: 0.14 },
  { key: "100", L: 1.000, cMul: 0.00 },
];

// iOS / Apple inspired. Fewer, cleaner steps, light tints to deep shades.
const IOS_SCALE = [
  { key: "50",  L: 0.968, cMul: 0.20 },
  { key: "100", L: 0.930, cMul: 0.38 },
  { key: "200", L: 0.878, cMul: 0.60 },
  { key: "300", L: 0.806, cMul: 0.82 },
  { key: "400", L: 0.724, cMul: 0.95 },
  { key: "500", L: 0.642, cMul: 1.00 }, // base, close to Apple system colors
  { key: "600", L: 0.560, cMul: 0.98 },
  { key: "700", L: 0.472, cMul: 0.88 },
  { key: "800", L: 0.392, cMul: 0.74 },
  { key: "900", L: 0.318, cMul: 0.58 },
];

// Ant Design inspired, 10 steps, light at top (1) to dark (10).
const ANT_SCALE = [
  { key: "1",  L: 0.974, cMul: 0.18 },
  { key: "2",  L: 0.942, cMul: 0.34 },
  { key: "3",  L: 0.898, cMul: 0.54 },
  { key: "4",  L: 0.836, cMul: 0.74 },
  { key: "5",  L: 0.762, cMul: 0.90 },
  { key: "6",  L: 0.668, cMul: 1.00 }, // primary
  { key: "7",  L: 0.572, cMul: 0.96 },
  { key: "8",  L: 0.476, cMul: 0.84 },
  { key: "9",  L: 0.388, cMul: 0.68 },
  { key: "10", L: 0.300, cMul: 0.52 },
];

// Atlassian inspired tokens, 0..1000 in hundreds.
const ATLAS_SCALE = [
  { key: "0",    L: 0.985, cMul: 0.10 },
  { key: "50",   L: 0.962, cMul: 0.22 },
  { key: "100",  L: 0.928, cMul: 0.40 },
  { key: "200",  L: 0.878, cMul: 0.62 },
  { key: "300",  L: 0.806, cMul: 0.82 },
  { key: "400",  L: 0.726, cMul: 0.94 },
  { key: "500",  L: 0.648, cMul: 1.00 },
  { key: "600",  L: 0.566, cMul: 0.96 },
  { key: "700",  L: 0.486, cMul: 0.86 },
  { key: "800",  L: 0.408, cMul: 0.72 },
  { key: "900",  L: 0.336, cMul: 0.58 },
  { key: "1000", L: 0.268, cMul: 0.46 },
];

// Orbit (Kiwi.com) inspired, named steps.
const ORBIT_SCALE = [
  { key: "light",   L: 0.956, cMul: 0.26 },
  { key: "lighter", L: 0.900, cMul: 0.52 },
  { key: "normal",  L: 0.642, cMul: 1.00 }, // base
  { key: "dark",    L: 0.512, cMul: 0.90 },
  { key: "darker",  L: 0.408, cMul: 0.72 },
  { key: "darkest", L: 0.318, cMul: 0.56 },
];

/*
 * Custom scale with an adjustable number of colors (like the "Number of
 * Colors" control on oklch.fyi/create). Lightness is spread evenly from a
 * light tint to a deep shade, and chroma is tapered so the ends stay clean
 * and the middle carries the most intensity. The step whose lightness is
 * closest to the base lightness is marked as the base.
 */
function buildCustomScale(n, baseL) {
  n = Math.max(3, Math.min(20, Math.round(n || 9)));
  const Ltop = 0.97, Lbot = 0.24;
  const stops = [];
  let baseIdx = 0, baseDiff = 999;
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0 : i / (n - 1);          // 0 light .. 1 dark
    const L = Ltop - t * (Ltop - Lbot);
    // symmetric taper, low at both ends, peak in the middle
    const cMul = Math.max(0.18, 1 - 0.8 * Math.pow(Math.abs(2 * t - 1), 1.6));
    const key = i === 0 ? "50" : String(i * 100);
    stops.push({ key: key, L: L, cMul: cMul });
    if (baseL != null) {
      const d = Math.abs(L - baseL);
      if (d < baseDiff) { baseDiff = d; baseIdx = i; }
    }
  }
  return { stops: stops, baseKey: stops[baseIdx] ? stops[baseIdx].key : "500" };
}

const PRESETS = {
  default:  { label: "Default",          baseKey: "500",    scale: DEFAULT_SCALE },
  material: { label: "Material",         baseKey: "40",     scale: MATERIAL_SCALE },
  ios:      { label: "iOS",              baseKey: "500",    scale: IOS_SCALE },
  ant:      { label: "Ant Design",       baseKey: "6",      scale: ANT_SCALE },
  atlas:    { label: "Atlassian",        baseKey: "500",    scale: ATLAS_SCALE },
  orbit:    { label: "Orbit",            baseKey: "normal", scale: ORBIT_SCALE },
  custom:   { label: "Custom",           baseKey: "500",    scale: null, custom: true },
};

/* ---------- auto color naming ----------
 * Picks a human color name from the hue and chroma. Low chroma -> neutral
 * family (gray/slate/stone). Otherwise nearest named hue bucket.
 */
const HUE_NAMES = [
  { name: "Red",     h: 25 },
  { name: "Orange",  h: 55 },
  { name: "Amber",   h: 75 },
  { name: "Yellow",  h: 95 },
  { name: "Lime",    h: 120 },
  { name: "Green",   h: 145 },
  { name: "Emerald", h: 160 },
  { name: "Teal",    h: 185 },
  { name: "Cyan",    h: 210 },
  { name: "Sky",     h: 235 },
  { name: "Blue",    h: 262 },
  { name: "Indigo",  h: 280 },
  { name: "Violet",  h: 300 },
  { name: "Purple",  h: 320 },
  { name: "Fuchsia", h: 338 },
  { name: "Pink",    h: 355 },
];

function autoColorName(oklch) {
  if (!oklch) return "Color";
  // near grayscale
  if (oklch.C < 0.03) {
    if (oklch.L > 0.85) return "Gray";
    if (oklch.L < 0.25) return "Charcoal";
    // a touch of hue tints the neutral family
    if (oklch.H >= 200 && oklch.H <= 290) return "Slate";
    if (oklch.H >= 60 && oklch.H <= 110) return "Stone";
    return "Neutral";
  }
  // find nearest hue bucket on the circle
  let best = HUE_NAMES[0], bestD = 999;
  for (let i = 0; i < HUE_NAMES.length; i++) {
    let d = Math.abs(oklch.H - HUE_NAMES[i].h);
    if (d > 180) d = 360 - d;
    if (d < bestD) { bestD = d; best = HUE_NAMES[i]; }
  }
  return best.name;
}

/* ---------- WCAG 2 contrast ---------- */
function relLuminance(rgb) {
  function lin(c) { return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
  return 0.2126 * lin(rgb.r) + 0.7152 * lin(rgb.g) + 0.0722 * lin(rgb.b);
}
function contrastRatio(rgbA, rgbB) {
  const la = relLuminance(rgbA), lb = relLuminance(rgbB);
  const hi = Math.max(la, lb), lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}
// best readable text (black or white) on a swatch, with ratio and WCAG level
function stepContrast(rgb) {
  const white = { r: 1, g: 1, b: 1 }, black = { r: 0, g: 0, b: 0 };
  const cw = contrastRatio(rgb, white), cb = contrastRatio(rgb, black);
  const on = cw >= cb ? "white" : "black";
  const best = Math.max(cw, cb);
  return {
    white: Math.round(cw * 100) / 100,
    black: Math.round(cb * 100) / 100,
    best: Math.round(best * 100) / 100,
    on: on,
    level: best >= 7 ? "AAA" : best >= 4.5 ? "AA" : best >= 3 ? "AA Large" : "Fail",
  };
}

/* ---------- format an OKLCH string ---------- */
function formatOklch(L, C, H) {
  const l = Math.round(L * 1000) / 10;      // percent, 1 decimal
  const c = Math.round(C * 1000) / 1000;
  const h = Math.round(H * 10) / 10;
  return "oklch(" + l + "% " + c + " " + h + ")";
}

/* ---------- generate a full palette ---------- */
/*
 * base     : { L, C, H } OKLCH base (chroma is the intended, pre gamut value)
 * presetId : key into PRESETS
 * count    : only used when presetId === "custom"
 * returns  : { presetLabel, baseKey, steps: [...] }
 */
function generatePaletteOklch(base, presetId, count) {
  let preset = PRESETS[presetId] || PRESETS.default;
  const baseChroma = base.C;
  const hue = base.H;

  let scale = preset.scale;
  let baseKey = preset.baseKey;
  if (preset.custom) {
    const built = buildCustomScale(count, base.L);
    scale = built.stops;
    baseKey = built.baseKey;
  }

  const steps = scale.map(function (stop) {
    const C = baseChroma * stop.cMul;
    const rgb = oklchToSrgb(stop.L, C, hue);
    return {
      key: stop.key,
      hex: rgbToHex(rgb),
      rgb: rgb,
      oklch: formatOklch(stop.L, C, hue),
      L: Math.round(stop.L * 1000) / 1000,
      C: Math.round(C * 1000) / 1000,
      H: Math.round(hue * 10) / 10,
      contrast: stepContrast(rgb),
      isBase: stop.key === baseKey,
    };
  });

  return {
    presetId: presetId,
    presetLabel: preset.label,
    baseKey: baseKey,
    steps: steps,
  };
}

// hex convenience wrapper (kept for back compat)
function generatePalette(seedHex, presetId, count) {
  const seed = hexToOklch(seedHex);
  if (!seed) return null;
  return generatePaletteOklch(seed, presetId, count);
}

/* ---------- exporters ---------- */
function slugify(name) {
  return String(name || "color").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "color";
}
function exportCssVars(name, steps) {
  const slug = slugify(name);
  return steps.map(function (s) { return "  --" + slug + "-" + s.key + ": " + s.hex + ";"; }).join("\n");
}
function exportCssVarsOklch(name, steps) {
  const slug = slugify(name);
  return steps.map(function (s) { return "  --" + slug + "-" + s.key + ": " + s.oklch + ";"; }).join("\n");
}
function exportTailwind(name, steps) {
  const slug = slugify(name);
  const body = steps.map(function (s) { return "    '" + s.key + "': '" + s.hex + "',"; }).join("\n");
  return slug + ": {\n" + body + "\n},";
}
function exportHexList(steps) {
  return steps.map(function (s) { return s.key + "\t" + s.hex; }).join("\n");
}

/* Export for both module and global (plugin UI) use. */
const SpectraColor = {
  oklchToSrgb: oklchToSrgb,
  hexToOklch: hexToOklch,
  hexToRgb: hexToRgb,
  rgbToHex: rgbToHex,
  autoColorName: autoColorName,
  generatePalette: generatePalette,
  generatePaletteOklch: generatePaletteOklch,
  contrastRatio: contrastRatio,
  stepContrast: stepContrast,
  formatOklch: formatOklch,
  exportCssVars: exportCssVars,
  exportCssVarsOklch: exportCssVarsOklch,
  exportTailwind: exportTailwind,
  exportHexList: exportHexList,
  slugify: slugify,
  PRESETS: PRESETS,
};

if (typeof module !== "undefined" && module.exports) { module.exports = SpectraColor; }
if (typeof window !== "undefined") { window.SpectraColor = SpectraColor; }
