/*
 * Spectra - main thread (Figma sandbox)
 *
 * Receives finished palettes from the UI (all color math is done there) and:
 *   - paints an auto-layout palette card on the canvas
 *   - creates local paint styles named "<ColorName>/<step>"
 *
 * The UI sends rgb as { r, g, b } in 0..1, so no conversion is needed here.
 */

figma.showUI(__html__, { width: 400, height: 660, themeColors: true });

/* ---------- helpers ---------- */

function solid(rgb) {
  return [{ type: "SOLID", color: { r: rgb.r, g: rgb.g, b: rgb.b } }];
}

// Relative luminance (sRGB) to decide black vs white label text on a swatch.
function labelColor(rgb) {
  function lin(c) { return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
  const L = 0.2126 * lin(rgb.r) + 0.7152 * lin(rgb.g) + 0.0722 * lin(rgb.b);
  return L > 0.5 ? { r: 0, g: 0, b: 0 } : { r: 1, g: 1, b: 1 };
}

async function loadFonts() {
  await figma.loadFontAsync({ family: "Inter", style: "Regular" });
  await figma.loadFontAsync({ family: "Inter", style: "Semi Bold" });
  await figma.loadFontAsync({ family: "Inter", style: "Medium" });
}

function makeText(chars, opts) {
  const t = figma.createText();
  t.fontName = { family: "Inter", style: opts.style || "Regular" };
  t.characters = chars;
  t.fontSize = opts.size || 12;
  if (opts.color) t.fills = solid(opts.color);
  if (opts.width) { t.resize(opts.width, t.height); t.textAutoResize = "HEIGHT"; }
  if (opts.align) t.textAlignHorizontal = opts.align;
  return t;
}

/* ---------- build one swatch ---------- */
/*
 * A swatch is a full width horizontal bar, stacked vertically in the card:
 *   [ step key (left) .......... hex (right) ]   on the shade color
 * Label colors flip to stay readable on light and dark shades.
 */
function buildSwatch(step, colorName, showHex) {
  const BAR_W = 320;      // bar width
  const BAR_H = 52;       // bar height

  const bar = figma.createFrame();
  bar.name = colorName + " / " + step.key + (step.isBase ? " (base)" : "");
  bar.layoutMode = "HORIZONTAL";
  bar.primaryAxisSizingMode = "FIXED";
  bar.counterAxisSizingMode = "FIXED";
  bar.resize(BAR_W, BAR_H);
  bar.primaryAxisAlignItems = "SPACE_BETWEEN";
  bar.counterAxisAlignItems = "CENTER";
  bar.paddingLeft = 16;
  bar.paddingRight = 16;
  bar.cornerRadius = 10;
  bar.fills = solid(step.rgb);
  if (step.isBase) {
    bar.strokes = solid({ r: 0.08, g: 0.08, b: 0.1 });
    bar.strokeWeight = 2;
  }

  const lblCol = labelColor(step.rgb);
  const keyText = makeText(step.key + (step.isBase ? "  *" : ""), {
    style: "Semi Bold", size: 13, color: lblCol,
  });
  bar.appendChild(keyText);

  if (showHex) {
    const hexText = makeText(step.hex, { style: "Medium", size: 12, color: lblCol });
    bar.appendChild(hexText);
  }

  return bar;
}

/* ---------- build the full palette card ---------- */
function buildPaletteCard(payload) {
  const colorName = payload.colorName || "Color";
  const steps = payload.steps;
  const showHex = payload.showHex !== false;

  const outer = figma.createFrame();
  outer.name = "Okra / " + colorName + " (" + payload.presetLabel + ")";
  outer.layoutMode = "VERTICAL";
  outer.primaryAxisSizingMode = "AUTO";
  outer.counterAxisSizingMode = "AUTO";
  outer.itemSpacing = 20;
  outer.paddingLeft = 32;
  outer.paddingRight = 32;
  outer.paddingTop = 28;
  outer.paddingBottom = 28;
  outer.cornerRadius = 20;
  outer.fills = solid({ r: 1, g: 1, b: 1 });
  outer.strokes = solid({ r: 0.9, g: 0.9, b: 0.92 });
  outer.strokeWeight = 1;

  // header
  const header = figma.createFrame();
  header.name = "header";
  header.layoutMode = "VERTICAL";
  header.primaryAxisSizingMode = "AUTO";
  header.counterAxisSizingMode = "AUTO";
  header.itemSpacing = 2;
  header.fills = [];
  const title = makeText(colorName, { style: "Semi Bold", size: 20, color: { r: 0.08, g: 0.08, b: 0.1 } });
  const sub = makeText(payload.presetLabel + " scale  -  OKLCH", { style: "Regular", size: 12, color: { r: 0.5, g: 0.5, b: 0.53 } });
  header.appendChild(title);
  header.appendChild(sub);
  outer.appendChild(header);

  // vertical stack of swatch bars
  const col = figma.createFrame();
  col.name = "swatches";
  col.layoutMode = "VERTICAL";
  col.primaryAxisSizingMode = "AUTO";
  col.counterAxisSizingMode = "AUTO";
  col.counterAxisAlignItems = "MIN";
  col.itemSpacing = 8;
  col.fills = [];
  steps.forEach(function (step) {
    col.appendChild(buildSwatch(step, colorName, showHex));
  });
  outer.appendChild(col);

  return outer;
}

/* ---------- create paint styles ---------- */
async function createStyles(payload) {
  const colorName = payload.colorName || "Color";
  let made = 0;

  // existing style names to avoid duplicates
  const existing = {};
  const local = await figma.getLocalPaintStylesAsync();
  local.forEach(function (s) { existing[s.name] = s; });

  payload.steps.forEach(function (step) {
    const name = colorName + "/" + step.key;
    let style = existing[name];
    if (!style) { style = figma.createPaintStyle(); style.name = name; }
    style.paints = solid(step.rgb);
    made++;
  });
  return made;
}

/* ---------- message handling ---------- */
figma.ui.onmessage = async function (msg) {
  try {
    if (msg.type === "generate") {
      await loadFonts();
      const card = buildPaletteCard(msg.payload);

      // place near viewport center
      card.x = Math.round(figma.viewport.center.x - card.width / 2);
      card.y = Math.round(figma.viewport.center.y - card.height / 2);
      figma.currentPage.appendChild(card);
      figma.currentPage.selection = [card];
      figma.viewport.scrollAndZoomIntoView([card]);

      let note = "Palette added to canvas";
      if (msg.payload.createStyles) {
        const n = await createStyles(msg.payload);
        note += "  -  " + n + " styles created";
      }
      figma.notify(note);
      figma.ui.postMessage({ type: "done" });
    }

    if (msg.type === "styles-only") {
      const n = await createStyles(msg.payload);
      figma.notify(n + " paint styles created");
      figma.ui.postMessage({ type: "done" });
    }

    if (msg.type === "open-url") {
      // the UI opens the link itself via window.open; this is a no-op fallback
      // kept so the message does not surface as an error
      if (typeof figma.openExternal === "function") { figma.openExternal(msg.url); }
    }

    if (msg.type === "close") {
      figma.closePlugin();
    }
  } catch (e) {
    figma.notify("Spectra error: " + (e && e.message ? e.message : e), { error: true });
    figma.ui.postMessage({ type: "done" });
  }
};
