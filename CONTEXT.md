# Ironwood Status

Ironwood Status helps players follow their ongoing activity, available supplies and tasks across Ironwood RPG.

## Language

### Game disciplines and regions

**Gathering**:
The skill family that obtains resources through Woodcutting, Mining, Farming, Fishing, Delving and Exploring.

**Crafting**:
The skill family that converts materials into other items through Smelting, Smithing, Enchanting, Alchemy, Cooking and Imbuing.

**Combat**:
The skill family of One-handed, Two-handed, Ranged and Defense, involving encounters with enemies. An enemy and the skill being trained are separate choices.

**Region**:
One of Forest, Mountain or Ocean, used to group skills and regional activities or resources. Defense belongs to all three regional challenge reward groups.
_Avoid_: Using region as a synonym for the specific location of an encounter.

### Character progression

**Trait**:
A permanent passive bonus unlocked and levelled through Sigils.

**Sigil**:
An item used for Trait progression, produced through Imbuing or the House's Engraver.

**Mark**:
A rare, untradeable skill collectible that grants a character bonus when unlocked.

**Skill Mastery**:
A skill-specific progression milestone requiring XP, coins and items, with a badge and a Mastery Point as rewards.
_Avoid_: Skill level as a synonym for completed mastery.

**Mastery Point**:
A reward from completing Skill Mastery that can be spent on mastery passive effects.
_Avoid_: Mastery Contract, skill XP.

**Relic**:
A restored regional artifact holding modifiers that enhance the character.

**Quest Points (QP)**:
A quest-related progression resource used to create modifiers for Relics.
_Avoid_: Research Points, Rank Points.

### Player activity

**Check-in**:
A player's visit to confirm their current action is ongoing, inspect available resources and check for tasks such as challenges or adventure maps. A check-in does not necessarily involve changing the current action.

**Skill**:
A discipline such as Mining, Smithing or a combat skill. A skill can contain multiple specific activities, so choosing a skill alone does not identify the activity the player wants to start; Taming has a separate expedition lifecycle.

**Action**:
A specific activity within a skill, such as mining a particular resource, crafting a particular recipe or fighting a particular enemy. The skill and activity together identify the action; a shared enemy alone does not identify the combat skill.
_Avoid_: Skill as a synonym for a specific action.

**Current action**:
The character's ongoing main activity, such as gathering, crafting or combat. House production, Taming expeditions and other parallel activities have their own progress.
_Avoid_: Using this term for every available task or dashboard control.

**Finite queue**:
A bounded batch of an action or a structure's production, with a total amount and completed progress. Its remaining work is neither pending loot nor inventory already owned.
_Avoid_: Inventory, loot or configured amount as synonyms for remaining queued work.

**Revival**:
The character's recovery period after combat defeat. It is distinct from an enemy respawning for the next encounter.

### Supplies and rewards

**Pending loot**:
Rewards accumulated by an activity and awaiting collection. Current Loot refers specifically to the current action's pending loot.
_Avoid_: Owned inventory, queued output.

**Owned inventory**:
Items already held in the character's inventory. Pending loot and unfinished production are separate from this balance.
_Avoid_: Pending loot, queued amount.

**Materials**:
Supplies required by the current action, such as recipe ingredients. Their available quantities describe how much supply remains, not how much output has been produced.

**Equipped consumables**:
Consumable supplies equipped for use by the character. Their equipped quantities are separate from stored reserves of the same items.

**Stored reserves**:
Consumable supplies held in inventory, including stored-only resources such as Stardust and Mastery Contracts. A stored reserve is not an equipped quantity.

**Collection**:
The transfer of an activity's accumulated rewards to the character. Successful collection and successful continuation or starting of an action are separate outcomes.
_Avoid_: Using collection to mean merely requesting a claim or completing an entire multi-step workflow.

**Claim control**:
A request to perform the owning panel's reward workflow, which may include collection, continuing an action or running challenges. The shared Claim label does not imply identical behavior across panels.

**Reward recap**:
A report of confirmed rewards and the outcome of a collection or challenge run, including rewards retained when a later step fails. Unavailable reward details are unknown, not a confirmed zero reward.

### Material planning

**Contributed mastery items**:
Items already submitted toward a Skill Mastery's requirements. They count toward fulfilling those requirements and are separate from owned inventory and pending loot.

**Target owned quantity**:
The total quantity of a finished item the player wants to hold. Existing owned items count toward this target; only the shortfall needs to be produced or acquired.
_Avoid_: Additional quantity to craft.

**Recipe chain**:
A finished item and the ingredient dependencies needed to reach its target owned quantity through the selected recipes. Owned finished items and intermediates reduce the remaining requirements.

**Recipe plan**:
A plan of gathering and crafting actions derived from a recipe chain, with remaining requirements determined by owned inventory. Each action is started manually.

**Missing now**:
The outstanding amount of a requirement not covered by owned inventory, floored at zero. For Skill Mastery, already contributed items reduce the requirement first; unknown amounts leave the shortfall unknown.

**Missing after collection**:
The amount of a requirement that would remain after collecting the current action's known pending loot, in addition to owned inventory. This is conditional on collection; incomplete loot coverage cannot establish a complete shortfall.

### Quick actions

**Planned next action**:
A specific action identified as the player's intended next activity, either selected directly or suggested by an active recipe plan, and started manually when ready. Planning it does not make it the current action or the last action.

**Quick loot**:
A player-requested collection of the current action's pending loot followed by resuming that same action.
_Avoid_: Using this term for switching skills or collecting rewards from unrelated activities.

