---
name: OMSI Enhancer — Setup World
description: Choose your run on the map; the choices float above it as sheets.
colors:
  ground-dark: "#090c18"
  ground-light: "#eef1f5"
  on-ground-dark: "#e8ebf2"
  on-ground-light: "#0e1117"
  sheet: "#f7f8f8"
  sheet-ink: "#0e1117"
  sheet-quiet: "#6b7280"
  sheet-hairline: "rgba(14, 17, 23, 0.1)"
  route: "#2a75f7"
  route-deep: "#1b5fd0"
  line-badge: "#ffd23f"
  on-line-badge: "#1a1400"
  late: "#d93a30"
  on-time: "#1a8a4f"
  early: "#2a75f7"
  map-button-dark: "rgba(18, 26, 38, 0.86)"
  map-button-light: "rgba(255, 255, 255, 0.94)"
  road-casing-dark: "#212833"
  road-1-dark: "#333b47"
  road-2-dark: "#3c4552"
  road-3-dark: "#495261"
  rail-dark: "#2b323c"
  water-dark: "#1d3550"
  road-casing-light: "#9fb0c3"
  road-1-light: "#eef2f7"
  road-2-light: "#f7f9fc"
  road-3-light: "#ffffff"
  rail-light: "#b9c4d1"
  water-light: "#b3d2ee"
typography:
  display:
    fontFamily: "Hanken Grotesk, Segoe UI, system-ui, sans-serif"
    fontSize: "26px"
    fontWeight: 700
    lineHeight: 1.05
    letterSpacing: "-0.01em"
  title:
    fontFamily: "Hanken Grotesk, Segoe UI, system-ui, sans-serif"
    fontSize: "20px"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "0.09em"
  body:
    fontFamily: "Hanken Grotesk, Segoe UI, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.3
    letterSpacing: "normal"
    fontFeature: "tnum 1, lnum 1"
  caption:
    fontFamily: "Hanken Grotesk, Segoe UI, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.3
    letterSpacing: "normal"
  label:
    fontFamily: "Hanken Grotesk, Segoe UI, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "0.09em"
  label-small:
    fontFamily: "Hanken Grotesk, Segoe UI, system-ui, sans-serif"
    fontSize: "10px"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "0.16em"
  badge:
    fontFamily: "Hanken Grotesk, Segoe UI, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 800
    lineHeight: 1
    letterSpacing: "0.01em"
rounded:
  badge: "6px"
  control: "8px"
  sm: "10px"
  action: "12px"
  md: "14px"
  full: "999px"
spacing:
  xs: "6px"
  sm: "8px"
  md: "14px"
  lg: "18px"
  xl: "20px"
  edge: "22px"
components:
  button-primary:
    backgroundColor: "{colors.route}"
    textColor: "#ffffff"
    typography: "{typography.title}"
    rounded: "{rounded.action}"
    padding: "0 20px"
    height: "62px"
    width: "clamp(150px, 15.3%, 240px)"
  button-primary-hover:
    backgroundColor: "{colors.route-deep}"
    textColor: "#ffffff"
  sheet:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.sheet-ink}"
    rounded: "{rounded.md}"
  step-bar:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.sheet-quiet}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    padding: "0 1.2% 0 1.34%"
    height: "40px"
  line-badge:
    backgroundColor: "{colors.line-badge}"
    textColor: "{colors.on-line-badge}"
    typography: "{typography.badge}"
    rounded: "{rounded.badge}"
    padding: "0 10px"
    height: "25px"
  list-row:
    backgroundColor: "transparent"
    textColor: "{colors.sheet-ink}"
    typography: "{typography.body}"
    rounded: "{rounded.sm}"
    padding: "0 8px"
    height: "38px"
  list-row-selected:
    backgroundColor: "{colors.route}"
    textColor: "#ffffff"
  map-control:
    backgroundColor: "{colors.map-button-dark}"
    textColor: "#f2f5f8"
    rounded: "{rounded.control}"
    size: "32px"
---

