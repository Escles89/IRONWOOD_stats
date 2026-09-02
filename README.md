# Ironwood RPG Status Page

A Tampermonkey userscript that adds a Pancake-Scripts-compatible **Status** page to Ironwood RPG.

The public installation file is `ironwood-stats.user.js`. It contains the full
implementation; the separate loader is only for local development.

## Features

- Live current action, Village/Outskirts location, compact action/skill levels, native XP/hour, green skill-level progress, finite-queue finish estimate, action materials, and consumables with equipped/stored quantities.
- Current loot table with pending and cached inventory quantities, plus native collect-and-continue control.
- Daily quest status and a modal for selecting five quests for Ironwood auto-completion.
- Cached Adventure, Guild Event, and Guild Trial status.
- Adventure Research Points, daily map creation limit, daily reset, and map-storage count.
- Selected Attunement skills with Forest, Mountain, and Ocean Tribute balances in compact `K` units, plus native collect-all loot control.
- Challenge Scroll status with configurable region/reward skill and button-triggered start, auto-complete, and reward claim automation.
- Taming status with the selected expedition, current Pet Snack inventory, and native expedition-loot collection.
- Automation tracking for all structures, including the selected action, projected loot, and queue progress.
- Divine Potion table with separate equipped and stored quantities.
- Responsive two-column layout using the live Ironwood/Pancake visual style.

The script reads Ironwood's rendered interface and runs alongside Pancake-Scripts. User-requested automations use only Ironwood's rendered native controls. **Enable automation** controls every game-changing action, while **Enable cache lookups** controls background information retrieval. Both settings are disabled by default. Cached information can still update without a background lookup when its native page is opened manually.

## Installation

1. Open Tampermonkey and create a userscript.
2. Replace the editor contents with [`ironwood-stats.user.js`](./ironwood-stats.user.js).
3. Save it and reload Ironwood RPG.
4. Open **Status** above Inventory in the sidebar.

The old `/stats` route is migrated automatically to `/status`.

## Publishing

Release and GitLab synchronization instructions are in
[`PUBLISHING.md`](./PUBLISHING.md). The repository pipeline validates the
userscript metadata, JavaScript syntax, and Greasy Fork size limit.

## Data and synchronization

Live action and loot data come from the currently mounted skill page. Other data is loaded cache-first through temporary same-origin frames:

| Data | Source | Normal refresh |
| --- | --- | --- |
| Quests | `/quests` | Daily or when missing |
| Inventory | `/inventory` | Hourly |
| Equipped consumables | `/equipment` | Once when missing; afterward updated passively from the live action or Equipment page |
| Adventure and maps | `/adventure` | Daily at the 02:00 CET reset, after map automation, or when missing |
| Challenges | `/challenges` | Daily at the 02:00 CET reset, after a challenge run, or when missing; background lookup is skipped while the cached Scroll count is zero |
| Taming | `/skill/15` | Hourly when checked, after collection, or passively when opened manually |
| Automations | House → Automate | Once when missing, passively when opened manually, then locally projected until the longest queue should finish (24-hour fallback) |
| Attunement | `/attunement` | Every four hours (at most six automatic lookups per day) |
| Guild event | `/guild` → Events | Hourly while participating to update personal earned XP; otherwise at the known state expiry (24-hour fallback) |
| Guild trials | `/guild` → Trials | Hourly while active; otherwise at the known state expiry (24-hour fallback) |

When **Enable cache lookups** is on, Status data refreshes automatically when missing, stale, or expired. When it is off, no temporary background page is opened. Every native source page passively refreshes its corresponding cache from the already-rendered DOM when opened manually, without making a second request. Quest capture waits for the same fully rendered state used by Adventure capture. The Status header Preferences control contains both global toggles plus Daily Quest and Challenge configuration. Daily Quest preferences are stored by generic skill, so they continue to apply when that skill's specific quest action changes. When automation is disabled, all game-changing automation and action buttons are disabled. Challenge automation defaults to **Mountain** with **Defense** as the XP reward skill. Cached data is stored in `localStorage` under `iw-stats-cache-v1`; quest, challenge, automation, cache-lookup, and equipped-consumable preferences use their own `iw-stats-*` keys.

