# Theme generator (feature spec)

Status: planned. This documents the accessible theme feature before it is built.

## Goal

When a color is marked as the primary, Okra generates two complete, accessible
themes from it, light and dark, each with a suggested background, surface, text,
and a theme ready primary. The user picks any color and gets both themes with
backgrounds that actually read well, not a guess.

## Decisions (locked)

- From any primary, generate both a light theme and a dark theme, each with a
  suggested background.
- Contrast target is AAA (7:1) where reachable, with AA (4.5:1) as the hard
  floor. Never ship below 4.5:1 for text.
- Output as Figma variables in one collection with two modes, Light and Dark,
  so a single token flips with the theme.
- Backgrounds carry a very subtle tint of the primary hue by default (on brand),
  easy to switch to pure neutral later.

## Inputs

- The primary color as OKLCH (`L`, `C`, `H`), which Okra already holds as the
  base color.

## The core solver (one new function)

Everything is built on a single helper:

```
solveLightnessForContrast(hue, chroma, againstRgb, targetRatio, direction)
```

Binary search the OKLCH lightness at a fixed hue and chroma until the color hits
`targetRatio` against a reference color. `direction` says whether to search
lighter or darker. It reuses the existing `contrastRatio`, `oklchToSrgb`, and
gamut mapping, so it always returns an in gamut, renderable color. Try 7:1
first, fall back to 4.5:1 if 7:1 is not reachable at that hue.

## Variable set

One collection, `Okra Theme`, with modes `Light` and `Dark`. Each variable holds
a value per mode.

| Variable | Light | Dark |
|:--|:--|:--|
| `background` | near white, subtle hue tint | near black, subtle hue tint |
| `surface` | one perceptible step off the background | one perceptible step off the background |
| `primary` | the picked color, or a darkened version if it fails contrast | a lighter, calmer version of the hue |
| `on-primary` | text or icon that sits on primary (black or white) | the same, resolved for the dark primary |
| `text` | body text on the background, AAA where possible | light body text on the dark background |
| `text-muted` | secondary text, AA floor | secondary text, AA floor |
| `border` | low contrast divider on the background | low contrast divider on the background |

## Derivation logic

### Light mode
- `background`: OKLCH lightness about 0.99, chroma a faint tint, roughly
  `min(baseC * 0.03, 0.01)`.
- `surface`: about 0.965 lightness, same faint tint, so cards read against the
  page. Keep a minimum lightness gap so the two never merge.
- `text`: solve darker until it reaches 7:1 on the background, floor 4.5:1.
- `text-muted`: solve to 4.5:1 on the background.
- `primary`: check the picked color against white and black.
  - If it clears 4.5:1 with white, keep it, `on-primary` is white.
  - Else if it clears 4.5:1 with black, keep it, `on-primary` is black.
  - Else darken the primary until white text clears 4.5:1, flag it as adjusted,
    `on-primary` is white.
- `border`: solve to about 1.4:1 on the background (visible, not loud).

### Dark mode
- `background`: OKLCH lightness about 0.18, chroma a faint tint, roughly
  `min(baseC * 0.06, 0.02)`. Not pure black.
- `surface`: about 0.23 lightness, same tint.
- `primary`: raise lightness into the 0.72 to 0.82 band and ease chroma to about
  0.9 of the base, then confirm 4.5:1 against the dark background and adjust if
  needed. This follows the dark mode convention of a lighter tone of the hue.
- `on-primary`: since the dark primary is light, solve a dark text color to
  4.5:1 on it.
- `text`: solve lighter until 7:1 on the dark background, floor 4.5:1.
- `text-muted`: solve to 4.5:1 on the dark background.
- `border`: solve to about 1.4:1 on the dark background.

## UI

- A small action near the base color, "Use as primary".
- When on, a Theme section appears with two compact cards, Light and Dark.
- Each card shows a tiny mock (background with a primary button and a line of
  text) plus the variables as swatches with hex and a contrast badge, so the
  preview and the numbers sit together.
- A button, "Create theme variables".

## Figma output

- Create a variable collection `Okra Theme` with modes `Light` and `Dark`.
- Create one color variable per row above, setting its value for each mode.
- Store the OKLCH value of each in the variable description, since Figma has no
  OKLCH format.
- Later, optionally drop a theme preview frame on the canvas, a mock screen in
  light and one in dark using these variables, so the pairing is visible in
  context.

## Edge cases

- Very light primary (yellow, lime): white text fails, so the light primary is
  darkened and `on-primary` goes dark.
- Very dark primary (navy): capped lightness in dark mode so it does not wash
  out.
- Near gray primary: tints collapse toward neutral, which is correct.
- Out of gamut after shifting lightness: handled by the existing gamut mapping.
- Background and surface always keep a minimum lightness gap.

## Phases

1. MVP: compute both themes, show the Theme section with contrast badges, and
   create the Figma variable collection with Light and Dark modes.
2. Later: the on canvas theme preview mock, a neutral vs tinted background
   toggle, a hover and active state for primary, and an export of the theme as
   CSS variables scoped to `:root` and `.dark`.

## Open items

- Exact variable names and grouping (`background` vs `bg/background`).
- Whether to also create matching paint styles for teams not on variables.
