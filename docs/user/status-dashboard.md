# Status dashboard

Open **Status** above Inventory in Ironwood’s sidebar. It combines your current activity, pending loot, supplies and daily progress. On desktop the panels share two columns; on a phone they stack.

The **book** beside the money bar opens the illustrated in-game guide. It includes a dashboard example, chapter navigation, expandable panel explanations and an indicator legend. Examples are labelled and do not perform actions. The **sliders** open Settings. Both controls stay available on native game pages.

## First visit

1. Visit Inventory, Quests, Adventure, Taming, Attunement and Guild normally to populate their saved information. Visit House → Automate for production details.
2. Open Settings to choose warning thresholds and five daily quest skills.
3. Enable automation if you want Claim controls or automatic daily work. Enable fallback lookups as well for daily quests and map creation. Both switches start off.

Settings save automatically in this browser. Unknown values mean information is missing, not that a balance is zero.

## Current Action

Select a non-interactive area above Materials and Consumables to open the Skills modal, including the action image, combat display and empty space. The Materials and Consumables sections do not open Skills. Consumables, mastery, planner and other existing controls keep their own actions. You can also focus the current-action area and press Enter or Space; closing Skills returns focus to it. Selecting text does not open the modal.

The item or enemy identifies the activity. Its level is separate from your skill level. **XP/h** is the native rate; **87% XP** means 87% earned toward the next skill level.

For non-combat actions, the item icon fills from bottom to top during each action cycle. The green XP bar uses the shared labelled-bar layout and shows XP earned toward the next level / XP required, with XP/h on the right. Large values use K, M or B; hover for exact totals and the percentage. If totals are unavailable, the known percentage remains visible. Combat keeps its existing display of fighters, health, attacks, healing and revival; see the [combat guide](combat.md). An idle character sees **No action in progress**, while the other panels remain available.

Finite queues show a progress bar with completed actions / total queued and time remaining. Crafting shows Loot waiting and Owned beneath the bar instead of repeating Current Loot. Crafting bonuses can make loot quantities differ from completed actions; queued work is not inventory you already own.

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
| Attunement | Regional Tribute icons and balances precede the selected skill, separated by a divider. Known pending shards follow the skill. Tribute is a supply; the shard count is pending loot. Claim collects selected slots’ loot. Amber warns about low Tribute independently of the collection control. |
| Guild event | Green hourglass: available. Blue hourglass: your contribution is active, with your participation timer. Green check: your contribution time is over; the countdown now describes the overall event. Amber hourglass: cooldown, with time until the next event and its type. |
| Guild trials | Blue hourglass: your trial participation is active. Green check: trials are available to join, your participation is complete, or all guild trials are complete—read the row text. Reaching your participation deadline changes the row to participation complete while the guild trial period remains open. Your participation deadline is separate from the guild trial-period deadline. |

Guild events and trials show countdown bars for participation, event end, cooldown and trial reset when those deadlines are known. Filled bars show the time remaining against the duration reported by the game. A patterned track means the deadline is known but the total duration is unavailable. Countdown bars disappear when their deadline passes.

Guild indicators are gray when unavailable and dashed gray when participation needs checking. Open Guild Events or Trials to update them. Low RP and Tribute warnings can appear alongside an active indicator and do not mean the activity has stopped. Only matching skills receive the adventure, event and trial badges in Current Action.

Linked rows open their native game pages; Daily quest preferences are in Settings. Disabled Claim controls can indicate automation is off, no eligible work is known, or an operation is already processing. Expand a row in the in-game Guide to see its actual icon designs beside these explanations.

## Skills and planning

Open **Skills** beneath Status for the full page or use the grid beside Quick Loot for the modal. Both show ranks, XP estimates, remembered actions and the recipe planner. The active row is pinned first with **Stop & Loot**, which collects and leaves you idle. **Start** runs a remembered action; **Edit** changes its quantity preference without starting. See [Quick Loot and Skills](quick-skills.md).

**Recipe Calc** shows a target owned quantity, material coverage, shortages and a recipe tree. **Edit** opens the combined calculator/planner. **Save & run plan** enables progression through ready gathering/crafting steps when automation is on and the tab is visible. The compact Planned overview stays on Status; full controls and requirements are in Skills. See [Recipe Calc](shopping-list.md) and [recipe plans](recipe-plan.md).

A separate [Planned next action](planned-next-action.md) card supports one manually saved action when no recipe plan is active. Saving a manual action replaces a recipe plan and vice versa.

