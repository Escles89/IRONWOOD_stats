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
- Divine Potion table with separate equipped and stored quantities. Enable **Show Super potions** under **Automation Preferences → Interface** to also show Super potions with positive inventory quantities; the preference is saved and defaults to off.
- Stardust is shown only while a crafting skill is active.
- Native Traits rows grouped under Forest, Mountain, Ocean, and shared Defense headers while keeping each skill's traits together.
- Responsive two-column layout using the live Ironwood/Pancake visual style.

The script reads Ironwood's rendered interface and runs alongside Pancake-Scripts. Requested automations use Ironwood's own controls. **Enable automation** controls every game-changing action, while **Enable cache lookups** controls background information retrieval. Both settings are disabled by default. Cached information can still update without a background lookup when its native page is opened manually.


## Current Action and Loot

Current Action shows the running activity, levels, location, XP per hour, progress, materials, and consumables. With no running action, it says **No action in progress** and the remaining panels stay available.

Consumables have separate Equipped and Stored quantities. Stored-only items such as Stardust and Mastery Contracts appear only under Stored. Stardust is hidden during gathering. The active skill's Mastery progress is informational; the badge turns gold when the skill is complete.

Current Loot shows pending quantities and cached inventory amounts. **Claim** collects and continues through Ironwood's native controls when automation is enabled. Finite crafting queues instead show loot, queued, and owned amounts in Current Action.

The queue warning turns amber below one hour and red below ten minutes. Material warnings turn orange below 1,000 and red below 500; hover to see affected materials. Badges appear in this order: Mastery, active events, location, activity, warnings.

## Other progress

Daily Quests shows today's completion. Adventure shows active progress, map creation totals, or a green idle indicator when a stored map can be started. Guild event participation is matched to your character; its action badge appears only when your activity contributes to that event. Guild Trials has its own active indicator and countdown.

Attunement lists selected skills and tribute balances. Taming shows the selected expedition and Pet Snacks. Challenges shows scrolls and remaining auto-completes. The potion panel separates equipped and stored quantities; enable **Show Super potions** under Preferences → Interface to include owned Super potions.

Traits on the native page are grouped by Forest, Mountain, Ocean, and shared Defense. Multiplayer remains available through Preferences → Interface.
