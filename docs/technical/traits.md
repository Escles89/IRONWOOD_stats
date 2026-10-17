# Trait tracking

The compact Traits Status row and detail modal implement [issue #10](https://github.com/Escles89/IRONWOOD_stats/issues/10). Source modules live in `src/apps/traits/`: `native.js` discovers definitions and handles native requests, `model.js` derives progression and recommendations, `service.js` owns preferences and guarded workflows, and `view.js` renders the compact dashboard summary and modal.

## Native observations

Runtime discovery reads the Traits route component's named catalog and calculation bindings without constructing a component or navigating. The native set catalog supplies exact XP thresholds and membership, including Defense's participation in multiple regional sets. The native capacity helper supplies the unlocked slot count. Incompatible or ambiguous definitions fail closed.

The panel reads `user.traits.storage`, `equippedIds`, `upgrades`, and `sets` from the current native user. Native action processing updates Trait XP before loot collection, so the regular visible dashboard render observes training progress without background requests. The Status row patches its own markup when needed; Trait XP changes do not invalidate the entire dashboard's structural render signature. Missing traits in a validated storage map are locked, while missing or invalid storage is unavailable data.

All-traits set thresholds select the first unfinished milestone: 100, 115, then 130. Claimed state does not affect that choice. Empty slots and equipped traits at the threshold receive distinct unlocked replacements. Region membership ranks first when a preference is selected, followed by lowest raw XP and a stable numeric ID tie-break. Displayed recommendations are retained while still eligible and at the same regional priority; crossing a threshold or changing the preference recalculates them. An unfinished equipped trait keeps its slot.

Preferences use `iw-status-traits-v1:` with the existing character-and-mode owner key. Only the region preference is persisted; observations, pending mutations, and retries are not restored from browser storage. Temporary native loading, synchronization, or inactivity retains the last same-owner model with an explicit stale flag. The summary displays Updating and suppresses actionable alerts; mutations are disabled until a valid observation returns. Invalid data, identity changes, and unresolved mutation outcomes still fail closed.

## Presentation

Status contains one compact Traits row with equipped progress segments, the current milestone, and switch/claim badges. Clicking it opens a compact modal; no separate Traits dashboard card is mounted. The modal uses the shared dialog host, focus trap, Escape/backdrop closing, and focus restoration. It remains live through the normal render loop and holds the region preference, recommendations, refresh/native-page controls, and set table.

## Manual changes

Switch and Claim are explicit player requests, independent of the optional daily automation setting. They use the game's existing authenticated service. A plain `getUser` read verifies current requirements and character identity before a mutation. It deliberately does not invoke action reconciliation, which can collect a completed finite batch.

A switch confirms unequip, reads the current state again, then requests equip. Each successful response updates only the native user's Traits through `user$`, retaining the current action and other user fields. A failed or timed-out request triggers a read to reconcile possible server success. A confirmed empty slot can offer Retry equip for the intended replacement. An unresolved outcome requires a successful manual Refresh before more changes. Claims are confirmed through the returned claimed-set flag, not an optimistic UI update.

The Trait operation lock prevents duplicate requests and overlaps with script quick actions, claims, and refresh workflows. Owner checks surround asynchronous boundaries, and request timeouts unsubscribe without applying late responses. Native UI or another client can still change state; server responses remain authoritative.

## Validation

`tests/apps/trait-tracking.test.cjs` covers raw XP boundaries, all-region milestones, shared membership, locked traits, unlocked capacity, stable unique recommendations, live training and claim states, owner-scoped preferences, guarded switches and claims, failed equip retries, uncertain outcomes, identity changes, duplicate requests, timeouts, rendering, and definition discovery.

The connected game's local loader was used to verify live XP updates and current set progress. Mutation behavior is exercised with native-service fixtures so verification does not change the player's equipped traits or claim rewards.