# Design System: OMSI Enhancer — Setup World

> **Scope.** This file records the world shipped on the setup screen
> (`src/renderer/src/Setup.tsx`, `setup.css`, `theme.css`). It is not yet the
> whole app. The incumbent "glass" world in `src/renderer/src/styles.css` still
> governs every screen that has not been converted, and the overlay
> (`overlay.css`, `routemap.css`) is deliberately out of scope and unchanged.
> The project currently carries two systems side by side; say so rather than
> assuming this one already won.
>
> **Six token names collide** between the two worlds — `--grond`, `--radius`,
> `--lijn`, `--laat`, `--optijd`, `--vroeg` — with different values on each
> side, and `styles.css` loads later. That is why this world's token layer is
> scoped to `.setup` and not to `:root`. Anyone extending this system adds
> tokens inside `.setup`; the start hub (`.hub`) hangs on the same rule, so
> there is one token layer and not a copy per screen. The only exception is the canvas road palette, which
> must sit on `:root` because `roadLayer.ts` reads it from
> `document.documentElement` for an off-DOM canvas; those names collide with
> nothing.

## Overview

**Creative North Star: "The Windscreen Map"**

This is the screen language of car navigation, moved to a desk. The map is not
an illustration beside the choice — it is the ground the choice is made on. It
runs to all four edges of the window with no frame around it, and everything
else floats above it as a small number of light sheets. You see *where* you
will drive before you know what the line is called.

Two states of one world, not two designs. What changes between dark and light
is the ground — night map or day map — and what a light sheet needs to detach
from it: a shadow in the dark, a hairline in the light. Every other value is
identical in both, because a button that feels different in light than in dark
is two buttons. Every colour except the yellow line badge was measured off the
approved comp with `impeccable comp-spec`; the type face was chosen by matching
the comp's 18px cap height and width class with `impeccable font-match`, not by
taste.

Restraint is the discipline. Colour carries meaning and nothing else: blue is
the route and the one primary action, yellow is the line number, and the three
punctuality colours belong to time. Everything else is ground, sheet, and ink.
No frosted glass, no gradients, no ornament.

