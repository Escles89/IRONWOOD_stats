# Ironwood RPG Status Page

A Tampermonkey userscript that adds a Pancake-Scripts-compatible **Status** page to Ironwood RPG.

The public installation file is `ironwood-stats.user.js`. It contains the full
implementation; the separate loader is only for local development.

## Features

- Live current action, Village/Outskirts location, compact action/skill levels, native XP/hour, green skill-level progress, finite-queue finish estimate, and consumables.
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

The script reads Ironwood's rendered interface and runs alongside Pancake-Scripts. User-requested automations use only Ironwood's rendered native controls. The global **Enable automation** preference can turn off every game-changing action while leaving status collection active.

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
| Equipped consumables | `/equipment` | Hourly |
| Adventure and maps | `/adventure` | Up to four hours, or at the daily reset after reaching the map limit |
| Challenges | `/challenges` | Hourly, after a challenge run, or when missing |
| Taming | `/skill/15` | Hourly when checked, after collection, or passively when opened manually |
| Automations | House → Automate | Once when missing, passively when opened manually, then locally projected until the longest queue should finish (24-hour fallback) |
| Attunement | `/attunement` | Hourly |
| Guild event | `/guild` → Events | Expiry-aware, otherwise six hours |
| Guild trials | `/guild` → Trials | Expiry-aware, otherwise six hours |

Status data refreshes automatically when missing, stale, or expired. Opening a native data page manually refreshes its corresponding cache directly from the already-rendered DOM, without making a second request. Status entry uses cached values unless their expiry rules require a refresh. The Status header Preferences control opens the global automation toggle plus Daily Quest and Challenge configuration. Daily Quest preferences are stored by generic skill, so they continue to apply when that skill's specific quest action changes. When automation is disabled, refreshes only read information and all action buttons are disabled. Challenge automation defaults to **Mountain** with **Defense** as the XP reward skill. Cached data is stored in `localStorage` under `iw-stats-cache-v1`; quest, challenge, automation, and equipped-consumable preferences use their own `iw-stats-*` keys.

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
