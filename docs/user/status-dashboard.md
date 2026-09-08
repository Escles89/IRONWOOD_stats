# Status dashboard

Open **Status** above Inventory in Ironwood’s sidebar. It combines your current activity, pending loot, supplies and daily progress. On desktop the panels share two columns; on a phone they stack.

The **book** beside the money bar opens the illustrated in-game guide. It includes a dashboard example, chapter navigation, expandable panel explanations and an indicator legend. Examples are labelled and do not perform actions. The **sliders** open Settings. Both controls stay available on native game pages.

## First visit

1. Visit Inventory, Quests, Adventure, Taming, Attunement and Guild normally to populate their saved information. Visit House → Automate for production details.
2. Open Settings to choose potion types, warning thresholds and five daily quest skills.
3. Enable automation if you want Claim controls or automatic daily work. Enable fallback lookups as well for daily quests and map creation. Both switches start off.

Settings save automatically in this browser. Unknown values mean information is missing, not that a balance is zero.

## Current Action

The item or enemy identifies the activity. Its level is separate from your skill level. **XP/h** is the native rate; **87% XP** means 87% earned toward the next skill level.

For non-combat actions, the blue bar tracks the action cycle and the green bar tracks skill XP. Combat shows fighters, health, attacks, healing and revival; see the [combat guide](combat.md). An idle character sees **No action in progress**, while the other panels remain available.

Finite queues add a compact line for finish time, loot, queued amount and inventory owned. Crafting combines its loot information here instead of repeating Current Loot. Queued work is not inventory you already own.

Materials show the available supply needed to continue. Consumables separate **Equipped** from **Stored** reserves. Stardust and Mastery Contracts are stored-only; Stardust appears for crafting.

### Action indicators

| Indicator | Meaning |
| --- | --- |
| Green activity spinner | An action is running. |
| Gray / gold mastery | Mastery is incomplete / achieved for this skill. |
| Location icon | Village, Outskirts or Dungeon, when known. |
| Blue adventure, event or trial badge | An active bonus matches the current skill. Trial participation provides +10% XP. |
| Green / amber / red clock | Enough crafting time / a short queue / an urgent queue. |
| Amber / red materials warning | Required materials are low / urgent. |
| Red activity icon and skull | The character is reviving after defeat. |

Current Action retains its larger badges. Away from Status, compact activity, queue and material indicators appear beside money. The full badge group stays in Current Action while Status is open.

## Loot, quantities and claims

**Current Loot** lists pending items and saved inventory counts. Coins are excluded from “items waiting.” The dark cyan **Claim** button uses Ironwood’s inventory artwork. Hover for its action name; keyboard and screen-reader labels are retained.

Claim collects through native controls and resumes the action when automation is enabled. Confirmed loot additions and visible material consumption update saved inventory locally. Normal Inventory visits reconcile purchases, trades and other changes.

Full counts appear when space permits. Narrow panels can show **11.7K**, with a smaller white suffix; the full observed value remains available in a tooltip. Quantity animations use underlying changes: **+5** floats up, and a loss moves down. Rounded source values are retained as rounded internally rather than expanded into invented precision.

A blue two-arrow spinner means a claim or automation is processing. A green check can confirm completion. Disabled Claim buttons can mean automation is off, no eligible task is known, or a collection is already running.

## Status rows

Feature icons and titles align at the top. Right-side controls are also top-aligned with a small inset. Row titles use regular 16px text; separate numerical values use 12px text. Small 8px dividers separate groups, while each resource icon stays beside its value.

| Row | Details and indicators |
| --- | --- |
| Challenges | Region and reward-skill icons identify the configured selection; the scroll count is the available supply. A green check means no further automatic starts are available because scrolls are exhausted with buying off, or auto-completes are exhausted, and no active challenge is waiting. An amber warning identifies a blocked challenge when cancellation is off. Claim starts the configured loop; its recap contains confirmed totals and remaining auto-completes. |
| Daily quests | The fraction is quests completed today, not the number of selected skills. A check means today is complete. Pending means the saved daily progress is not complete; a spinner means automation is processing. Choose the five preferred skills in Settings. |
| Adventure | The map and countdown describe a running adventure; RP and maps created today are separate resources/counters. A blue hourglass means running; green zZ means a stored map is ready to start. A check means daily map creation is complete, not that an adventure is running or finished. Running/ready-to-start indicators take priority. |
| Taming | The selected expedition and Pet Snacks are shown together. Claim collects expedition loot. A yellow shaking egg identifies ready Hatchery/Ranch eggs; the loot Claim button does not hatch them. |
| Attunement | Region and selected skill icons sit together, followed by a subtle divider and right-aligned Tribute balances. These are supplies, not claimable loot totals. Claim collects selected slots’ loot. Amber warns about low Tribute independently of the collection control. |
| Guild event | Green hourglass: available. Blue hourglass: your contribution is active, with your participation timer. Green check: your contribution time is over; the countdown now describes the overall event. Amber hourglass: cooldown, with time until the next event and its type. |
| Guild trials | Blue hourglass: your trial participation is active. Green check: trials are available to join or completed—read the row text. Amber hourglass: the observed participation timer has expired. Your participation deadline is separate from the guild trial-period deadline. |

Guild indicators are gray when unavailable and dashed gray when participation needs checking. Open Guild Events or Trials to update them. Low RP and Tribute warnings can appear alongside an active indicator and do not mean the activity has stopped. Only matching skills receive the adventure, event and trial badges in Current Action.

Linked rows open their native game pages; Daily quest preferences are in Settings. Disabled Claim controls can indicate automation is off, no eligible work is known, or an operation is already processing. Expand a row in the in-game Guide to see its actual icon designs beside these explanations.

## Potions and House production

Potions separate equipped quantities from stored inventory. **Settings → Potions** adds Regular, Super, Divine or All types. This changes the display; it does not buy, equip or drink anything.

The **Automations** panel lists Structure, Making, Loot and Queued. Production and queue values are projected from the last observed state, rather than fetched on every tick. Its age describes that snapshot. Visit House after changing a recipe or queue. Claim collects the structures through the game; see [automations and recaps](automations.md).

## Warnings and settings

| Setting | Default / behavior |
| --- | --- |
| Queue warning | Amber below 60 minutes; red below 10. |
| Material warning | Amber below 1,000; red below 500 of an individual material. |
| Low RP / regional Tribute | Warn below 10,000. |
| Show multiplayer control | Shows Ironwood’s native Multiplayer menu; does not open it. |
| Debug | Shows tracked values, cache observations and background-page activity. Off by default. |

Set warning thresholds under **Settings → Warnings**. Zero disables a threshold; disabling amber also disables its urgent level. Low supplies are separate from whether an activity is running or claimable. Unknown balances do not trigger low-balance warnings.

Settings use full-width sections on mobile, with scrolling content and a persistent heading and Done control. The native Traits page is also grouped by region while keeping each skill’s traits together.

## Saved data, versions and help

Usable cached information stays available even when old. Known countdowns and production advance locally; normal game navigation supplies new observations. Background reads are a fallback for missing or incompatible data, or an explicit refresh, and require the lookup switch. Daily automation and requested claims have their own workflows. See [cache and refresh](cache-and-refresh.md).

The small subtitle under Status shows the installed version and latest known public version, including when a local build is ahead. A green arrow beside money appears only when the public release is newer. Tampermonkey manages installation through Greasy Fork; the indicator only reports availability.

For missing values, disabled claims or synchronization failures, use [troubleshooting](troubleshooting.md). The Debug panel can show the last observation, local writes and the next known trigger without initiating a lookup of its own.