Guild-event participation is detected by caching the signed-in character name once from the native Profile page and matching that exact name in the event Participants list. The matching row supplies personal XP and participation time; no participant is inferred from rank, item icon, or timer length.
While participation is active, Current Action shows the guild-event sword in a blue badge. It is hidden during cooldown and when the signed-in character is not participating.
The guild-event badge is further limited to actions in the event's skill group: Gathering, Crafting, or Combat. Participation remains visible in Status even while the current action does not contribute.
An active Adventure similarly receives a blue animated Status indicator, a minute-precision countdown, and an Adventure badge in Current Action. Both icons disappear when no Adventure is running.
When Adventure is idle but a stored map is available, its Status row instead shows a green `zZ` idle badge to indicate that an Adventure can be started.
Current Action orders its badges as Mastery, active events, location, action-active state, and warnings. Warning badges remain at the far right.
Active Guild Trials use the same event treatment: a blue animated Status indicator with a minute-level countdown and a blue Guild Trials badge in Current Action.
The material warning is orange below 1,000 remaining and red below 500. Its tooltip identifies every affected material and the exact available count. The queue timer warning shares the same right-aligned warning area.
Dashboard countdowns are displayed at hour-and-minute precision; underlying expiry timestamps retain their full precision.

The Current Action card contains the action, materials, and consumables, while Current Loot remains a separate adjacent panel. The consumables table shows separate Equipped and Stored quantities. Stored-only consumables such as Stardust and Mastery Contracts show a single quantity in the Stored column rather than duplicating it as equipped. Stardust is omitted for gathering skills because those actions do not use it.

The native Multiplayer shortcut is hidden from the sidebar and remains available through **Automation Preferences → Interface**. Crafting quantity dialogs also gain a native-sized **Craft All** button. When clicked, it reads Ironwood's current Craftable amount, fills that exact quantity, and submits through the native Craft control. Because it is an explicitly clicked dialog action, it remains available independently of the background-automation toggle.

When Ironwood exposes a finite action queue, the right side of Current Action presents a compact three-line summary: a small label, the native predicted remaining time, and compact progress. For finite crafting actions, the third line uses concise loot, queued, and owned values and the separate Current Loot panel is omitted. A clock badge appears after the active indicator when less than one hour remains: amber below one hour and red below ten minutes.

Mastery Contract shows the live contract count from the active skill page in the Stored column, falling back to the inventory cache when the native row is unavailable. The active skill's native Mastery `current / cap` value appears as smaller secondary text beside its name. The progress is informational only. The mastery badge is transparent gray until the skill is complete, then becomes gold; its state and contract visibility are controlled by the completed Skills list on Ironwood's Mastery page. Opening Mastery passively refreshes that list; when cache lookups are enabled it is also loaded once when missing.

Daily Quest, Adventure, and Challenge caches use Ironwood's fixed 02:00 CET boundary (01:00 UTC). Other caches retain the individual refresh rules shown above. With cache lookups disabled, expired values may remain visible for reference but no background page is opened to replace them.

## Local development loader

Install `ironwood-stats-loader.user.js` in Tampermonkey and disable the full installed copy of `ironwood-stats.user.js`. The loader uses `@require` to execute the repository copy directly, so subsequent edits only require refreshing the Ironwood tab.

In Chrome, open **Extensions → Tampermonkey → Details** and enable **Allow access to file URLs**. Tampermonkey may also expose a local-file access option in its own settings; enable it if present. The loader contains an absolute path for this checkout and must be updated if the repository is moved.

## Challenge automation

The Challenges row shows the cached number of available Challenge Scrolls and remaining Ironwood auto-completes. Its **Run** button opens a temporary same-origin Challenges page, selects the configured region, starts the currently selected challenge tier, uses an available auto-complete, selects the configured reward skill, and claims the reward. It repeats up to `min(scrolls available, auto-completes remaining)`. The default is Mountain + Defense.

The displayed `used / limit` Auto Challenge Completes value is converted to a remaining allowance with `limit - used`. Accounts without an auto-complete allowance run zero challenges. The run is bounded and fails closed if no scroll or auto-complete remains, a native control does not appear, or the scroll reduction cannot be confirmed. Region and skill can be changed from **Automation Preferences**; only skills supported by the selected region are offered.

### Cached Adventure fields

`collectAdventure()` stores numeric fields intended for later automation:

- `researchPoints`: current RP balance;
- `mapCost`: RP required to create the displayed map;
- `dailyMapsCreated` and `dailyMapsLimit`;
- `mapsStored` and `mapStorageLimit`;
- `dailyReset` and `expiresAt`;
- current Adventure state and weekly limits.

## Automatic map creation

When Adventure data refreshes, `automateMaps()` uses Ironwood's native **Create** control until the daily map limit is reached. After every creation it re-reads RP from the **Create Map** requirements card and confirms both the daily counter increase and the full RP-cost deduction. Legendary maps are retained; Common, Uncommon, Rare, and Epic maps are sold through the native **Sell** control. The cached run records starting RP, remaining RP, and RP spent.

The run is bounded to 12 creations and fails closed if storage is full, RP is insufficient, a control is unavailable, rarity cannot be read, or a create/sell counter change is not confirmed. Its result is cached in `adventure.mapAutomation` with created, sold, kept, completion, stop reason, and timestamps. The Status page displays **Complete** once `dailyMapsCreated` reaches `dailyMapsLimit`; an active Adventure still takes precedence.
