# Interface style guide

Ironwood Status extends the game's interface. New features should look like they belong beside the existing Equipment, Materials, Current Loot and Status rows. Use those shipped surfaces as references when choosing a layout.

## Choose the existing pattern

| Content | Pattern | Reference |
| --- | --- | --- |
| A feature or major section | One dark panel with a compact heading | `.iw-card`, `.iw-card-header` |
| Repeated items, quantities or estimates | Full-width rows with aligned columns and thin separators | `.iw-table-row`, `.iw-table-item`, `.iw-table-number` |
| Categories within a list | Small section heading followed by rows | `.iw-subheader`, `.iw-trait-region-header` |
| Native equipment management | Retain the game's actual buttons and locks; add information within the row | Equipment Consumables |
| Activity readiness or a warning | Existing status icon or badge, with a text/accessibility label | `.iw-task-icon`, `.iw-material-warning` |

Use one panel around a list. On Consumables, equipped items and each supply category have their own panel, separated by the standard 10px gap. Each ordinary item is a row, not a separately rounded card. Timers are secondary values aligned with quantities; item names retain the visual priority. Keep full names readable by giving the name column the flexible space and allowing wrapping on narrow screens.

## Typography and density

Inherit the game's font. Use the surrounding native page's scale when extending a native control. For Status-owned surfaces, the established sizes are:

| Element | Size / treatment |
| --- | --- |
| Panel heading | 16px, weight 600; approximately 48px header height |
| Category heading | 14–16px, weight 600 |
| Item name and main quantity | 16px, normal weight, 24px line height |
| Secondary value or timer | 14–16px, normal weight |
| Column label / helper | 11–12px, muted; uppercase only for column labels |
| Item icon | 32px square, `object-fit: contain` |
| Ordinary data row | Approximately 37px minimum; grow for wrapped text |
| Interactive row with two lines | Approximately 58px; preserve a useful touch target |

Reuse 6–10px horizontal row padding and 8px icon/text gaps. Align numeric columns right and use tabular numerals. Keep controls and values in separate columns so locks and buttons cannot overlap text. On narrow screens, wrap names and reduce secondary text before sacrificing legibility.

## Color and surfaces

The authoritative declarations live in [styles.css](../../src/apps/status/styles.css). These are the existing reusable roles, not a second theme:

| Role | Existing value |
| --- | --- |
| Panel | `#0d2234`, 4px outer corner radius |
| Category strip | `#102a3d` |
| Row hover | `#142c3e` |
| Divider | 1px `#294052` |
| Primary text | `#fff` |
| Quantities and secondary text | `#aab6bf` |
| Column labels / quieter text | `#8fa1ad` |
| Zero / unavailable reserve | `#71818d` |
| Active / success indicator | Existing green status treatment |
| Warning / urgent indicator | Existing amber / red warning treatment |

Ordinary quantities and timers stay neutral. Reserve saturated colors for a meaningful status change. Reuse existing warning, progress and activity components when that meaning is needed. Combat effects and rare-loot highlights are specialized patterns; use ordinary data-row styling for routine supplies and estimates.

## Labels and estimates

Use the vocabulary in [CONTEXT.md](../../CONTEXT.md). Distinguish equipped consumables, stored reserves and pending loot. A known zero and an unknown balance need different labels.

Prefix an estimated duration with `≈`. Show a short state such as **Active use**, **Not in use**, **Empty** or **Estimating…** beside the value. Put detailed assumptions in one section note or a tooltip rather than repeating a paragraph on every row. Keep enough visible text to understand the state without relying on color or hover.

## Native integration and verification

1. Inspect a comparable shipped surface before choosing markup and CSS. Prefer shared classes and native controls.
2. Scope additions to the owning feature. Preserve native event handlers, lock controls, keyboard focus and quantity updates. Clean up additions when Angular reuses a node for another category.
3. Verify with the installed companion plugins. Angular's scoped selectors and Pancake's compact-row styles can override layout: inspect computed `display`, `min-width`, `max-width`, padding and text overflow. Use a feature-specific selector; use `!important` only for a confirmed conflicting declaration.
4. Inspect the finished screen at desktop and narrow widths. Check long names, large quantities, empty supplies, paused/unknown estimates and tab transitions. All names and values must remain readable, controls must not overlap, and rows must fill their intended width.
5. Capture the final UI after the last build. Compare its density, hierarchy and colors with the shipped reference, not just with the design intention. Follow the repository's [testing workflow](../technical/testing.md) for behavioral changes.

## Compact action buttons

Portal action controls share a 26px minimum height, 12px inherited type, 18px line height, 3px by 8px padding, and 4px corners. Icon-only actions are 26px square with 14px glyphs. Use the shared action classes for Start, Edit, Save, Refresh, Done and similar controls across Status, Skills, the planner, calculator and dialogs. Keep semantic colors, but do not add feature-specific or narrow-screen size overrides. Native game controls and full-row navigation retain their own layouts.

Skill leaderboard badges use the native trophy and attach to the upper-right edge of each skill row. Keep them in their own column above Start/Edit so neither long names nor action controls overlap the rank.


## Labelled progress bars

XP, current-action queues, house production queues, countdowns, recipe coverage, mastery coverage and trait progress share a 22px minimum bar height, 12px normal-weight text, 18px line height, 1px by 7px padding and a 1px border. Counts, percentages, rates and time remaining inherit the same typography. Do not add smaller labels or feature-specific sizing overrides inside these bars. Allow a bar to grow only when its content must wrap on a narrow screen; retain all quantities and labels.

Use the recipe coverage bar’s highlighted fill for these bars: translucent blue, a bright leading edge and a subtle inset glow. Coverage bars retain green segments for owned or available materials, and warning states retain their amber or red meaning. House production uses the `iw-progress-muted` variant: a softer blue fill, a thin leading edge and no inset glow; its warning and urgent fills are likewise muted. This variant shares the standard height and typography. The current-action XP bar keeps its existing green fill and border without the inset glow. Unknown-duration countdowns remain striped so they cannot imply a known completion percentage.
