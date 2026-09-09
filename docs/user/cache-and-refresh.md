# Cache and refresh

Status prefers information already available in the game, then reliable local calculations. **Allow fallback lookups** controls background information pages. It starts off; visiting a native page still updates saved information while it is disabled.

## What updates a value?

| Source | Examples | Behavior |
| --- | --- | --- |
| Visible game interface | Current action, loot, equipped supplies | Reads what the native page has rendered. |
| Natural navigation | Inventory, Adventure, Guild, Taming | Updates the saved snapshot as the native page loads. |
| Local calculations | Known countdowns, House production, confirmed loot additions | Advances from observed data without opening another page. |
| Requested claim | Challenges, Attunement, Taming, House | Opens or uses the native controls required for that action and confirms the result. |
| Fallback read | Missing or incompatible snapshots | Allowed only when fallback lookups are enabled. |
| Explicit refresh | User-requested cache synchronization | Requires fallback lookups and can reload otherwise usable snapshots. |

**Age alone does not schedule a lookup.** Usable old snapshots remain visible. There is no routine hourly Inventory or four-hourly Attunement refresh. A known timer can expire locally, but expiration alone does not prove a new game state; open the corresponding page to confirm it.

## Where to update each panel

| Panel | Native page |
| --- | --- |
| Inventory and stored potions | Inventory |
| Equipped supplies | Current skill or Equipment |
| Daily quests | Quests |
| Adventure, RP and maps | Adventure, including the running map details |
| Challenges and auto-complete allowance | Challenges |
| Taming loot, Pet Snacks and eggs | Taming; Hatchery or Ranch for their timers |
| House production | House → Automate |
| Regional Tribute and selected skills | Attunement |
| Event contribution | Guild → Events |
| Trial participation | Guild → Trials |

Daily quests and map creation are a separate scheduled workflow. With **both** switches enabled, pending daily work can open its native page, while completed work waits for the next reset. Failed or incomplete attempts wait at least 15 minutes before retrying. RP/storage shortages wait for a new native observation or daily reset. See [automations](automations.md).

## Accuracy and synchronization

Exact native quantities are retained where available, even if the display uses K or M. Rounded text alone is not treated as an exact count. Unknown values remain unknown until a usable observation arrives.

Confirmed loot claims add quantities locally, and visible material use reduces supplies. A normal Inventory visit reconciles spending and trading. Challenge and Attunement batches synchronize the main game before their recap; a failure to sync is reported separately from accepted rewards. Taming collection restores the running skill page before returning to Status.

## Debug

Enable **Debug** in Settings to inspect live values, saved snapshots, local writes and recent background-page activity. Snapshot time and cache-write time can differ: updating a balance locally does not pretend a full page was just read. Listed age limits are diagnostic, not a promise of scheduled polling.

Debug updates at most once per second while visible. Only expanded sections render full details. Opening it performs no additional lookups.

### Refresh everything now

Use the refresh icon at the right of the **Status** panel’s title bar for a one-time refresh of every cache source. It works with fallback lookups off, shows a spinner while busy and reports any failed sources. This reads data only; it does not run quests, create maps or claim rewards. Your fallback setting stays unchanged.
