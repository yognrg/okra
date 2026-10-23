# Okra — OKLCH Palette Generator (Figma plugin)

Generate perceptually even color scales in OKLCH, drop them on the canvas with
auto layout, and create Figma color styles. Pick a base color, pick a scale
style, name it, generate.

Created by Yog. https://yogfolio.vercel.app

## Why OKLCH

Shades are built by changing only the OKLCH lightness while hue and the chroma
curve stay controlled. So a blue stays blue across every step. No purple drift
in the light tints and no muddy gray in the dark ones, which is what happens
with HSL.

## Scale styles (dropdown)

- Default (50 to 950, 11 steps)
- Material (tones 0 to 100, 13 steps)
- iOS (50 to 900, 10 steps)
- Ant Design (1 to 10, 10 steps)
- Atlassian (0 to 1000, 12 steps)
- Orbit (light to darkest, 6 named steps)
- Custom (pick the number of colors, 5 to 14)

## Features

- Base color three ways: color picker, hex input, or OKLCH L C H sliders
- Scale style as a dropdown, palette name auto filled and editable
- Single screen, no scrolling
- Live preview of every shade, base step marked with a ring
- WCAG 2 contrast badge on every shade (AAA, AA, AA Large, Fail)
- Copy dropdown: CSS variables (hex), CSS variables (oklch), Tailwind, hex list
- Add to canvas as an auto-layout card with hex labels
- Create local paint styles named `Name/step` (for example `Blue/500`)
- Styles-only mode if you do not want anything drawn
- Light and dark plugin UI

## Install (development plugin, no build step)

1. Keep these files together in one folder:
   `manifest.json`, `code.js`, `ui.html`, `color.js`
2. Figma desktop app: menu → Plugins → Development → Import plugin from
   manifest, then pick `manifest.json`.
3. Run it from Plugins → Development → Okra.

`color.js` is already inlined into `ui.html`, so it is kept only as the source
of truth. The plugin runs from `manifest.json`, `code.js` and `ui.html`.

## Files

| File | Role |
|------|------|
| `manifest.json` | Plugin manifest |
| `code.js` | Main thread: draws the canvas card and creates paint styles |
| `ui.html` | Plugin UI with the color engine inlined |
| `color.js` | The OKLCH engine (source), for reference and edits |

## Editing the engine later

Edit `color.js`, then re-inline it into `ui.html`. From the folder:

```
node -e 'const fs=require("fs");let h=fs.readFileSync("ui.body.html","utf8");h=h.replace("/* ===== OKRA_ENGINE_PLACEHOLDER ===== */",fs.readFileSync("color.js","utf8"));fs.writeFileSync("ui.html",h)'
```

Scale curves live in `color.js` under the `*_SCALE` constants. Each stop is an
OKLCH lightness `L` (0 to 1) and a chroma multiplier `cMul` applied to the base
color chroma. Tune those to change how a preset looks.

## Renaming the plugin

The name lives in three places: `manifest.json` (`name`), `code.js` (the canvas
frame name) and `ui.html` (the header and footer). Change those and re-inline.