## Attunement passive progression

The Attunement row also shows a small upward arrow when a passive improvement is affordable. Its tooltip distinguishes **Passive improvement available** from **Passive improvement available after collection**. This includes first unlocks and further passive levels, independently of the recommended progression target.

On the native Attunement screen, **Passive progression** recommends one target per region. It favors the lowest passive levels, then the fewest additional shards needed, then set-bonus completion. Exact ties favor your currently attuned skill. Each compact target row shows its passive level, an action badge, owned and pending shards, and any set-bonus gain. The thin shard bar uses a solid segment for owned shards and a striped blue segment for pending shards. “Keep attuning” means the current regional skill is already the recommendation; your main action does not need to change.

If the target is affordable, purchase it using the native Passives menu first; the recommendation updates after the game confirms the change. Pending shards require collection first. Defense shares its balance and passive levels across regions, so recommendations are alternatives rather than a promise that the same shards can fund several upgrades. No upgrades or slot changes are performed automatically. Shortfalls are shard counts, not time estimates.

## Skill Mastery tracker

Click the **mastery symbol** in Current Action or the **Mastery Contract** row to open the current skill’s mastery requirements. These shortcuts leave your tracked mastery unchanged. The **Mastery** row under Status opens the tracked skill; the idle symbol and shortcuts without an available current skill also use that selection. Choose one **Skill Mastery** to see its native requirements, contributed items, owned inventory, **Pending loot**, **Missing now** and **Missing after collection**. For 100 required, 20 contributed, 50 owned and 10 pending, 30 are missing now and 20 would remain after collection. Taming comes first in the game’s skill order. The header shows the displayed skill’s icon and name under **Skill mastery tracking**. Small native mastery badges show the masteries you have obtained, with the obtained total below. Use the gear beside **Refresh** to choose an unfinished skill from a compact list. Materials use a compact list with native resource icons and six aligned quantity columns. Covered material rows and satisfied XP/coin requirements are gray, leaving shortages prominent. Unknown or inconsistent balances remain unmuted. On phones each row wraps below the item name, keeping all six labelled quantities; the modal scrolls while its close controls remain visible. Escape closes it and returns focus to the symbol. The **Total materials** row uses the same progress bar as the dashboard: blue for contributed materials and green for additional coverage from owned inventory and Current Loot. It summarizes the skill displayed in the modal and excludes XP and coins. XP and coins use compact rows with exact balances and requirements, a checkmark when covered, and the shortfall available on hover or to screen readers; having the materials does not mean they have been contributed or that mastery is complete.

Your selection and observations stay in this browser for the current character and game mode. Completed masteries are hidden from the skill choices. If your saved selection becomes complete, choose another unfinished mastery. Completion comes from the native completion flag, never from having enough materials.

Contribution, inventory and Current Loot observation ages are shown separately. A contribution change makes the combined shortfall incomplete until **Refresh** reads both balances together. This also handles Mastery Contracts, which can increase contributions without consuming inventory. Refresh uses the game's read-only synchronization and works independently of automation and fallback lookup settings. Old observations alone never trigger a background read. An unavailable source or invalid item identity produces **Unknown**, not zero.

**Open native mastery page** lets you inspect the game's mastery screen. The tracker never submits materials, spends coins or claims mastery. **Pending loot** includes only the current main action’s rewards. House production, Taming expeditions, Attunement and unfinished queues are excluded. Loot remains separate from owned inventory until the game confirms collection.

**Missing after collection** is conditional on collecting that loot. A verified empty source counts as zero; an unavailable or partially observed source does not. With partial evidence, the tracker shows how much known loot covers and labels the remaining calculation incomplete. Historical loot retains its observation age and a “last observed” label, without claiming an exact after-collection total. During collection or synchronization the combined balances remain incomplete, and Refresh waits for collection to finish.

## Traits

The compact **Traits** row in Status follows set-bonus milestones across all traits: level **100**, then **115**, then **130**. Each equipped Trait shows its name, icon and progress bar, and an amber **Switch** badge tells you when a training slot needs changing. Select the row to open the Trait training modal with recommendations, region priority, and a compact set table. There is no separate dashboard card. The table distinguishes **Ready to claim** from **Claimed**.

Choose a **Region priority** to train that region's replacements first. All regions still finish the current milestone before the next begins. Your preference is saved for this character and game mode.

