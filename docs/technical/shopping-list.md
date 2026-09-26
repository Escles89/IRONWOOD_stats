# Finished-item shopping list

Implements issue [#4](https://github.com/Escles89/IRONWOOD_stats/issues/4), the direct-ingredient slice. Recursive expansion remains issue #5.

`apps/shopping/native.js` discovers recipes only through the six current native main crafting skill action lists. Global catalog entries outside those lists and House production are excluded. Native item IDs identify targets and ingredients; recipe keys contain skill and action IDs. Nested and failure outputs remain selectable with uncertain output. Incomplete skill/action catalogs cannot prove an item noncraftable.

The recipe index is cached by immutable native catalog identities. Hidden dashboards skip shopping observation; a compact signature of the target, relevant balances and catalog revision gates recalculation. The Status render signature contains a result revision rather than the full snapshot.

`apps/shopping/service.js` stores one validated target and recipe choice under `iw-status-shopping-v1:` plus the existing validated character/mode identity. This is independent of mastery, Quick Skills and gameplay cache eviction. Known balances come directly from native inventory and the separate user resource fields. Missing entries in an available inventory dictionary mean zero; absent/malformed dictionaries or balances remain unknown. Pending loot and queues never count. Duplicate ingredient IDs are aggregated before allocating stock. Finished stock already assigned to the target cannot also cover a self-input.

Observations update on relevant native changes or an explicit read-only Refresh; age alone does not invoke a hidden route, synchronization or daily work. The last usable in-session observation remains visible with its age and a historical warning during unavailable sources, synchronization or collection. Saved targets survive reload; a reload obtains a new native observation. Refresh shares the existing synchronization and character validation. It does not buy, craft, claim or change settings.

## Native source semantics

Static inspection of Ironwood v1.6.5's main client verified the following:

- Main action drop selection uses a roll against cumulative `chance` thresholds out of 1000. It selects a single branch, recursively when necessary.
- Missing `amount` means one item; an explicit amount above one is a random upper bound, implemented as `Math.round(seed * (amount - 1) + 1)`. This differs from House's fixed `amount` reader. The planner therefore recognizes only a sole always-drop of one as a verified fixed base yield; it does not invent a multi-item fixed batch.
- `failDrops` can replace success output. A sole one-item success drop permits a labelled nominal calculation, but not a guarantee or inferred probability. Variable or branched output retains per-attempt costs without an invented attempt count.
- Ordinary materials are consumed alongside recipe fields `charcoal`, `compost`, `metalParts`, `sigilPieces`, `potionMix` and `arcanePowder` from corresponding top-level user balances. Preservation, efficiency and bonus/modifier paths are excluded from the base plan.

## Validation

The assembled harness exercises target subtraction, fixed one-item output, variable and failing output, nested output, current recipe choice/invalidation, obsolete recipes, all six special resources, duplicate allocation, self-input stock, unknown data, persistence/isolation, fulfilled-then-spent targets, failed refresh, collection coordination, character-response rejection and Status-only placement.

Live read-only validation used Ironwood v1.6.5 with the local loader. The native Infernal Bar page showed level 100, one Infernal Ore and eight Charcoal per attempt. The shopping card selected that current recipe and saved a target of 17,000: 16,651 owned left 349 to acquire, with 349 Ore and 2,792 Charcoal required. Its observed native balances were 15,717 Ore and 116,937 Charcoal. Keyboard Enter saved the edited target and expanded the detail; Tab moved to the native recipe link. At a 390 × 844 viewport the card was 370 px wide with no card overflow, and each row retained all four labelled quantities in two columns. The temporary viewport was reset. The current Chilli/Farming action continued; no gameplay mutation was requested.

Final verification: `npm run build` and `npm run check` passed all 325 tests, source/generated syntax checks, deterministic assembly and whitespace validation. There is no separate TypeScript typecheck in this JavaScript repository. The Standards review's repeated-calculation finding was fixed with indexed catalogs and revision-based rendering; the cache was placed in AppState as documented. Final Standards and Spec reviews have zero unresolved findings. Reload persistence, source failures, identity switches and refresh rejection are harness evidence; the keyboard, mobile and native recipe comparison above are live evidence.