**Quick skill panel**:
A panel listing all skills in the game's order, showing the last action for each skill with separate choices to resume it or open the skill's native page.

**Resume last action**:
A request to start the remembered action for a chosen skill, identified by name before the player selects it.
_Avoid_: Using “resume” for merely opening a skill page.

**Last action**:
The most recent activity the player actually ran for a particular skill, retained across visits for that character and game mode. Merely viewing an activity does not make it the last action.

**Configured amount**:
The quantity the player saves for one specific finite activity or recipe, for that character and game mode. Opting into reuse for that activity skips its usual quantity prompt; an insufficient supply calls for a new choice rather than silently changing the saved amount.
_Avoid_: Remaining queue, currently craftable amount.

### House production and script automation

**House production**:
The game's production of items by House structures, each with its own selected activity, queue and pending loot. This is the subject of the dashboard's Automations panel.
_Avoid_: Unqualified automation when it could mean the script's optional chores.

**Structure**:
A House production unit with its own selected activity and production progress. Collecting one structure's loot does not collect another structure's loot.

**Projected production**:
An estimate of a structure's production progress and pending loot since its last observation, bounded by its remaining queue. It is not a new observation or confirmation that loot was collected.

**Script automation**:
Optional execution of game chores by Ironwood Status, including requested Claim workflows and background daily work. It is distinct from the game's House production.
_Avoid_: House production as a synonym for script automation.

**Daily work**:
The script's recurring daily quest completion and map creation chores. Completion belongs to each chore's daily allowance, independently of the current action or an adventure's progress.

### Daily quests and challenges

**Daily quest**:
A quest associated with a skill and counted toward the character's five daily completions. Preferred quest skills identify which quests the player wants completed; selecting five preferences does not itself complete five quests.

**Challenge**:
A regional activity with steps, a completion state and a reward skill. It is distinct from a daily quest and from the script's run of several challenges.

**Rank Points**:
Challenge progression points associated with unlocking higher challenge tiers.
_Avoid_: Unqualified RP, which can also mean Adventure Research Points.

**Challenge Scroll**:
An inventory item used to enter a challenge through its scroll requirement. Available scrolls, the daily scroll allowance and the auto-complete allowance are separate limits.

**Paid challenge entry**:
A challenge start purchased with gold. It starts the challenge directly rather than adding a Challenge Scroll to inventory.
_Avoid_: Buying scrolls when describing what the purchase grants.

**Challenge auto-complete allowance**:
The remaining number of Ironwood challenge auto-completes available to the character. It is distinct from scroll supply and from permission to run script automation.
_Avoid_: Scroll count, automation setting.

**Blocked challenge**:
An active challenge whose native auto-complete is unavailable. Abandoning it forfeits the scroll or gold spent on entry and does not count as completing it.

**Challenge run**:
A bounded sequence of challenge entries, auto-completions and reward claims requested through Status. Its results distinguish completions, cancellations, scrolls used and paid entries, including partial results when the run stops early.

### Adventures

**Adventure map**:
A reusable, skill-specific map that can be stored and used to start an adventure. A selected map in storage is not necessarily the map of a running adventure.

**Adventure**:
A timed activity associated with a map that provides a bonus for the map's skill while active. Its progress is separate from daily map creation and from the character's current action.

**Research Points (RP)**:
The resource spent to create adventure maps and start adventures. Its balance is separate from maps in storage and the number of maps created today.
_Avoid_: Rank Points; unqualified RP outside an Adventure context.

**Logbook**:
A resource gathered through Exploring that supplies Research Points for Adventures.

**Map Points**:
A resource obtained from selling adventure maps and used to modify map passives.
_Avoid_: Research Points, Map Effect.

**Map Effect**:
A permanent increase to map passive strength, earned through completed adventures.
_Avoid_: Map Points, map rarity.

**Daily map creation**:
The creation of maps against the game's daily map allowance. Reaching that allowance means map creation is complete for the day, not that an adventure has started or finished.

### Taming and Attunement

**Taming expedition**:
A Taming activity with its own pending loot and Pet Snack requirements. Expedition loot collection is separate from Hatchery and Ranch egg readiness.

**Egg readiness**:
The availability of eggs in the Taming Hatchery or Ranch, as observed or estimated from their timers. Ready eggs are not expedition loot, and an expedition loot claim does not hatch them.

**Attunement slot**:
A selected Attunement activity associated with a skill and region, with its own accumulated rewards. Collecting one slot's rewards is distinct from collecting all selected slots.

**Regional Tribute**:
A supply required by Attunement for a particular region: Forest, Mountain or Ocean. A Tribute balance is not the amount of loot available to collect.

### Guild participation and skill bonuses

**Guild event**:
A timed guild activity for a group of skills, such as Gathering, Crafting or Combat. Its overall duration and the character's contribution duration are separate.

**Event contribution**:
The character's participation in a guild event, with a personal timer and contributed XP. Contribution can finish while the overall event remains in progress.
_Avoid_: Event complete when only the character's contribution has ended.

**Guild trial**:
A guild activity associated with a particular skill within a guild trial period. Availability, the character's participation and completion of all guild trials are different states.

**Trial participation**:
The character's timed participation in a particular guild trial, providing an XP bonus for its matching skill. Its deadline is distinct from the end of the guild trial period.
_Avoid_: Trials complete when only personal participation has ended.

**Matching skill bonus**:
A bonus from an active adventure, guild event or trial participation that applies to the current action's skill. An unrelated active activity or a low supply warning does not establish whether this bonus applies.