**Key Characteristics:**
- Edge-to-edge map ground; no container, no frame, no sidebar on this screen.
- Sheets float: one radius, one soft shadow layer, hairline border in light.
- One accent (#2a75f7) for route and primary action; one brand yellow for the line.
- Tabular lining numerals everywhere, so a departure time never shifts a pixel.
- Motion under a fifth of a second, and none at all under reduced-motion.

## Colors

A near-monochrome ground with exactly three jobs given to colour: the route, the
line number, and punctuality.

### Primary
- **Route Blue** (`{colors.route}`): the route ribbon on the map, the active
  step and its underline, the selected list row, the focus ring, and the single
  START action. It is the only accent that appears on more than one kind of
  element, and it always means "this is the thing you are choosing or doing."
- **Route Blue Deep** (`{colors.route-deep}`): the hover state of the primary
  action. Nowhere else.

### Secondary
- **Line Yellow** (`{colors.line-badge}`): the line-number badge only. A
  binding brand commitment from PRODUCT.md, not a decorative accent. Its ink is
  a near-black warm brown (`{colors.on-line-badge}`) so the badge reads as a
  printed plate, not as a highlight.

### Tertiary
- **Late Red** (`{colors.late}`), **On-Time Green** (`{colors.on-time}`),
  **Early Blue** (`{colors.early}`): punctuality, and nothing but punctuality.

### Neutral
- **Night Ground** (`{colors.ground-dark}`) / **Day Ground** (`{colors.ground-light}`):
  the map surface behind everything. The screen's background *is* the map.
- **Sheet** (`{colors.sheet}`): the one surface allowed to sit above the map.
  The same off-white in both modes — the sheet does not change, the ground does.
- **Sheet Ink** (`{colors.sheet-ink}`) and **Quiet Ink** (`{colors.sheet-quiet}`):
  primary and secondary text inside sheets; the quiet grey carries column
  headers, subheads, durations, and the footer line.
- **Hairline** (`{colors.sheet-hairline}`): dividers inside a sheet — the footer
  rule and the inactive step connector.
- **On-Ground** (`{colors.on-ground-dark}` / `{colors.on-ground-light}`) and its
  62%/60% soft variant: the only text allowed directly on the map — the empty
  state and the scale bar.
- **Road palette** (`road-casing-*`, `road-1..3-*`, `rail-*`, `water-*`): the
  canvas road network in three widths plus casing, rail and water, per mode.

### Named Rules
**The Three Jobs Rule.** Colour has three jobs on this screen: the route
(blue), the line (yellow), and time (red/green/blue). Anything else is ground,
sheet, or ink. A new element that wants a colour must first prove it is doing
one of those three jobs. Worked example: the brand monogram on a bus tile used
to take a hue derived from the brand's name, which put a dozen unrelated colours
on one screen. It is now an ink plate on the sheet (`--monogram`); the letters
tell the brands apart.

**The Two States, One World Rule.** Dark and light differ in exactly three
things: the ground, whether a sheet gets a shadow or a hairline, and whether a
map control is dark-on-map or light-on-map. Any other value that forks by theme
is a bug, not a variant.

**The Scale-Bar Rule.** Text set directly on the map is painted with a 3px
stroke in the ground colour under it (`paint-order: stroke`) so map geometry
stops at the word instead of running through it.

## Typography

**Display/Body Font:** Hanken Grotesk (self-hosted via @fontsource, weights
400/500/700/800), falling back to Segoe UI and system-ui.

**Character:** A neutral, slightly narrow grotesk with generous counters — a
signage face rather than an interface face, which is what a navigation screen
wants. It was matched to the approved comp by cap height (18px cap → 26px body
size) and width class, so it sits at the measured size rather than a chosen one.

### Hierarchy
- **Display** (700, 26px, 1.05, -0.01em): the sheet title. Drops to 22px below
  640px window height.
- **Title** (700, 20px, 0.09em, uppercase): the primary action label only.
  Drops to 17px below 920px width.
- **Body** (400/500, 14px, tabular lining numerals): list rows. The name cell
  runs at 500; the rest at 400.
- **Caption** (400, 13px, 1.3): the sheet subhead and footer line, in quiet ink.
- **Label** (700, 12px, 0.09em, uppercase): step names in the step bar.
- **Label Small** (700, 10px, 0.16em, uppercase): column headers. Tracking
  relaxes to 0.10em below 920px.
- **Badge** (800, 15px, 0.01em): the line number inside the yellow plate.

### Named Rules
**The Fixed-Digit Rule.** The whole screen is set with tabular, lining figures
(`font-feature-settings: 'tnum' 1, 'lnum' 1`), and list rows restate it as
`font-variant-numeric`. A departure time that shifts a pixel because it
contains a 1 reads as an error.

**The Uppercase-Is-Styling Rule.** Uppercase is applied with `text-transform`,
never typed into the string. German does not capitalise the same way, and the
translation must stay a normal sentence.

**The Truncate-Don't-Grow Rule.** Every list cell clips with an ellipsis on one
line. Names vary wildly ("Citybus by Kajosch" beside "5"); a row that grows
pushes the whole list out of rhythm.

## Layout

The screen is fixed to the window (`position: fixed; inset: 0; overflow:
hidden`) — it *is* the window. The map fills it absolutely. Three things float
on top and nothing else: the step bar, the choice sheet, and the action.

Positions come from the approved comp and are expressed as percentages of the
window so proportions hold while the window scales; the exceptions are pinned in
pixels where a percentage would misbehave.

- **Step bar:** inset 22px from left, right, and top; 40px tall in pixels, not
  percent — a 5% bar is right at 1344px and a bench at 2560px.
- **Choice sheet:** left 22px, top 85px, `clamp(288px, 27.4%, 420px)` wide (368px
  at 1344px, matching the comp), full remaining height minus a 30px bottom gap.
- **Map controls:** a 32px-wide stack, right 29px / top 92px.
- **Primary action:** right 24px, bottom 31px, `clamp(150px, 15.3%, 240px)` ×
  62px. Always the same corner, on every step.
- **Rhythm:** 6 / 8 / 14 / 18 / 20 / 22px. Sheet header pads 18/20/10; column
  headers 10/20/8/28; footer 14/20; list gutter 12.
- **Row grid:** `26px 1.4fr 0.9fr 1fr` — a radio column plus three cells,
  identical for headers and rows. The bus step alone shifts to
  `26px 1.25fr 1.15fr 0.6fr`, because all buses share a name and only the file
  name distinguishes them.

**Responsive.** The window floor is 720×560.
- **≤1100px:** step connectors shorten (10px min, 8px margins); the step list
  indents 2%.
- **≤920px:** connectors disappear; completed and upcoming step labels collapse
  to icon-only (`font-size: 0`) while the *active* step keeps its word; the
  action shrinks to 150×54; the duration clock icon is dropped and the row grid
  evens out to `22px 1.2fr 1fr 1fr`.
- **≤640px height:** the sheet rises to top 74px, the step bar insets to 16px,
  header padding tightens, and the title drops to 22px.

### Named Rules
**The No-Frame Rule.** Nothing on this screen has a container around it that the
map does not already provide. The map bleeds into all four edges; sheets lie on
it.

**The Fixed-Corner Rule.** The primary action never moves. Same corner, same
size band, every step — so it can be hit without being looked for.

**The Action Row Starts Beside The Sheet.** The row carrying the actions spans
from the sheet's right edge to the window's right edge, not from the window's
left edge. Back sits at its left end, and a full-width row put that button on
top of the sheet's own footer line. Back therefore lands on the map, where it
takes the map-control colours rather than the sheet's; on the full-bleed steps,
which have no map, the row keeps the full width and the sheet reserves room
below itself instead.

## Elevation & Depth

Depth comes from one idea: sheets are above the map, and everything else is in
the map. There is exactly one shadow token, and it changes only its intensity
between modes. In light mode a sheet additionally takes a 1px hairline border,
because an off-white sheet on a pale ground cannot separate by shadow alone; in
dark mode that border is `transparent` rather than absent, so the box model
never shifts between themes.

### Shadow Vocabulary
- **Sheet lift, dark** (`box-shadow: 0 10px 30px rgba(0, 0, 0, 0.45)`): sheets,
  map controls, and the primary action on the night map.
- **Sheet lift, light** (`box-shadow: 0 6px 20px rgba(14, 17, 23, 0.1)`): the
  same elements on the day map.

### Named Rules
**The One Shadow Rule.** There is one elevation in this world. Something is on
the map or it is in the map. No second tier, no hover lift, no stacked shadows.

**The Hairline-For-Light Rule.** In light mode a floating surface carries a 1px
`rgba(14,17,23,0.12)` border; in dark mode the same border is transparent. Never
remove the border declaration — change its colour.

## Shapes

One corner size carries the world: 14px on sheets. Below it sit deliberate
smaller steps — 10px for things that live *inside* or *as* a bar (the step bar,
list rows), 12px for the primary action, 8px for the map control stack, 6px for
the line badge — and 999px for the one true circle, the row's radio.

Borders are hairlines or nothing. Icons are inline SVG paths at a single weight,
16px in the step bar, 13–18px elsewhere; they are labels, not pictures.

Stops on the map are the German H sign: a yellow disc with a green ring and a
green H, the same object that stands beside the road in the game. An earlier
draft of this file called for 4.5px route-blue dots here and kept the H signs
for the overlay only; the owner decided on 20-09-2026 that both worlds carry the
H. It is not an exception to the Three Jobs Rule: the sign is a real-world
object, like a road or a building, not a colour given a meaning.

### Named Rules
**The One Radius Rule.** A new floating surface takes 14px. A control inside a
surface takes 10px. Introducing a seventh radius requires a reason the existing
six cannot serve.

## Components

### Buttons
- **Shape:** softly squared (12px) for the primary action.
- **Primary (START/NEXT):** route blue on white text, 62px tall, uppercase
  20px/700 at 0.09em tracking, an 18px play glyph and a 12px gap, carrying the
  sheet shadow. Fixed to the bottom-right corner.
- **Hover:** background moves to route-deep over 120ms ease-out. No lift, no
  scale.
- **Disabled:** `opacity: 0.55`, default cursor. No colour change.
- **Step buttons:** transparent, inherit the label typography entirely; a
  completed step is a real button back to that step, an upcoming one is disabled
  because a choice that does not yet exist cannot be jumped to.

### Cards / Containers
- **Corner Style:** 14px.
- **Background:** sheet off-white in both modes; ink is sheet-ink.
- **Shadow Strategy:** the single sheet-lift token (see Elevation & Depth).
- **Border:** 1px — hairline in light, transparent in dark.
- **Internal Padding:** header 18px/20px/10px, footer 14px/20px, list gutter 12px.

### Lists / Rows (signature)
The choice list is the one component every step shares: a radio dot plus three
cells on a fixed grid, 38px tall, 10px radius.
- **Rest:** transparent on the sheet; duration cell in quiet ink.
- **Hover:** `rgba(14, 17, 23, 0.05)`.
- **Selected** (`aria-pressed="true"`): full route blue, white ink, duration at
  86% white, radio filled with a white 3.5px dot.
- **Disabled:** `opacity: 0.45` with the reason carried as a `title`.
- **Focus:** the shared ring, inset (`outline-offset: -2px`) so it stays inside
  the row.
- **Scrollbar:** thin, `rgba(14,17,23,0.25)` thumb on a transparent track,
  pill-shaped, with a 3px transparent inset via `background-clip: content-box`.
  Windows' default arrows and grey gutter are the loudest thing on a white sheet.

### Start hub (signature)
The screen the app opens on, and the one the step bar returns to. It carries the
same world as the setup screen -- ground, one sheet, one accent -- but the main
choice is not a list row here: the three ways to play are three tiles, 210px
tall, 14px corners, laid out three across and stacking below 900px. The chosen
mode takes full route blue like a selected row; the others sit on the sheet's
hover tint with a hairline. Below them, two panels of unequal weight: the
driver's record (duties, hours, km, licences, rank; the whole record is behind
it) and the plain buttons to OMSI's settings and to switching driver.

