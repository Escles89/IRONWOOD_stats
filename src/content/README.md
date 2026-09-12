# Ironwood Dispatch

Edit `news-lines.json` to add or change ticker headlines. Each category contains an array of nonempty strings. `general`, `idle`, and `combat` are shared categories; skill categories use the exact displayed skill name, such as `Woodcutting` or `Two-handed`.

These are fictional in-world headlines, not official game announcements. Active skill and combat lines are favored over general headlines. Lines rotate after at least 14 seconds without consecutive repeats. The pause button freezes the current line; reduced-motion preferences disable transition effects.

The build embeds the JSON into the userscript, so the ticker needs no network requests. Run `npm run build` after editing the library.

Use `{player}` in a line to insert the locally known player name. It falls back to “Our local hero” when no name is available. Names are inserted as text, and this does not trigger profile lookups. Keep jokes playful and directed at fictional adventuring habits.

See [`docs/news-ticker.md`](../../docs/news-ticker.md) for all categories, event conditions, selection probabilities, supported placeholders, and data limitations. `_sources` holds the fictional outlet names.