An equipped trait below the milestone stays in place. When it reaches the milestone, or a training slot is empty, the modal recommends the lowest-XP eligible unlocked trait. Each suggestion has a manual **Switch to** or **Equip** button. The Status summary warns when a training slot needs changing or a set bonus is ready to claim; select the summary to open the modal. Earned Trait bonuses remain active after unequipping.

Use each set's **Claim** button to claim its bonus. These manual Trait controls work independently of the daily automation setting. Unclaimed sets do not hold up the next training milestone. Once every trait reaches 130, the panel shows training complete and retains outstanding claims.

XP updates during normal actions without collecting loot. During a temporary game sync, the row shows **Updating** with the last observed progress; changes remain disabled until fresh data returns. If no progress has been observed, **Check progress** opens the modal with refresh and help controls. **Trait training paused** explains when no action is running or the equipped Sigil supplies no Trait XP Gain. Locked traits remain unfinished requirements but are never suggested for equipping.

Each change checks current game state first. If unequip succeeds and equip fails, the panel reports the empty slot and offers **Retry equip**. If the outcome cannot be checked, **Refresh** must succeed before another change. Refresh reads Trait state without stopping or collecting the current action; **Open Traits** opens the game's own page.

## Consumables and House production

On Status, select a consumable in Current Action to see all supplies in its category, with separate equipped and stored amounts. Select **Mastery Contract** to open your Skill Mastery tracker. Close an overview with **Done** or Escape to return to Status.

Open **Equipment → Consumables**, between Equipment and Runes. The **Equipped consumables** rows retain the game's item controls and show quantities, current charges and approximate time remaining. Select a row to manage that consumable.

Potion, sigil and brew timers estimate active use from their remaining charges and native item durations, including known tome modifiers. Paused supplies show how much use they hold rather than a running countdown. Food and keys estimate time from observed consumption after a few uses; refills, action changes and observation gaps reset that estimate. Timers assume the same activity continues and exclude stored reserves, so combat interruptions and changes of activity can change the result.

**Consumable supplies** has a separate panel for each category: Potions, Sigils, Food, Keys and Brews. Equipped consumables stay in their own panel above the supplies. Unknown quantities are labelled, while an observed zero shows **No reserve**. The separate potion panel is no longer on Status.

The **Automations** panel lists Structure, Making, Loot and Queued. Production and queue values are projected from the last observed state, rather than fetched on every tick. Its age describes that snapshot. Visit House after changing a recipe or queue. Claim collects the structures through the game; see [automations and recaps](automations.md).

## Warnings and settings

| Setting | Default / behavior |
| --- | --- |
| Queue warning | Amber below 60 minutes; red below 10. |
| Material warning | Amber below 1,000; red below 500 of an individual material. |
| House queue warning | Amber below 24 hours; red below 1 hour. |
| Regional Tribute | Amber below 10,000 by default. |
| Research Points | Fixed: amber below nine map costs plus 16,000 RP; red below 16,000 RP. An unknown map cost leaves the amber threshold unknown. |
| Show multiplayer control | Shows Ironwood’s native Multiplayer menu; does not open it. |
| Debug | Shows tracked values, cache observations and background-page activity. Off by default. |

Set queue, material and Tribute thresholds under **Settings → Warnings**. RP thresholds are fixed. Zero disables an editable threshold; disabling amber also disables its urgent level. Low supplies are separate from whether an activity is running or claimable. Unknown balances do not trigger low-balance warnings.

Settings use full-width sections on mobile, with scrolling content and a persistent heading and Done control. The native Traits page is also grouped by region while keeping each skill’s traits together.

## Saved data, versions and help

Usable cached information stays available even when old. Known countdowns and production advance locally; normal game navigation supplies new observations. Automatic fallback reads for missing or incompatible data require the lookup switch. The Status refresh icon explicitly reads every cache source even with that switch off, without running daily chores. Skills ranks use a separate hourly cache while Skills is open and visible. Daily automation and requested claims have their own workflows. See [cache and refresh](cache-and-refresh.md).

The sidebar logo shows the installed version as **with status panel v…**. Open Settings for the update control, which checks immediately and shows Checking…, Up to date, Update available or Check failed · Retry. Selecting it checks again and opens the userscript installer only after confirming a newer public release. Tampermonkey manages installation through Greasy Fork.

For missing values, disabled claims or synchronization failures, use [troubleshooting](troubleshooting.md). The Debug panel can show the last observation, local writes and the next known trigger without initiating a lookup of its own.