The sheet is as tall as its content, not as tall as the window: stretched to the
bottom edge it left half a screen of nothing under the buttons, which reads as
unfinished. Below 900px wide or 700px tall the tiles lose their minimum height
and their description clamps to two lines, so all three stay in one view.

### First run (signature)
Three cards, one question each, in this order: language, driver, where OMSI
lives. They share the welcome card -- centred, no step bar, nothing else to do
but answer. The language screen carries no heading in any one language, because
the visitor has not chosen one yet: four tiles with a 60px flag and the
language's own name, two by two (four across below 640px tall). The driver
screen is the same card with one field. Only then does the app ask for the OMSI
folder, and only then does it read the maps.

The driver step keeps that shape later on: drivers are tiles with their
initials, name and what they have driven, not rows in a table -- a driver is a
person, not a record.

### Step transition (signature)
Pressing the main button drops a full-screen window in the ground colour over
everything, drives a route-blue bus across it from left to right, and lifts it
again: 900ms in total, the bus taking 700 of them. It covers rather than
overlays, so you never see one step half-through the other, and it swallows
clicks while it stands. Motion-reduced settings skip it entirely.

Hover is the small version of the same idea: two pixels up and a lit border on
any tile, with a map photo scaling 3% inside its own tile. Enough to say "this
is a button", not enough to make the row below it dance.

