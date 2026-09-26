# Understanding Ironwood Status

Ironwood Status is a browser companion for Ironwood RPG. Its main job is to bring scattered game information into one dashboard, keep useful estimates moving between page visits, and optionally perform selected chores through the game's controls. It also adds combat feedback, collection recaps, interface refinements and a fictional news ticker.

This walkthrough describes the repository as inspected on 26 September 2026. Start here for the overall picture; use the linked reference docs for individual behaviors.

For the underlying game, start with [How Ironwood RPG works](reference/ironwood-game.md). It explains the skill families, resource flow and parallel activities that the companion follows, with [dated source notes](reference/ironwood-sources.md) for game mechanics and changes.

## What the player gets

| Player question | Existing feature | Where to read more |
| --- | --- | --- |
| What am I doing, and is it still running? | Current Action, combat, revival, finite queue and header indicators | [Status dashboard](user/status-dashboard.md), [combat](user/combat.md) |
| What have I earned, and what supplies remain? | Pending loot, inventory counts, equipped/stored consumables, materials and collection recaps | [Status dashboard](user/status-dashboard.md), [automations](user/automations.md) |
| What is happening across my other activities? | Quests, challenges, adventures, Taming, Attunement, guild events/trials and House production | [Status dashboard](user/status-dashboard.md) |
| Which chores can the script handle? | Optional daily quests and map creation; requested claim workflows and challenge runs | [Automations](user/automations.md) |
| Why is a number missing or old? | Snapshot ages, native-page navigation, explicit refresh and Debug | [Cache and refresh](user/cache-and-refresh.md) |
| What makes the dashboard feel alive? | Combat/quantity effects, reward recaps and contextual Ironwood Dispatch headlines | [Event effects](technical/event-effects.md), [Dispatch](news-ticker.md) |

The product already covers many activities, and the player reports that the existing layout mostly supports their routine checks. The next question is which additional capability would improve that routine. The [feature ideas](player-feature-ideas.md) distinguish initial proposals from what the design discussion has established; the [glossary](../CONTEXT.md) records shared terminology.

## Follow one piece of information

Imagine the player opens House and then returns to Status:

1. The House collector reads the mounted native controls and records the visible structure's production state.
2. The cache saves that observation and its timestamp, preserving other structures' observations.
3. Status calculates projected production from the known interval and elapsed time, capped by the remaining queue.
4. The dashboard displays the projection without opening House on every update.
5. A requested claim opens House, uses its native Collect controls and waits for confirmation. Confirmed collections update the snapshot and produce a recap; a failed later collection retains earlier successes.

The distinction between an **observation**, a **projection** and a **confirmed action** explains much of the design. A countdown reaching zero is a prediction reaching its boundary; it is not proof that a new native state was observed.

## The four kinds of state

[`AppState`](../src/core/app-state.js) separates the current native observation, persisted snapshots, calculated display values and temporary interface state.

| Area | Example | Why it exists |
| --- | --- | --- |
| Live | Current enemy HP, loot and materials | Represents what the mounted game interface exposes now. |
| Cache | Last Inventory or Adventure observation | Keeps useful information when the player leaves that page. |
| Derived | Projected House output, active bonus flags | Converts observations into values useful to the dashboard. |
| UI | An action in progress, an animation, an open dialog | Coordinates presentation and prevents duplicate work. |

Preferences are saved separately from the gameplay cache. Repairing cached data therefore preserves the player's settings.

## What can cause background work?

Automation and fallback lookups are separate switches, both off by default.

| Trigger | Behavior |
| --- | --- |
| Normal navigation | Captures supported native pages as the player visits them. |
| Local timer/projection | Advances known countdowns and production without a page lookup. |
| Missing or incompatible data | May load a temporary native page when fallback lookups are enabled. |
| Old but usable snapshot | Remains available; age alone does not schedule a lookup. |
| Refresh icon | Explicitly reads cache sources even with fallback lookups off, without enabling the saved preference or running daily chores. |
| Requested Status claim | Requires automation and follows the relevant native confirmation workflow. |
| Pending daily quests/maps | Requires both switches; checks happen at lifecycle triggers and once per minute while visible, with retry limits. |

Usability also includes known state boundaries: an ended guild event cannot describe the next event. That can make its record need a new observation even though ordinary snapshot age does not. See the [cache contract](technical/cache-contract.md).

## How the repository fits together

There is no server to run or package installation step. Source files are assembled in an explicit order into one standalone userscript, which is checked into the repository and installed in Tampermonkey.

| Location | Responsibility |
| --- | --- |
| [`src/integrations/ironwood/`](../src/integrations/ironwood/) | Read native pages, open temporary pages, dispatch native actions and reconcile game state. |
| [`src/integrations/pancake/`](../src/integrations/pancake/) | Coordinate interface behavior alongside Pancake-Scripts. |
| [`src/apps/`](../src/apps/) | Feature-specific capture, calculations, actions and views. Status combines their results. |
| [`src/core/`](../src/core/) | State, persistence, scheduling, event deduplication, formatting and update checks. |
| [`src/ui/`](../src/ui/) | Navigation, preferences, guide, Debug, toasts and input handling. |
| [`src/content/`](../src/content/) | Embedded Dispatch headlines and fictional outlet definitions. |
| [`src/build/`](../src/build/) | Ordered assembly, metadata and verification. |
| [`tests/`](../tests/) | Node tests using a controlled clock, storage and native-interface fixtures/stubs. |

Source files share a private userscript closure; these directories are organizational boundaries rather than isolated imported modules. Edit `src/`, then generate `ironwood-stats.user.js`. See [architecture](technical/architecture.md) and [release process](technical/release-process.md).

Most game interactions use rendered native controls. Some adapters also inspect the already-loaded Angular runtime for precision, state synchronization and reward receipts. These are compatibility-sensitive dependencies on the game's implementation; see [integrations](technical/integrations.md).

## Design choices to preserve when adding features

- **Unknown stays unknown.** Missing or rounded data must not become invented exact balances, rewards or rates.
- **Useful calculations do not require constant retrieval.** Prefer existing observations and local arithmetic; distinguish estimates visibly.
- **Actions need confirmation.** A clicked or disabled button alone does not establish a successful collection. Partial successes must remain visible when a later step fails.
- **Frequent updates should stay lightweight.** The visible dashboard samples on a 250 ms schedule, skips expensive work when its inputs are unchanged and preserves ongoing effects. Hidden tabs skip dashboard capture/render work.
- **Native observations are incomplete.** Loading states, changed routes and a hidden dashboard can create gaps. A future history or rate feature must account for those gaps.

## Suggested reading path

1. [Status dashboard](user/status-dashboard.md): understand what players see.
2. [Cache and refresh](user/cache-and-refresh.md): understand what the numbers mean.
3. [Automations](user/automations.md): distinguish reading information from changing game state.
4. [Architecture](technical/architecture.md) and [state model](technical/state-model.md): connect features to code.
5. [Testing](technical/testing.md): learn how behavior is checked before a release.
6. [Player feature ideas](player-feature-ideas.md): choose a problem to explore next.

The inspected working tree passed `npm run check`, including 256 tests, syntax checks, deterministic assembly and whitespace checks. This is a dated baseline, not live-browser acceptance or a claim that every native game layout is covered.
