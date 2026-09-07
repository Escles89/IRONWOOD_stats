# Status dashboard

## Features

- Live current action, Village/Outskirts location, compact action/skill levels, native XP/hour, green skill-level progress, finite-queue finish estimate, action materials, and consumables with equipped/stored quantities.
- Combat actions show both fighters with live HP bars, restrained hit motion, and a brief death animation when an enemy reaches zero HP.
- Current loot table with pending and cached inventory quantities, plus native collect-and-continue control.
- Daily quest status and a modal for selecting five quests for Ironwood auto-completion.
- Cached Adventure, Guild Event, and Guild Trial status.
- Adventure Research Points, daily map creation limit, daily reset, and map-storage count.
- Selected Attunement skills with Forest, Mountain, and Ocean Tribute balances in compact `K` units, plus native collect-all loot control.
- Challenge Scroll status with configurable region/reward skill and button-triggered start, auto-complete, and reward claim automation.
- Taming status with the selected expedition, current Pet Snack inventory, and native expedition-loot collection.
- Automation tracking for all structures, including the selected action, projected loot, and queue progress.
- Potion table with separate equipped and stored quantities. Choose Regular, Super, Divine, or **All types** under **Dashboard options → Potions**. Selections are saved; existing Divine/Super preferences are preserved.
- Stardust is shown only while a crafting skill is active.
- Native Traits rows grouped under Forest, Mountain, Ocean, and shared Defense headers while keeping each skill's traits together.
- Responsive two-column layout using the live Ironwood/Pancake visual style.

The script reads Ironwood's rendered interface and runs alongside Pancake-Scripts. Requested automations use Ironwood's own controls. **Enable automation** controls every game-changing action, while **Allow fallback lookups** controls background information retrieval. Both settings are disabled by default. Cached information can still update without a background lookup when its native page is opened manually.


## Current Action and Loot

Current Action shows the running activity, levels, location, XP per hour, progress, materials, and consumables. With no running action, it says **No action in progress** and the remaining panels stay available.

Consumables have separate Equipped and Stored quantities. Stored-only items such as Stardust and Mastery Contracts appear only under Stored. Stardust is hidden during gathering. The active skill's Mastery progress is informational; the badge turns gold when the skill is complete.

Current Loot shows pending quantities and cached inventory amounts. **Claim** collects and continues through Ironwood's native controls when automation is enabled. Finite crafting queues instead show loot, queued, and owned amounts in Current Action.

Confirmed Current Loot claims and native **Stop & Loot** clicks add the observed loot quantities to the inventory cache immediately, including newly obtained items. Coins remain separate. Existing stored counts update without opening Inventory; failed claims do not add anything. Opening Inventory naturally reconciles other spending and trading. A hidden inventory read is only a fallback when no usable baseline exists, or when you explicitly refresh.

Visible material quantities also update cached inventory when they change, so crafting consumption is reflected without another lookup.

Crafting queues show a green clock when at least one hour remains. The clock turns amber below one hour and red below ten minutes. Material warnings turn orange below 1,000 and red below 500; hover to see affected materials. Badges appear in this order: Mastery, active events, location, activity, warnings.

## Other progress

Daily Quests shows today's completion. Adventure shows active progress, map creation totals, or a green idle indicator when a stored map can be started. Guild event participation is matched to your character; its action badge appears only when your activity contributes to that event. Guild Trials has its own active indicator and countdown.

When your guild event participant row no longer has a timer, your contribution is complete. The Status row shows a green checkmark and your earned XP, with the overall event countdown shown separately. The Current Action event bonus icon disappears when your contribution time ends.

Attunement lists selected skills and tribute balances. Taming shows the selected expedition and Pet Snacks. Challenges shows scrolls and remaining auto-completes. The potion panel separates equipped and stored quantities. In **Dashboard options → Potions**, add types using the selection field, or click a selected type to remove it. Regular and Super potions appear when stored or currently equipped; Divine retains its standard rows. No background lookup is triggered by changing the selection.

Challenge claims wait for loaded counts, the selected region, auto-completion and reward selection. Completion is confirmed only after the reward screen closes, scrolls decrease and used auto-completes increase. Temporary loading screens preserve known counts; a failed claim shows its error instead of silently reporting success.

Traits on the native page are grouped by Forest, Mountain, Ocean, and shared Defense. Enable **Show multiplayer control** under **Dashboard options → Display** to restore Ironwood's native Multiplayer menu in the sidebar. This saved switch controls visibility; it does not open the menu.

The small version label below the top Status title identifies your installed userscript version. Material quantities show the same green increases and red decreases as other quantity feedback.

Guild Trials shows your character’s trial name and participation countdown, separate from the overall guild trial-period deadline. Whole-hour native timers are labeled “About.” The status icon is a blue animated hourglass while participating, a green check when trials are available to join or completed, gray when unavailable, and amber after participation expires. A dashed gray icon means participation has not been checked. Open Guild → Trials to refresh it without background lookups.

The blue Guild Trial badge in Current Action appears only while the running skill matches your active trial. Its tooltip names the trial and the +10% XP bonus. Switching skills hides the action badge; your trial participation and countdown remain visible in the Status panel.

Running adventures show the map’s skill (for example, **Defense Map**) and a live countdown. The Current Action adventure icon names that map in its tooltip. Daily map creation progress remains separate from whether an adventure is running.

The Current Action adventure icon appears only while training the running map’s skill. The Adventure status row continues to show the map and countdown when training a different skill.

Cached data and local calculations take priority over hidden lookups. Opening native pages updates their snapshots. Old but usable records are retained without automatic refresh; known timers and automation production continue to be calculated locally. Hidden reads are reserved for missing or incompatible data with cache lookups enabled, or an explicit refresh. Requested claims may open the native page needed to perform the action.

## Dashboard options

The options button in the Status card opens a compact menu grouped into Display, Automation & data, Potions, Challenges, and a collapsible Daily quests section. Settings save automatically.

Enable **Icons beside money** under **Display** to move the complete Current Action indicator group to the left of the money in the main header while viewing Status. Disable it to return the icons to Current Action. Skill and bonus eligibility rules stay the same in either position.

## Debug panel

Enable **Debug** under **Dashboard options > Automation & data** to show a separate panel below the dashboard. The setting is saved and defaults to off. Expand sections to inspect live and calculated values, raw cache records, or recent background page activity.

Each cached source shows its last write, original snapshot time, and next refresh or trigger. Writes from reliable local count updates are recorded separately from the original full snapshot. Existing older records fall back to their recorded snapshot time until their next write. Cache age limits are shown for diagnosis and do not schedule lookups. The panel identifies disabled lookups, pending startup checks, active background reads, and data waiting for natural navigation or a fallback trigger. Background page history covers the latest 20 reads in the current page session; the version checker shows its separate due time.

Debug refreshes at most once per second while Status is visible, renders full values only for expanded sections, and triggers no background lookups of its own. Turning it off removes the panel and stops its rendering work.