### Map tiles (signature)
The map step can be read two ways, and the user picks with a two-button switch
above the list: rows (name, tours, era) or tiles carrying the picture OMSI ships
with every map -- `maps/<map>/picture.jpg`, 370x280, the same image the game's
own map menu shows. Tiles are at least 232px wide with rows sized to their
content (`grid-auto-rows: max-content`; an `auto` row inside a fixed-height grid
is allowed to shrink, which cropped the photo and pushed the name out of the
tile). The whole photo is shown, never a crop: `object-fit: contain` on the
monogram tint, so a map that ships a different size gets bars instead of losing
its title. A map without a picture falls back to the brand monogram.

Choosing is two steps here, unlike a row: the first click selects the map, and
then the sheet narrows and the map's road network is drawn beside it, the way
every later step shows its map. A second click on the same tile -- or the main
button -- moves on. The header carries the chosen map's name, tours and era,
because three different maps ship a photo that says "Hamburg".

### Preparing maps
The last step of installing, and the only screen with a progress bar: one track
in the sheet's hover tint with a route-blue fill, the map being read named under
it, and one quiet button to skip. It uses the welcome screen's centred card, not
the setup world's sheet-on-map, because there is no map to stand on yet.

### Navigation (step bar)
The step bar is the only navigation on this screen; the app's sidebar is hidden
here because a second bar would say the same thing twice. Five steps — profile,
map, line, duty, bus — read as a route: icon plus uppercase label, joined by 2px
connectors that turn route blue once passed.
- **Done:** sheet ink, clickable back.
- **Now:** route blue, with a 3px route-blue underline that runs to the bar's
  edge (`bottom: -12px`, top corners rounded).
