# Planned next action

Status: Idle-only slice (#6) implemented on 2026-09-27. Direct transitions from completed finite batches (#7) remain pending. See the technical integration document for validation limits.

## Implementation tickets

- [#6: Save and manually start a planned action while idle](https://github.com/Escles89/IRONWOOD_stats/issues/6) — Blocked by #1.
- [#7: Start a planned action after a completed finite batch](https://github.com/Escles89/IRONWOOD_stats/issues/7) — Blocked by #6.

## Problem Statement

The player wants to save a specific activity to do next and start it manually from its card. A text note or navigation shortcut alone does not satisfy the need. Starting it must not interrupt unfinished work.

## Solution

Add one persistent next-action card on Status. Let the player choose any current gathering, crafting or combat main action, including actions never previously run or not currently eligible. Save a quantity for finite actions and provide an explicit Start control.

This feature is independent of the mastery tracker and shopping list in the first version. Parallel activities and connections among the three features are deferred.

## Confirmed Behavior

- Support all gathering, crafting and combat main actions, not only remembered actions.
- Preserve the chosen skill as well as the action identity; combat skills can share an enemy.
- Allow planning an action that cannot currently start. Show known unmet requirements and recheck them at Start.
- Selecting a planned action is not a start and must not overwrite Last action.
- Save the quantity with finite actions. If it cannot be fulfilled at Start, ask for a new quantity; never silently reduce it.
- Start is always player-triggered. There is no automatic switching.
- Do not interrupt unfinished work. A finite batch must be confirmed complete. A continuous action must first be stopped manually by the player.
- Keep the card on Status only, without completion highlights or notifications.
- Save one plan per character and game mode in this browser across reloads.
- Clear the plan only after a confirmed target start through this feature.
- Keep the plan on cancellation, failure or an unconfirmed start. Successful collection followed by failed target start does not clear it.
- Native starts elsewhere, changes to the current action and loot collection do not clear the plan.
- Provide editing and manual clearing.
- Defer Taming expeditions, House production, Attunement and Adventures.

## Start Contract

Treat finite completed work, continuous work and idle state separately. An expired estimated timer, missing DOM element or route transition is not proof of completion. When completion cannot be established, disable Start with a reason and allow a fresh observation. Never stop a running action merely to satisfy the gate.

Recheck current-action state immediately before invoking the native workflow, including after a quantity prompt. Prevent concurrent starts, claims, character changes and other conflicting operations from bypassing the no-interruption rule. If another action has started in the meantime, retain the plan and stop this attempt.

Use the established native main-action start workflow after the gate passes. If a completed batch retains uncollected loot, the native workflow may collect it as part of the transition; do not add a separate script-driven Stop & Loot. Confirm collection and target-start outcomes independently.

Native requirements remain authoritative. Do not change equipment, spending modifiers or other game settings to make a target eligible. Saved finite quantities use the game's quantity units, labelled explicitly; a saved batch amount must not be presented as guaranteed output.

On success, update ordinary last-action history from the observed actual start and clear the plan. On cancellation or failure, preserve the plan and show the known outcome, including retained rewards. Do not retry a mutation automatically or claim failure when only confirmation is unavailable.

## Confirmed Presentation

Use skill and action selectors drawn from the current game catalog, with names and filtering for large lists. Show known unavailable reasons while allowing selection. Ineligible targets and unfinished current work disable Start with an explanation.

The card shows the planned skill, action and finite quantity where relevant. Edit and Clear remain available. If the target is already running because it was started elsewhere, keep the plan and prevent a duplicate start while that work is unfinished.

Remain on Status after a start attempt and report the result using the established reward recap behavior. Make quantity prompts, validation and disabled reasons keyboard-accessible.

## Implementation Evidence and Requirements

Quick Skills supplies scoped browser persistence, native target identities, quantity prompts, action coordination, result confirmation and reward recaps. Its current UI only selects remembered targets; the planned-action picker must enumerate current skill action lists instead.

Static downloaded-client inspection confirmed a shared main-action start family and separate lifecycle contracts for parallel activities. Shared combat targets still require distinct skill IDs. Catalog membership alone does not establish eligibility.

The existing queue warnings are projections, not durable completion events. Establish a validated native completion/idle predicate as an implementation prerequisite. Until the required evidence is available, keep Start unavailable rather than falling back to estimated completion.

Keep plan persistence separate from cache observations and remembered last actions. Validate saved records, unknown identities and ownership changes. Reuse the existing action coordination and synchronization boundaries without adding a competing mutation path.

## Acceptance and Validation

Exercise the complete card-to-start workflow through the assembled-userscript harness, stubbing native runtime, time and persistence boundaries:

1. Save a never-before-run main action; reload and verify character/game-mode isolation.
2. Save an unavailable target, show its requirements and recheck when it becomes eligible.
3. Selecting or editing a plan does not start anything or alter Last action.
4. Block unfinished finite work even after its estimated timer expires.
5. Block continuous work until a manual stop is confirmed; allow a confirmed completed batch or idle state.
6. Recheck the gate after a quantity prompt and when another action begins concurrently.
7. Preserve skill identity for a combat enemy shared across skills.
8. Prompt when the saved amount is infeasible; cancellation leaves gameplay and plan intact.
9. Clear only after a confirmed feature-initiated target start.
10. Preserve the plan after native starts elsewhere, collection, failures and unconfirmed outcomes.
11. Preserve confirmed rewards after a later start or synchronization failure; never duplicate a start automatically.
12. Exclude parallel activities and keep the card confined to Status.
13. Verify accessibility, native amount units and mobile presentation.

Validate native completion and idle observations against the live interface without changing gameplay. Report separately whether a deliberate live start acceptance run was exercised; static inspection and fixtures do not establish successful live switching. During implementation, run the repository build and complete check command.

## Out of Scope

Automatic starts, interruption of unfinished work, automatic stopping, multiple queued plans, completion notifications, parallel activities, automatic retries, cross-device synchronization and connections to the other two new features.
