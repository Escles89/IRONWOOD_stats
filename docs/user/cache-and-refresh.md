# Cache and refresh

Live action and loot come from the current native skill page. Other panels use remembered information from native pages. When **Enable cache lookups** is off, no background information page opens; manually opening a native page still updates its remembered values.

When lookups are on, missing or expired information refreshes automatically. Structure values continue to project locally between refreshes. Expired values may remain visible as a reference while lookups are off.

| Data | Source | Normal refresh |
| --- | --- | --- |
| Quests | `/quests` | Daily or when missing |
| Inventory | `/inventory` | Hourly |
| Equipped consumables | `/equipment` | Once when missing; afterward updated passively from the live action or Equipment page |
| Adventure and maps | `/adventure` | Daily at the 02:00 CET reset, after map automation, or when missing |
| Challenges | `/challenges` | Daily at the 02:00 CET reset, after a challenge run, or when missing; background lookup is skipped while the cached Scroll count is zero |
| Taming | `/skill/15` | Hourly when checked, after collection, or passively when opened manually |
| Automations | House → Automate | Once when missing, passively when opened manually, then locally projected from each structure's own capture time until the longest queue should finish (at most 24 hours). The table age reflects the oldest structure snapshot. |
| Attunement | `/attunement` | Every four hours (at most six automatic lookups per day) |
| Guild event | `/guild` → Events | Hourly while participating to update personal earned XP; otherwise at the known state expiry (24-hour fallback) |
| Guild trials | `/guild` → Trials | Hourly while active; otherwise at the known state expiry (24-hour fallback) |

Daily Quest, Adventure, and Challenge resets use the game's fixed 02:00 CET boundary. Countdown displays generally use hours and minutes; revive timers also show seconds.

The modular release starts a fresh data cache. Expect some panels to show unknown information until you visit their native pages or enable cache lookups. Automation, lookup, quest, challenge, and interface preferences are preserved.
