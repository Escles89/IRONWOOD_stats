# Ironwood Dispatch: lines and conditions

The Dispatch mixes fictional in-world reporting with facts observed by the dashboard. It is not an official news feed. All lines live in [`src/content/news-lines.json`](../src/content/news-lines.json); the userscript build embeds them, so selecting headlines never fetches a profile, inventory, or external news source.

## Categories

| JSON category | When eligible | What it uses |
| --- | --- | --- |
| `general` | Always | Village, guild, inventory, and adventurer jokes. |
| `geek` | Always | Programming and technology humor. |
| `sci_fi` | Always | Space travel, science fiction, and familiar genre references. |
| `pop_culture` | Always | Fantasy, games, and popular-culture nods. |
| `league_of_legends`, `diablo`, `rollercoaster_tycoon`, `cookie_clicker`, `runescape` | Always | Dedicated game references and crossover jokes. |
| `idler` | Always | Queues, automation, number watching, and excessive optimization. |
| `idle` | No active action is observed | Resting tools and idle adventurers. |
| Exact skill name | That skill is active | Skill-specific lines, including Woodcutting, Mining, Taming, and each combat skill. Names must match the native displayed skill. |
| `combat` | Combat is active | General combat humor. |
| `combat_live` | Combat is active, no revival, and no known player HP at or below 25% | Current enemy and player names; no invented hit or damage claims. |
| `combat_danger` | Combat is active and observed player HP is at or below 25% | Current enemy and rounded player HP percentage. Unknown HP does not trigger this category. |
| `combat_reviving` | Combat is active with a positive revival timer | Reports recovery, not an ongoing attack. |
| `mastery_count` | A schema-1 mastery snapshot contains `completeSkills` | Number of distinct completed skills. |
| `mastery_remaining` | The mastery snapshot also has a valid total greater than the completed count | Completed, total, and remaining mastery counts. |
| `mastery_all` | Known total equals completed count | Completion of all recorded skill masteries. |
| `level_up` | An observed valid level increases for the same skill between dashboard captures | Skill and newly observed level. Initial capture, switching skills, idle, and native rebuilds do not create a level-up headline. Several gained levels between observations produce one message for the latest level. |
| `special_loot` | An exact special-item loot count increases after a baseline for the same action | Item name and positive count change. Special means the dashboard's existing high-value classifier: rune, efficiency wing/ring, or loot amulet. This is not a generic rarity claim. |
| `rare` | A 1% selection roll succeeds and no rare headline has appeared in the last ten minutes | Exceptional fictional messages. No guarantee that one will appear in a session. |
| `_sources` | Attribution for every selected headline | Random fictional newspapers, radio stations, social feeds, and forums, including The Ironwood Herald, Goblin Public Radio, QuestTok, Lootstagram, Guilddit, and The Guild Group Chat. These are labels, not network sources. |

## Selection and timing

- A headline remains for at least 14 seconds, or longer for a long line (110 milliseconds per character).
- Observed-event messages take precedence at the next selection. They do not interrupt the line currently being read. The queue holds at most eight messages; unshown events expire after 60 seconds.
- With no queued event, first roll for a rare dispatch (1%). Its ten-minute cooldown is held in memory and resets on page reload.
- If no rare dispatch is chosen, active combat gets a 60% roll for a live report. The current revival/HP state selects the report category.
- Otherwise, a recognized active skill gets a 40% roll for its own category. If that roll fails, choose uniformly from all currently eligible ordinary categories. Therefore active-skill lines may also be picked by the ordinary draw.
- Each category uses a random draw without replacement: every line in that category is used before its next cycle starts. A shared 40-template recent history further discourages repeats across cycles. If every remaining line was recently shown, choose the least recently shown eligible line; never immediately repeat the previous template. This history is held in memory and resets on page reload. Choose a fictional source independently, excluding the previous source.
- An activity, enemy, or revival-state change can select a new line immediately. HP is sampled when selecting the next live report; this is a headline snapshot, not a continuously updated HP readout.
- Pause freezes the current headline, including across skill changes. Resume preserves the remaining reading time. Old queued events still expire.
- The ticker is updated by visible Status dashboard renders. It does not detect events while the page is closed or hidden, does not replay offline history, and does not scan historical logs. The first observed state establishes a baseline.

## Data safeguards

Player names come from the existing native/cached player-name reader. No lookup is triggered. Mastery totals are captured only when the full supported native mastery list is mounted; older snapshots without a total can produce a completed count, but never an invented remaining count. Mastery messages describe cached progress, not necessarily a just-earned mastery.

Loot baselines reset when the action changes or becomes idle. Missing loot panels preserve the baseline; approximate counts are not treated as exact gains. Initial accumulated loot is not announced as a new drop. Collection decreases do not produce drop messages. Newly appearing special items can count as drops only after the same action already has a loaded loot baseline.

Names and values are inserted literally and rendered as escaped text. The ticker does not execute content from JSON or player names.

## Placeholders

| Placeholder | Supplied to |
| --- | --- |
| `{player}` | Every category; falls back to `Our local hero`. |
| `{skill}` | Active context or observed level-up. |
| `{enemy}` | Combat context; current action's enemy name. |
| `{hp}` | Low-health combat reports only. |
| `{mastered}` | Mastery progress categories. |
| `{total}`, `{remaining}` | Mastery categories requiring a known total. |
| `{level}` | Observed level-up events only. |
| `{item}`, `{amount}` | Observed special-loot events only. |

Use only placeholders that the category supplies. Add lines as nonempty JSON strings; keep humor playful and avoid describing fictional jokes as real balance changes or official announcements. Run `npm run build` after editing the library, then run the project checks.

## Presentation

Portal colors, a compact category/source line, and an animated entrance accompany each new headline. Reduced-motion preferences disable the entrance animation. A pause/resume button is keyboard accessible. The rotating text is deliberately not an automatic screen-reader live region, to avoid repeated unsolicited interruptions.

Source labels are fictional attribution for the shared headline library. They do not fetch real posts or imply publication by real outlets. Add or rename them in `_sources`; categories continue to decide which headlines are eligible.

## Library size (v1.13.136)

544 unique headline templates across 38 categories, plus 20 fictional source labels. Every headline category has at least 12 lines. Player names and other substitutions are variants of a template, not additional headlines.

## Outlet identities

The banner's left brand block displays the selected outlet's name and colored SVG emblem; the category remains above the headline. On phones, the outlet and pause button occupy a compact top row so the headline retains full width. All 20 outlets have different glyphs. Short names, icon keys, and accent colors live in [`src/content/news-outlets.json`](../src/content/news-outlets.json); the full `_sources` label is retained as a tooltip. Glyph paths live in `NEWS_OUTLET_ICONS` in `src/apps/status/news.js`.

Outlet profiles also define a `family` (wordmark typography), `shape` (emblem silhouette), and `secondary` accent color. Newspaper wordmarks use serif type; broadcasts use spaced capitals; social outlets use compact bold lettering. Custom two-tone SVG fields replace the generic outlined icon boxes.

The outlet accent also colors the banner rail, category label, and subtle one-pixel countdown. Pause freezes the countdown; reduced-motion preferences hide it.