- **Upcoming:** `rgba(107, 114, 128, 0.55)`, not a button.
- **Narrow:** connectors drop at 920px, then labels collapse to icons — except
  the active step, which keeps its word.

### Line Badge (signature)
The yellow plate carrying the line number: min-width 57px × 25px, 6px radius,
800 weight at 15px, sitting at the head of the step bar. It is the only yellow
on the screen and the only element whose colour is fixed by product, not by
measurement.

### Focus
One ring, everywhere: `outline: 2px solid var(--route)` at `outline-offset: 2px`,
declared on `.setup :focus-visible` so this world never falls back to the old
world's ring.

### Motion
One motion, not a different one per element. The sheet rises on a step change
(`vel-op`: 6px up, fade, 180ms ease-out); rows, buttons and map controls
transition `background-color`, `color`, `opacity` at 120ms ease-out. Everything
is switched off under `prefers-reduced-motion: reduce`.

## Do's and Don'ts

### Do:
- **Do** put new tokens for this world inside `.setup`, never on `:root` — six
  names collide with the glass world in `styles.css`, which loads later.
- **Do** put canvas colours that `roadLayer.ts` reads on `:root` per theme; that
  is the one documented exception.
- **Do** set every number in tabular lining figures.
- **Do** give a new floating surface 14px corners, the single sheet shadow, and
  the hairline-in-light border.
- **Do** apply uppercase with `text-transform`, so German translations stay
  normal sentences.
- **Do** truncate list cells with an ellipsis instead of letting a row grow.
- **Do** keep the primary action in the bottom-right corner on every step.
- **Do** draw icons as inline SVG paths at a single weight.
- **Do** hold every transition at or under 180ms and honour
  `prefers-reduced-motion`.

### Don't:
- **Don't** give a new element blue, yellow, or a punctuality colour unless it is
  the route/primary action, the line number, or time.
- **Don't** add frosted glass, gradients, or ornament — this world is flat ground
  plus flat sheets.
- **Don't** introduce a second elevation tier, a hover lift, or a stacked shadow.
- **Don't** wrap the map in a frame, card, or padded container; it bleeds to all
  four edges.
- **Don't** fork a value by theme beyond ground, sheet separation, and
  map-control polarity.
- **Don't** use a typed text character as an icon; the `+` and `−` map controls
  that ship today are a defect this world carries, not a pattern to copy.
- **Don't** put stop labels or map text where a sheet can cover it; the map does
  not know where the sheets are.
- **Don't** change the overlay or the unconverted screens to match this world
  without an explicit decision — they are still the glass world on purpose.
