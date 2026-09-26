# Player feature ideas

These are proposals based on the current repository, not implemented features or a committed roadmap. The focus is player value: fewer things to remember, clearer decisions and a better sense of progress. Example messages below are illustrative.

## Latest shortlist: three specifications

The follow-up design interview produced three specifications, confirmed by the player on 2026-09-26 and ready for implementation. They are independent features in the first iteration, all shown on Status; connecting them is a longer-term goal.

The approved breakdown is published as GitHub issues [#2–#3 (mastery)](https://github.com/Escles89/IRONWOOD_stats/issues/2), [#4–#5 (shopping list)](https://github.com/Escles89/IRONWOOD_stats/issues/4) and [#6–#7 (planned next action)](https://github.com/Escles89/IRONWOOD_stats/issues/6). Each specification links both tickets and their blockers. Issues #2 and #4 can start immediately; #6 depends on the existing Quick Skills issue #1.

### Skill Mastery materials tracker

Track one selected mastery with Required, Contributed, Owned, Pending loot, Missing now and Missing after collection. Show XP and coins separately. Current Loot is the only pending-loot source; previously contributed items reduce the outstanding requirement. Keep the card after completion until another mastery is chosen. The card is informational and links to the native page.

See the [Skill Mastery tracker specification](specs/skill-mastery-tracker.md).

### Finished-item shopping list

Plan one target total owned quantity. Use owned finished items and intermediates before expanding the remaining recipe requirements, without allocating shared stock twice. Show the full recipe breakdown and a missing-materials summary. Include special resources, use current main crafting recipes, and let the player choose when multiple recipes apply. Base costs do not predict bonus savings or guarantee uncertain output. Exclude pending loot, House production and market optimization. The card is informational.

See the [shopping-list specification](specs/item-shopping-list.md).

### Planned next action

Save any gathering, crafting or combat main action, including actions never previously run or not currently eligible. Save finite quantities and let the player explicitly start the plan from its persistent Status card. Start must not interrupt unfinished work: finite batches require confirmed completion, and continuous actions must first be stopped manually. Clear the plan only after a confirmed start through this feature. Parallel activities are deferred.

See the [planned-next-action specification](specs/planned-next-action.md).

All three save their selection separately per character and game mode in this browser. Material views show observation ages, explicit unknowns and read-only refresh. The specifications include confirmed presentation decisions and acceptance criteria.

The earlier quick skill panel discussion below is historical; that panel now has an implementation and a [current user guide](user/quick-skills.md).

## Earlier quick skill panel discussion

- **Audience:** The maintainer's own routine and other experienced players.
- **Current routine:** Check that the current action is ongoing, inspect available resources and look for tasks such as challenges/scrolls and adventure maps.
- **Existing value:** The player reports that this information is mostly already laid out. We have not established a discovery or scanning problem.
- **Existing convenience:** The player already uses quick loot to collect pending loot and resume the same action. Planning, progress and convenience ideas overlap with capabilities the player reports already having; each proposal needs a concrete gap before being treated as new work.
- **Requested direction:** A quick panel for easily changing skills.
- **Chosen interaction:** Show the last action for a skill and offer quick resume, alongside a separate option to open the skill's native page.
- **Availability:** Quick Loot and Skills form a discreet adjacent pair on every game page. The existing Quick Loot visibility issue must be resolved without depending on the optional loot card.
- **Panel contents:** All skills, in the native game's stable order, with remembered action labels and native page links.
- **Memory:** Keep saved last actions for each skill across visits.
- **Switching:** Start the chosen activity directly and let the game's automatic collection handle the previous activity's loot. Confirm the resulting action and rewards; do not separately stop/collect or restart the old activity.
- **Finite quantities:** Ask by default; offer a per-activity checkbox and editable configured amount for reuse. Reopen the prompt if that amount cannot be fulfilled, without silently changing it.
- **After switching:** Stay on the same page. Explicit Resume works even with background automation off.
- **Design confirmed:** The user confirmed the consolidated design and finishing defaults. The [implementation specification](specs/quick-skill-panel.md) contains user stories, integration decisions, testing and scope; the [design notes](design/quick-skill-panel.md) retain the supporting discussion.

The initial recommendation to start with a “Needs attention” list is therefore deferred. Another summary needs evidence that it improves this routine rather than repeating the current dashboard. The [glossary](../CONTEXT.md) records the terms established so far.

## Earlier focus: quick skill panel

The player wants a convenient way to change skills. Existing quick loot is a baseline capability to preserve, not a new feature to build again.

The player chose two distinct controls per skill: **resume the last action**, displaying which action that is, and **open the native skill page**. For example, a Mining entry would display the actual remembered mining action beside Resume and offer a separate page link. The panel does not need an embedded catalogue of activities to satisfy this chosen interaction.

### Confirmed repository facts

- [`collectLootAndContinue()`](../src/integrations/ironwood/native-controls.js) already collects through native Stop & Loot and starts the action again on that mounted page. This does not select a different skill.
- Existing Status page links navigate to native routes without pressing Start.
- Current observation state includes the running action's name, skill and action identifier. The repository does not yet persist a last-action record per skill; its latest-action memory supports temporary rendering continuity.
- A saved-action resume requires selecting and confirming the intended target. Reusing the current quick-loot helper alone would restart the old action.

The current decision tree is:

- **Audience — settled:** The maintainer and experienced players.
- **Feature direction — settled:** Quick access to changing skills.
- **Interaction — settled:** Named last-action resume plus a separate native skill-page link.
- **Availability — settled:** Discreet adjacent Quick Loot and Skills controls on every game page.
- **Panel contents — settled:** All skills in the game's own stable order.
- **Memory — settled:** Cache the last action per skill across visits; the intended baseline is an actually run activity rather than a browsed page.
- **Switching — settled:** Start the chosen action directly; observe the native automatic collection instead of running a separate stop/collect/restart sequence.
- **Quantity prompt — settled:** Prompt by default, with an opt-in checkbox to reuse a configured amount.
- **Quantity details — settled:** Per-activity preference and editable amount; prompt again if native requirements prevent using it.
- **After switching — settled:** Stay on the same page; explicit Resume is available independently of background automation.
- **Design review — settled:** Consolidated behavior, including no-history, current, busy and failure states, is confirmed.
- **Linked bug — diagnosed:** The compact crafting layout removes the whole loot card, including the sole Quick Loot button. The reproduced rendering failure is documented in the design; the shared controls must remove that dependency.
- **Verification — pending:** Static inspection confirms the native target-start workflow includes collection, with response contracts different from the existing receipt predicate. Real integration tests and live acceptance are still required.

At the time of this discussion, the product design was confirmed and synthesized into a specification, before implementation began. See the current user guide linked above for subsequent behavior. The earlier six ideas below remain a provisional backlog rather than the current priority.

## 1. A short “Needs attention” list

**Player question:** What should I deal with first?

The dashboard already shows queue warnings, low resources, eggs, adventure state and daily progress in separate places. A small list could bring the most actionable items together: “Crafting queue ends in 8 minutes”, “Ranch eggs ready”, or “A stored adventure map is ready to start.” Each item would explain the reason and link to the relevant native page.

**First version:** At most three items, ordered by an explicit rule: an observed interruption first, then an imminent queue end, then confirmed ready activities. Group duplicate resource warnings. Use existing snapshots only, mark old evidence as last observed, and phrase expired timers as “Check…” when readiness is unconfirmed. Keep navigation as the initial action.

**Why it is feasible:** Queue warnings, egg readiness and adventure availability already exist. The new work is prioritization and presentation.

**Open question:** Should the list favor preventing idle time, collecting rewards, or the player's chosen goal? Start with preventing idle time and validate that preference.

## 2. “Will this last until I come back?”

**Player question:** Can I leave for two hours without running out of work or supplies?

Let the player choose an absence duration and see which known queues end before their return. Later, include material and consumable estimates when a reliable consumption rate is available.

**First version:** Compare the current finite queue and House queue estimates against a chosen return time. Example: “Three observed House queues cover your absence; the Forge queue is estimated to end 35 minutes early.” Show snapshot ages and explicitly list activities with unknown coverage.

**Why it is feasible:** Native finite-queue time and House interval projections already exist. Material quantities are captured, but the material reader does not retain the per-action requirement; a trustworthy material forecast needs additional capture or measured rates. Consumable use may vary with combat.

**Open question:** Are a few duration presets sufficient, or do players want an exact return time? Start with duration presets.

## 3. A persistent collection journal

**Player question:** What did I collect, and did that interrupted batch actually finish?

Current recaps already contain useful confirmed rewards and stop reasons. Preserve a bounded list that players can reopen after a toast disappears or the page reloads.

**First version:** Store the last 20 collection/run summaries in this browser with time, source, confirmed rewards and completion/stop status. Keep synchronization failures distinct from collection failures. Add Clear history. Start with actions that already supply recap data.

**Why it is feasible:** The shared toast/recap path and feature result records provide a starting point. Persistent history, duplicate prevention and consistent record shapes are new work; the temporary EventLedger is not a durable journal.

**Open question:** Is the main value recovering a missed receipt or comparing earnings? Start with receipts; reward totals are not automatically net profit because purchases and other spending can occur elsewhere.

## 4. A personal goal pin

**Player question:** How close am I to the thing I care about right now?

Let the player pin one item target, such as “Own 10,000 Iron Bars”, and see the observed inventory amount, remaining gap and pending production separately.

**First version:** One manually selected item and target count. Treat owned inventory as progress and pending loot/House production as an explicitly separate estimate. Explain when Inventory needs another observation.

**Why it is feasible:** Inventory and production data already exist. An ETA would require a stable, relevant rate and consistent item matching; leave it unavailable when those inputs are missing.

**Open question:** Do players primarily pursue item stockpiles, skill levels or mastery? Validate the goal type before broadening the UI.

## 5. A bonus opportunity view

**Player question:** Which of my skills would benefit from the bonuses active now?

Current Action already identifies whether the current skill matches Adventure, guild event and guild trial bonuses. A compact view could show other matching skills and the known time remaining, helping players choose their next activity.

**First version:** Explain which observed bonuses apply to each relevant skill, with separate personal participation and event timers. Do not calculate a combined percentage until stacking rules are verified. Navigation remains a player choice.

**Why it is feasible:** Skill matching and bonus deadlines already exist. Comparing opportunities is an extension of those selectors; claiming an optimal training choice would additionally require rates, objectives and verified game rules.

**Open question:** Is finding a matching skill useful enough, or does the player really need an XP comparison? Start with matching skills.

## 6. An observed session report

**Player question:** What happened while I was watching this session?

A session view could summarize confirmed collections, observed level gains and time spent on each observed action. It could make progression more tangible than transient effects and headlines.

**First version:** A manually started session with confirmed receipts and level-change observations. Display observation gaps and reset baselines after action changes. Do not infer historical drops from an initial accumulated-loot snapshot.

**Why it needs more work:** Live capture and Dispatch event detection currently depend on visible Status renders. Complete offline earnings, accurate continuous rates and hidden-tab history cannot be reconstructed from these observations alone. Persistent history and a clear coverage model should come first.

**Open question:** Would players accept an explicitly partial session report, or only find it useful if it accounts for time away?

## Suggested order for discussion

| Idea | Expected player value | Relative effort | First thing to validate |
| --- | --- | --- | --- |
| Needs attention | Unproven; existing layout may suffice | Small–medium | Is there a scanning or prioritization problem at all? |
| Return-time planner | High for idle play | Medium for queues; larger for supplies | Are existing queue estimates sufficient to plan an absence? |
| Collection journal | High for reward review and recovery | Medium | Which recap details do players need to revisit? |
| Personal goal pin | Potentially high for focused play | Medium | Which type of goal matters most? |
| Bonus opportunity view | Potentially high for skill planning | Medium | Does matching alone help choose an activity? |
| Observed session report | Potentially high for progression | Larger | Is incomplete observation coverage acceptable? |

These are qualitative estimates from the earlier discussion, not delivery commitments. The player initially selected a **quick skill panel** and has now selected the three directions at the top of this file for further exploration. These six earlier proposals remain available for later discussion; their overlap with existing features needs validation.

For a first design discussion, use three situations: returning for a quick check, leaving for several hours, and reviewing an interrupted collection. Choose the situation that currently causes the most friction, sketch its smallest useful screen and validate the wording before implementing it.
