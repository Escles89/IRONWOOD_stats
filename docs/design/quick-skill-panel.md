# Quick skill panel

The user confirmed the consolidated design, finishing defaults and testing approach. The [implementation specification](../specs/quick-skill-panel.md) synthesizes the agreement, native integration findings and confirmed test boundaries. Implementation and live acceptance are complete. The final decisions at the top of the specification supersede the original design notes below.

Tracked in [GitHub issue #1](https://github.com/Escles89/IRONWOOD_stats/issues/1).

## Purpose

Help the maintainer and other experienced players resume familiar activities from any game page. The existing dashboard already covers their routine checks for ongoing activity, available resources and tasks. The new value is convenient skill switching.

## Agreed behavior

- Quick Loot and Skills form a discreet adjacent pair available on every game page. They must remain available independently of the optional Current Loot card; do not put Skills beside the guide/settings controls.
- Show all skills in the same stable order as the native game, not sorted by recency or the script's separate Traits grouping.
- Each skill entry identifies its last action and offers separate controls to resume it or open the native skill page.
- Last actions are saved per skill across visits. The working definition is the last activity actually run, not merely browsed.
- Opening a page is navigation only; it does not start an activity.
- Resuming a different action starts the target directly. The game handles automatic collection from the prior action. Do not issue a separate Stop & Loot or restart the prior action.
- Confirm the new running action and observe the game's reward details for the automatic collection. A loot receipt and a confirmed target action are distinct outcomes.
- Finite activities ask for a quantity by default. A checkbox lets the player opt into resuming with a preconfigured amount instead of answering each time. The amount and preference are per activity/recipe, with an edit option.
- If the configured quantity is unavailable, reopen the amount prompt with the current limit instead of silently reducing it. This is an exceptional fallback; the configured amount itself should remain stable.
- After switching, stay on the page the player was viewing.
- Explicit Resume clicks work with background automation disabled. They authorize only that single requested action.
- Existing quick loot remains a separate operation: collect and resume the same current action.
- Investigate and resolve the existing Quick Loot visibility problem for some skill/configuration combinations as part of making the adjacent controls reliable.

## Evidence and verification boundary

Static inspection of the native client confirms the user's description: starting a target action first invokes the game's own stop/collection workflow. The start can fail after collection succeeds, so switching is not atomic. The implementation now covers native switching, collection confirmation and same-action restart. The player confirmed that live acceptance passed; automated fixtures cover failures and cancellation as well.

Source inspection found current action names/identifiers and a native reward observer, but no persistent per-skill last-action history or general saved-action switcher. The native stop returns a user object directly and the native start returns action/challenge data; neither is the user-plus-loot envelope assumed by the current receipt confirmation predicate. The specification records the required confirmation, identity and navigation distinctions.

The existing quick-loot helper requires the automation preference. Native Craft All is an explicit action independent of that preference. The agreed Resume behavior follows the explicit-action model; the user has not yet asked to change Quick Loot's existing automation gating.

## Confirmed finishing defaults

| Situation | Behavior |
| --- | --- |
| First use/no saved action | Keep the skill-page link available and explain that no last action is known. |
| Target already running | Mark it as current and do not restart it; quick loot remains available separately. |
| No pending loot or no running action | Keep the paired controls visible, disable Quick Loot with an explanation and keep Skills available. |
| A collection/switch is in progress | Indicate progress and prevent another action from interfering until the outcome is known. |
| Editing saved quantity | Keep the edit option accessible even with reuse enabled. Browsing or selecting a different recipe does not overwrite that recipe's configured amount. |
| Multiple characters/modes | Keep remembered actions and configured amounts separate for each identified character and game mode. Do not seed a different character from the prior one's history. |
| Dismissal and accessibility | Close on successful switch; support keyboard dismissal and focus restoration. |

The shared control group belongs with activity controls and must work on desktop and mobile. Its exact spacing and placement should be checked against the native UI during implementation. This does not reopen the agreed adjacency or all-page availability.

## Linked issue: Quick Loot visibility

The user reports that Quick Loot disappears for some skills/configurations. A deterministic reproduction through the actual Status renderer confirms it: gathering with pending loot exposes Quick Loot, while active Smithing with a finite queue and pending loot has neither the loot card nor its button. The temporary diagnostic command is `node /private/tmp/ironwood-debug-quick-loot.cjs`; its assertion that active crafting exposes Quick Loot currently fails. This is a reproduced existing defect, not a newly failing committed test.

One-variable contrasts isolate the cause: either removing the finite queue or changing only the skill to gathering restores the button. [`compactCraftingLoot`](../../src/apps/status/service.js) is true for a crafting skill with a finite queue; [`renderStatusMarkup()`](../../src/apps/status/view.js) then omits the whole Current Loot card, which contains the only Quick Loot control. The compact queue display retains loot quantities but supplies no replacement button. Automation disabled or a claim in progress only disables the button; those settings do not explain this omission.

Quick Loot currently appears only on Status. The agreed design moves its availability into the shared pair, eliminating dependence on the optional loot card. Runtime behavior has not been changed during the interview. A regression test should cover the actual crafting render path as well as ordinary gathering, combat, no-loot and busy states; all-page mounting also needs verification.

## Acceptance checks

- A genuine running action updates that skill's saved entry; merely opening its page does not. Reloading preserves the entry.
- Selecting a skill-page link performs navigation without starting work.
- A Resume starts the exact displayed target once, with no separate collection or old-action restart. Confirm the actual running identity rather than accepting any progress bar as proof.
- A quantity prompt initially requires a deliberate submission. Cancelling leaves the current action untouched. Opting into quantity reuse applies only to the selected activity and the configured amount.
- An insufficient native quantity allowance reopens the prompt; it neither silently reduces the batch nor replaces the configured amount.
- A successful switch keeps the player's original page and displays the confirmed automatic collection rewards.
- An unavailable target must not be represented as successfully resumed.
- A new action can be confirmed while reward details remain unavailable. Report the known action state and the missing receipt separately; an absent receipt must not cause a duplicate start.
- A native error or delayed confirmation must leave an understandable outcome and a way to open the relevant native page.
- A second resume or quick-loot request must not interfere with a switch already in progress.

These are implementation acceptance criteria, not claims about implemented behavior. Static inspection has confirmed that the native target-start workflow handles prior collection, but the complete integration still requires validation, including combat and finite crafting. The specification records the response-shape, navigation and identity constraints discovered after design confirmation.
