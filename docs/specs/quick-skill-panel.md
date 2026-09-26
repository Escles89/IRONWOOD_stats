# Quick Loot and a remembered-action skill panel on every game page

Tracked in [GitHub issue #1](https://github.com/Escles89/IRONWOOD_stats/issues/1). Implementation and live acceptance are complete; publication is a separate delivery step.

## Implementation status — 26 September 2026

Implemented in the local working tree, with the generated userscript and user/technical documentation updated. These final decisions supersede conflicting wording in the original specification below. The player has confirmed that live acceptance passed. This repository change includes the implementation, tests and generated userscript; publication is separate.

### Implemented

- [x] Remember each skill's last actually running action and finite recipe quantities per character and game mode. Browsing does not replace remembered actions.
- [x] Start the named action through the native workflow, preserve the original page, confirm the exact target, and report collection separately from start failures. Guard cancellation, shortages, character changes, and overlapping requests.
- [x] Keep Quick Loot collecting and continuing the same action, including finite queue remainders.
- [x] Use a compact Guide-style modal with native skill order, skill icons, region icons, and the remembered resource/action icon beside its name.
- [x] Label the action button **Start**, mark the running action **Current**, and make the skill card open the native page. Remove the separate page-link button; Start and amount controls retain independent behavior.
- [x] Show skill levels, compact XP bars and percentages, and time to the next level using native calculations. Exact earned/required XP and rate details are available on hover. Inactive remembered actions use **If started** estimates with current equipment/bonuses; unavailable rates show a dash. Taming has no skill level.
- [x] Use a native-style quantity chooser with Owned, Craftable, Estimated Time, Quantity, Craft, Craft All and Target. Editing uses Save amount and Use max without starting the action.
- [x] Keep **Reuse this configured amount** always visible and checked by default for new preferences; respect a previously saved opt-out. Shortages reopen the prompt and require an explicit choice before replacing the saved amount.
- [x] Place compact Status controls at the right of the crafting information bar; otherwise use the Current Loot header. Keep the Skills launcher as a grid icon.
- [x] On native action pages, show Quick Loot only for the exact running skill/action. Give Stop & Loot and Quick Loot equal widths and matching native styling. On inactive pages, show only Skills after the native Amount/Craft group.
- [x] Use the same chest artwork across loot/claim controls, with dark backgrounds, green borders, and sizes matching surrounding controls.
- [x] Preserve keyboard navigation, cancellation, and modal scroll position during live XP updates.

### Validation and delivery

- [x] Build the generated userscript and run the repository checks: **287 tests passed** on the latest implementation check.
- [x] Inspect the live menu layout, skill levels/XP/estimates, quantity input updates, checked and visible reuse control, and whole-card navigation. Quantity previews were cancelled without saving or starting an action.
- [x] Live acceptance passed, confirmed by the player. Automated fixtures additionally cover native start/stop failures, cancellation and ownership changes.
- [x] Final interface accepted by the player after live testing.
- [x] Review the repository changes and prepare source, tests, documentation and generated output together for commit.
- [ ] Publish the generated userscript. Publication is outside the commit-only request.

Implementation: `src/apps/quick-skills/`; workflow coverage: `tests/apps/quick-skills.test.cjs`; documentation: `docs/user/quick-skills.md` and `docs/technical/quick-skills.md`.

## Original approved specification

## Problem Statement

Experienced players already use Status to check their current action, supplies and available tasks. That information is largely available, but changing to a familiar activity still requires visiting its native page and selecting it again. Players need a small, predictable way to resume each skill's last action while keeping the page they are viewing.

Quick Loot already collects pending loot and continues the same action, but it disappears in compact crafting layouts. Its only control lives inside the Current Loot card, which those layouts omit. Placing the skill panel beside that control must include fixing its availability.

## Solution

Provide a discreet adjacent pair of Quick Loot and Skills controls on every game page, independently of whether the Current Loot card is displayed. Keep this pair with activity controls rather than adding Skills beside Guide or Settings.

Skills opens a compact panel containing every skill in the native game's stable order. Each entry shows the remembered last action by name, a Resume control when applicable, and a separate shortcut to the native skill page. Save last actions across visits for the appropriate character and game mode. Remember activities that actually ran, not pages the player merely browsed.

Resume starts the displayed target through the game's native start workflow. That workflow handles collecting and stopping the previous action; the script must not add a separate collection or restart of the old action. Confirm both the target action and the collection outcome, then show the result while preserving the player's original page.

For finite activities, prompt for quantity by default. Offer an editable configured amount and a checkbox to reuse it without prompting, scoped to that specific activity or recipe. If the configured amount cannot currently be fulfilled, reopen the prompt with the available limit rather than silently reducing the batch. An explicit Resume click works independently of the background automation preference.

## User Stories

1. As an experienced player, I want Quick Loot and Skills available on every game page, so that I can act without first returning to Status.
2. As a player, I want the two controls beside each other, so that related activity controls are easy to find.
3. As a crafting player, I want Quick Loot to remain visible when loot is summarized inside my queue, so that a compact layout does not remove an existing action.
4. As a player, I want the controls to be discreet, so that they do not crowd the game interface.
5. As a player, I want every skill listed in the game's order, so that familiar positions remain predictable.
6. As a player, I want each skill's last action shown by name, so that I know exactly what Resume will start.
7. As a player, I want to resume a remembered action directly, so that I do not repeatedly navigate and select the same activity.
8. As a player, I want a separate native-page shortcut, so that I can choose a different activity when needed.
9. As a player, I want opening a skill page to perform navigation only, so that browsing never starts an action unexpectedly.
10. As a player, I want last actions retained after a reload or later visit, so that my shortcuts remain useful across sessions.
11. As a player, I want only an activity that actually ran to replace a skill's last action, so that browsing alternatives does not erase my shortcut.
12. As a player, I want native starts outside the quick panel to update remembered actions too, so that the panel reflects how I actually play.
13. As a player with more than one character or game mode, I want their remembered actions and amounts kept separate, so that one character's configuration is not applied to another.
14. As a player using a skill with no remembered action, I want its native-page shortcut to remain available, so that I can establish an activity without a misleading default Resume target.
15. As a player, I want the action already running marked as Current, so that I do not accidentally restart it through the skill panel.
16. As a player, I want Quick Loot to remain a distinct collect-and-continue operation, so that I can claim rewards without changing activities.
17. As a player with nothing to collect, I want Quick Loot visibly disabled with a reason, so that the controls remain predictable while avoiding a pointless action.
18. As a player switching skills, I want the native start workflow to handle the old action's loot, so that the script does not introduce redundant stop, collection or restart steps.
19. As a player, I want confirmation of the exact skill and action that started, so that a stale or unrelated progress indicator cannot be presented as success.
20. As a player, I want a recap of confirmed collected rewards, so that I can see what the switch collected.
21. As a player, I want successful collection retained in the report if the new action fails to start, so that a partial outcome is understandable.
22. As a player, I want missing reward details distinguished from a failed switch, so that an unavailable receipt does not suggest repeating a successful action.
23. As a player, I want to remain on the same page after switching, so that changing activities does not interrupt what I was viewing.
24. As a player with background automation disabled, I want my explicit Resume click to work, so that a manual convenience control does not require enabling scheduled tasks.
25. As a crafting player, I want a quantity prompt before starting a finite activity by default, so that I can choose its batch size deliberately.
26. As a crafting player, I want an optional checkbox to reuse a configured amount, so that familiar batches can start with fewer steps.
27. As a crafting player, I want amounts and reuse preferences saved per activity, so that a choice for one recipe is not applied to another.
28. As a crafting player, I want to edit the configured amount even when reuse is enabled, so that the shortcut can adapt to my needs.
29. As a crafting player, I want a shortage to reopen the amount prompt with the current limit, so that the script does not silently start a smaller batch.
30. As a crafting player, I want the configured amount to stay stable until I deliberately change it, so that changing supplies or visiting other recipes does not rewrite my preference.
31. As a player, I want cancelling a quantity prompt to leave the current action untouched, so that exploring a resume option has no gameplay consequence.
32. As a player, I want unavailable targets explained with access to their native page, so that I can resolve requirements without a false success message.
33. As a player, I want in-progress requests to block conflicting clicks, so that repeated Resume or Quick Loot presses cannot start overlapping operations.
34. As a keyboard user, I want labelled controls, predictable focus and dismissal, so that I can use the panel without a pointer.
35. As a mobile player, I want the pair and panel to fit the viewport and remain usable, so that quick switching is not limited to desktop.
36. As a player whose character changes while the panel is open, I want an outdated request refused, so that the shortcut cannot affect the wrong character.
37. As a player using a special skill such as Taming, I want it represented in the familiar skill list with its native-page shortcut, so that inclusion does not depend on supporting an ordinary main-action Resume.

## Implementation Decisions

- **Feature ownership:** Add a cohesive quick-skills feature that owns remembered actions, configured quantities, the shared control pair, the skill panel and the resume workflow. Reuse the existing native integration, state, navigation, reward recap and persistence boundaries. Continue using the project's dependency-free userscript assembly and generated distribution artifact.
- **Placement:** Mount the paired controls in a shared activity-control area that exists independently of the optional loot card. Preserve adjacency on Status and native routes. Check final positioning on desktop and mobile; do not place Skills with Guide/Settings. Remove dependence on the compact-crafting conditional that currently hides Quick Loot.
- **Skill list:** Follow native navigation order, not recency or the separate Traits grouping. The inspected native order is Taming, Woodcutting, Mining, Smelting, Smithing, Enchanting, Farming, Alchemy, Fishing, Cooking, Delving, Imbuing, Exploring, One-handed, Two-handed, Ranged and Defense. Prefer the native ordering source so future compatible changes are reflected.
- **Remembered actions:** Store the last confirmed running action per skill, including its explicit skill and action identities and a display name. Observe actual native activity outside Status as well as panel starts. Do not record a selected or browsed page as running activity. Repeated observations must not cause repeated persistence writes or extend a fabricated observation history.
- **Character ownership:** Persist history and quantity preferences in a versioned, validated structure scoped to a reliably identified character and game mode. The inspected client uses displayName and isSolo; do not assume the repository's existing id-or-name expression establishes identity in the live build. Unknown identity disables unsafe resume/persistence rather than borrowing another character's data. Revalidate ownership before a mutation and before recording its result.
- **Quantity ownership:** Save configured amounts and reuse preferences by both skill and action identity. Keep them separate from a changing queue's remaining amount. First use prompts; a successful native action may supply an observed initial amount, but it must not silently overwrite an explicitly configured amount. Retain an edit path when automatic reuse is enabled.
- **Quantity validation:** Use native finite-activity requirements and limits. Recheck availability before starting and show the actual maximum when reopening a shortage prompt. Validate whole positive quantities and all applicable native material requirements, including secondary crafting resources. The inspected modal permits up to one million but does not itself reject every request above currently craftable supply, so relying only on its disabled state is insufficient for the agreed shortage behavior. Do not silently clamp or replace the stored amount.
- **Native options:** Respect the game's existing per-skill crafting options and eligibility checks. The new amount preference must not change equipment, turn on spending/resource modifiers, or override native settings as an incidental effect.
- **Native-page shortcut:** Use the native skill navigation target or equivalent verified full route. In the inspected client, a bare skill route is valid for Taming but other bare skill routes can redirect to the current action or a fallback. A constructed bare route is therefore not a correct general shortcut.
- **Start contract:** Invoke the target's native start workflow after readiness and quantity decisions. That workflow already stops and collects an existing action before starting the new one. Do not directly construct private endpoint requests, add a separate script-driven Stop & Loot, or restart the old action before switching.
- **Confirmation contract:** Observe collection and target-start outcomes separately. In the inspected client, a successful native stop returns the user object directly, while a successful native start returns action and challenge data. Neither matches an assumed user-plus-loot response envelope. Adapt existing receipt observation to supported native response shapes and notifications; preserve the single native request subscription and existing error/level-up notifications.
- **Target verification:** Confirm the actual running skill and action identities, not merely the appearance of any progress bar or a successful collection response. Keep an already-running target marked Current and avoid restarting it through Resume.
- **Non-atomic native behavior:** A successful old-action collection can be followed by a failed new start, leaving the player idle. Preserve confirmed rewards and report that outcome clearly. Do not promise automatic rollback or silently resume the old action. Unconfirmed results must not cause automatic duplicate starts.
- **Page preservation:** Keep the main page and its navigation state intact while executing the native workflow. If a temporary native page is used, its quantity dialog is not the user-facing prompt; mirror only the necessary quantity interaction in the visible panel. Reconcile the main game after any attempted mutation, including a stop-success/start-failure outcome, and clean up temporary pages/observers on every exit.
- **Quick Loot continuity:** Preserve collect-and-continue semantics for the same current action, including finite queues and combat. Verify that exposing its button does not conceal an unsupported restart path. Preserve its existing automation gating unless separately changed; the agreed exemption applies to explicit Resume. Empty and busy states disable controls visibly rather than hiding the pair.
- **Shared action coordination:** Prevent a panel resume from racing Quick Loot, another resume, character switching or an incompatible synchronization operation. Release locks and show the known outcome on completion, failure and timeout. Cancelling a pre-start prompt performs no native mutation.
- **Special skills:** Retain the explicit skill identity for Defense even when combat targets are shared with weapon skills. Taming uses a separate activity model and has no ordinary main-action list in the inspected client; include its page shortcut without inventing a standard main-action Resume. Automating a separate expedition lifecycle is outside this spec.
- **Presentation and accessibility:** Clearly distinguish Resume, Open page, Edit amount, Current, unavailable and busy states. Use accessible names that include the relevant activity, keyboard focus management and dismissal, responsive layout and the existing recap presentation. Escape native names and any persisted display text.
- **Compatibility and failure:** If native metadata, eligibility or request contracts cannot be read reliably, keep navigation available where possible and explain why Resume is unavailable. Missing reward details are unknown, not zero. Successful gameplay changes and later synchronization errors remain separate outcomes.

## Testing Decisions

The user confirmed these test boundaries: exercise the complete quick-action workflow through the existing userscript harness, then validate layout and native behavior in the browser.

- **Primary boundary — the complete quick-action workflow:** Extend the existing assembled-userscript test harness to drive user events through the real shared controls, skill panel, history and resume orchestration. Stub only the native-page/runtime, clock and persistence boundaries. Assert what the player sees, which native actions occur, the resulting current-action identity, saved behavior and unchanged main route. Avoid tests of private helper calls or the exact HTML/CSS structure.
- **Use existing high-level rendering and action seams:** Existing tests already drive the real Status renderer, claim confirmation/restart workflows, native navigation, reward recaps and main-game synchronization. Build on those seams rather than introducing a separate harness for every new internal function. Pure state checks may support the workflow tests when they cover meaningful persistence invariants, but must not replace end-to-end feature behavior.
- **Native contract fixtures at the same boundary:** Supply fixtures matching the inspected stop-user and start-action response shapes, native notifications and exact target identities. Cover one subscription per native request, observer restoration, duplicate reward suppression, valid zero-reward outcomes, missing receipt details, rejection, timeout, stop-success/start-failure and synchronization failure after a confirmed start. Counting native mutations is an external side-effect assertion, not an implementation-detail assertion.
- **Visibility regression:** Promote the deterministic reproduced crafting failure into a regression test through the real renderer/shared-control mounting path. Active crafting with a finite queue and pending loot must expose Quick Loot. Also cover gathering, combat, idle, no loot, busy state and native pages outside Status. The existing reproduction changes only crafting classification and finite-queue presence to isolate the omission.
- **History and preferences:** At the workflow boundary, test first use, learning from a native start, browsing without starting, reload, native starts outside Status, changing the last action, stable per-activity amounts, per-character/mode isolation, invalid saved records and character changes during a pending operation.
- **Quantity decisions:** Verify default prompting, cancellation with no side effects, opt-in reuse, editing, shortage fallback, unchanged configured amounts after fallback, and preservation of native requirements/options. Exercise the actual submit route; opening an Amount dialog must not be mistaken for starting an action.
- **Navigation and concurrent actions:** Verify correct native page links, Defense skill identity, Taming's truthful navigation-only behavior, preserved original page after resume, an already-running target, overlapping clicks and Quick Loot/resume contention.
- **Browser acceptance — the same player workflow against the real interface:** Check desktop/mobile placement, the native skill order, keyboard behavior, page preservation and meaningful native control/response compatibility. Read-only inspection can validate layout and source contracts; success/failure of a real action switch requires a deliberate live acceptance run. Do not claim live switching validation from fixtures or static source inspection alone.
- **Repository checks:** Build the standalone userscript and run the existing complete check command, covering syntax, deterministic assembly, all tests and whitespace. Include source, documentation and generated output together when implementation is delivered.

## Out of Scope

- Rebuilding quick loot as a new product concept, or adding a separate collection before a skill switch.
- Background or scheduled skill switching, automatic retries that may duplicate a start, or autonomous recovery to a different activity.
- A complete activity catalogue inside the panel, favorites, recency sorting, recommended skills or optimal-training calculations.
- New equipment management, purchases, spending policies or changes to native resource-use preferences.
- Cross-device history synchronization or reconstruction of activities the script never observed.
- New Taming expedition automation or other side-activity lifecycle management.
- The earlier speculative attention list, return-time planner, journal, goal pin, bonus comparison and session-report proposals.
- Unrelated pending changes to Traits layout, publication metadata or other existing working-tree changes.

## Further Notes

The design was confirmed by the user after discussing all-page availability, adjacency, native skill ordering, remembered actions, automatic collection, quantity reuse, page preservation and the automation setting. The main audience is the maintainer's routine and other experienced players.

The missing Quick Loot control is reproduced and diagnosed, but not fixed. Native integration findings come from read-only inspection of the running interface and its public client bundle for game version 1.6.5. No new action was started and no game state was changed during that inspection. Runtime code has not been modified for this feature.

Both the product design and the testing approach have been confirmed by the user. This specification is ready for implementation under the repository's ready-for-agent triage role.
