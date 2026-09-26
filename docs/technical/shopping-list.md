# Finished-item shopping list

Implements issues [#4](https://github.com/Escles89/IRONWOOD_stats/issues/4) and [#5](https://github.com/Escles89/IRONWOOD_stats/issues/5), from direct ingredients through the complete recursive recipe chain.

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


Player refinement (2026-09-26): the target picker now contains only success outputs from current main crafting recipes with material requirements, excluding noncraftable inventory, obsolete recipes and failure-only outputs. Existing saved targets still retain useful unavailable/noncraftable explanations. Single-recipe targets no longer show a recipe dropdown; alternate choices and invalidated saved recipes still ask explicitly. Static enumeration of the inspected v1.6.5 client found 228 success-output items and no item with multiple current crafting recipes. None of these 228 items is a rune; the crafting filter therefore also removes all runes, as requested. This corrects the initial hypothetical dropdown explanation.

Refinement verification: the build and complete check passed all 326 tests; the 14-test shopping workflow suite also explicitly verifies rune exclusion. Standards and Spec delta reviews both returned zero findings. Picker filtering and the conditional recipe control are fixture-verified; native catalog enumeration is static evidence.


## Recursive recipe planning (#5)

`apps/shopping/planner.js` discovers the selected item/resource graph and uses reverse postorder to aggregate all parent demand before allocating each balance once. DFS back edges stop cyclic branches explicitly. Shared intermediates have one combined production step, avoiding duplicate stock allocation and per-parent rounding. Covered intermediates require zero production even when their recipe output is uncertain. Separate `item:` and `resource:` keys prevent collisions.

The native adapter retains the verified one-item fixed yield; an `amount` above one remains variable, not a newly invented fixed batch. The fractional-stock fixture makes aggregation affect rounding with that verified unit yield. Attempts, stock used, remaining required output and projected surplus explain the rounding. No surplus enters inventory. Failure-prone output has nominal costs; unknown output leaves totals unknown. Uncertainty propagates from needed intermediate production back to every parent. Unknown shared totals preserve known subtotals and unrelated usable results. Unknown ingredient quantities contaminate their item requirement rather than becoming zero.

The v1 saved target envelope accepts an optional validated per-item `recipes` map, preserving existing targets. Automatically selected sole intermediate recipes are saved too, so a later catalog replacement cannot silently switch them. Choices survive quantity edits and remain isolated by character/mode. Discovery is cached by catalog identity and saved plan; observations track balances throughout the selected chain and all main crafting skill levels. Mutable cache and expansion state live in AppState. Native details/summary controls keep each shared step independently expandable, with labelled selects for alternate or invalidated recipes.

The assembled workflow suite covers multilevel stock reuse, deep balance changes, a diamond, aggregation before unit-yield rounding, alternate choices and invalidation, special resources across levels, failure/variable output propagated to parents, cycles with useful sibling requirements, unknown identities and shared subtotals, alongside the earlier persistence, satisfied-then-spent, owner/mode, read-only refresh and Status-only regressions. Keyboard and responsive acceptance evidence is recorded below separately from fixture and native-source evidence.


The follow-up UI uses nested lists with connector lines and native item images, with initials for resources or unavailable images. Clicking the icon/name opens that step's details. Shared dependencies appear as references to one combined detail, keeping rendering linear in graph edges. A known leaf shortage propagates a red `!` icon to every dependent ancestor; uncertainty uses an amber `?`; covered base supplies use a green check. A stock-covered intermediate does not inherit an unused recipe's shortage. The shopping card is the last card in Status, including mobile layout.

### #5 validation evidence

Live acceptance on Ironwood v1.6.5 used the local loader. A temporary target of 100,000 Elite Key 100 with 26,900 owned required 73,100 keys. The tree allocated 12,710 owned Onyx Essence, leaving 60,390 essence to produce. Its 52,828 owned Giant Fang left a 7,562 shortage, correctly turning the Fang, Essence and Key icons red; covered Arcane Powder and Metal Parts stayed green. Clicking Onyx Essence opened its specific recipe detail. Native navigation opened the actual Onyx Essence page, which confirmed one Giant Fang and eight Arcane Powder per attempt, without starting crafting. The current action remained Chilli/Farming. Ordinary links now use the native router to avoid a full-load return to Status; an already-active recipe can simply reveal its native page.

Keyboard Enter saved the edited target and opened an intermediate step; Tab reached its native recipe link. At 390 × 844 the connected tree, red/green item icons and labelled mobile detail rows were visually inspected. The earlier detail layout measured 370 px with no horizontal overflow; the final nested tree also fit the mobile screenshot. The temporary viewport was reset and the original target of 100 was restored. Alternate recipes, cycles, incomplete native catalogs, shared graph cases, invalid saved choices and same-route navigation are fixture evidence, not claims about having exercised those cases on the live character. Native fixed/variable output semantics remain the static-client findings documented above.

Verification: `npm run build` and the complete `npm run check` pass 337 tests, including 25 shopping workflow tests, source/generated JavaScript syntax, deterministic assembly and whitespace checks. No separate TypeScript checker exists. Standards review: zero unresolved findings after removing repeated leaf classification. Spec review: zero unresolved findings, including the visual-tree and bottom-placement follow-up.


### Compact icon tree and step modals

The follow-up replaces expanded inline details with an icon-only tree and a shared global modal, keeping the card at the bottom of Status. The card retains only target/owned/shortfall, the material shortage summary, concise incomplete/unavailable warnings and observation age. Names and supply states remain accessible via native button titles and labels. The detail modal retains recipe choices, calculations, gaps, observation context and native recipe links.

The original resource initials were an explicit fallback, not missing game artwork. Static inspection of the v1.6.5 native client confirms `items/charcoal.png`, `items/compost.png`, `items/metal-parts.png`, `items/sigil-pieces.png`, `items/potion-mix.png` and `items/arcane-powder.png`. A native-adapter mapping now supplies these images independently of the resource balance identities. Generic unknown items use a question mark rather than fabricated initials.

Modal selection belongs to `AppState.ui.shopping.selectedStep`. The existing global modal provides close/backdrop handling, Escape, focus trapping and return to the triggering icon; shopping, mastery, guide and preferences remain mutually exclusive. Opening a shared icon selects the same combined node. Target editing, character/mode changes and leaving Status dismiss item details. Modal rendering observes the current plan so balance changes update visible quantities without opening native routes.


Visual refinement: the tree is centered top-down, with the target above a row of ingredients, thin connectors and compact square frames matching the dashboard. Covered inputs use a neutral border; red/amber outlines and small warning badges mark insufficient/uncertain branches. The large tinted tiles, green check badges and explanatory panel paragraphs are removed. Resource-versus-inventory identity remains explicit inside details and accessible resource labels.

Live acceptance used the existing 10,000 Divine Wisdom Sigil target unchanged. All four native item images loaded, including `metal-parts.png` and `sigil-pieces.png`. At 390 × 844, the card was 370 px wide with scrollWidth 370; the centered tree viewport and content were both 346 px. Native Enter opened Sigil Pieces details, Tab stayed on its sole close control, and Escape restored focus to the triggering icon. The crafting detail modal also displayed labelled two-column input rows and fit the mobile viewport. The temporary viewport was reset. No production or collection was requested.

Final verification for this refinement: build and complete check passed all 340 tests (28 shopping workflows), source/generated syntax, deterministic assembly and whitespace checks. Standards and Spec reviews have zero unresolved findings; the Spec review's resource-identity concern was fixed with explicit detail labels and a same-name regression. The final square icon frames were verified live after reloading the generated build.

## Saved resource conversion inputs

The shopping card's **Inputs** dialog saves one source item each for Potion Mix and Metal Parts, independently of the target. Choices belong to the same character/mode envelope as the target and survive editing or clearing it. Resource detail modals expose the same controls. Leaving a choice empty keeps that resource as an acquisition leaf; no source is selected automatically. Invalidated saved inputs stay visible and make needed production uncertain until replaced or cleared.

Native v1.6.5's `metal-parts-component` and `potion-mix-component` read item-to-yield tables (current exports `zP` and `gQ`) and credit `source quantity × uses`. The adapter discovers these tables using two distinct item-artwork/yield anchors each, validates all entries and refuses ambiguous matches. The minified export names are not used. Examples: Copper Sword yields 2 Metal Parts; Iron Body yields 6; Basic Health Potion yields 6 Potion Mix; Super Combat XP Potion yields 34. Unlike variable main-action drops, these conversions have fixed yields.

Conversions join the selected dependency graph as production steps. Resource balances cover demand first; remaining demand is rounded up to whole source items. Shared source stock and its crafting inputs are aggregated across the entire graph. Surplus remains projected output, never owned stock. Conversion cycles stop explicitly, and changed source stock/catalogs invalidate observations. Neither choosing an input nor viewing its recipe calls a game conversion or changes the current action.

The tree retains compact square icons and centered top-down branches, with a larger double-framed target, shaded item tiles and tinted shortage stems. All detail text remains in the modal. The assembled shopping workflow tests cover fixed-yield rounding, shared source demand, saved defaults without a target, reload/clear/identity behavior, invalidation, cycles and stock-covered conversions.

Live verification used the current Divine Combat Loot Potion target of 10,000 (3,837 owned). Selecting Basic Health Potion temporarily expanded Potion Mix into its potion recipe. Required mix 308,150 minus 55,991 owned left 252,159; the modal correctly showed 42,027 conversions at 6 per potion and 3 projected surplus. Native options included all 27 potion inputs and 136 equipment inputs. The Chilli/Farming action continued throughout.

Final verification: `npm run build` and `npm run check` passed all 344 tests, including 32 shopping workflows, JavaScript syntax, deterministic assembly and whitespace checks. The mixed known/unknown resource-demand regression preserves known source and deeper ingredient subtotals. Both Standards and Spec reviews have zero unresolved findings. Live native choices survived reload; at 390 × 844 the card measured 370 px with no horizontal overflow, and the viewport was restored. The temporary Potion Mix input was cleared at the user's request; the user's Astral Compass selection for Metal Parts was preserved.

Connector refinement: recipe branches now use thicker lines, rounded outer corners, diamond output junctions and directional tips at ingredient icons. Incoming stems follow the ingredient's supply color; uncertain stems are dashed, and hover/keyboard focus accents the connection. Single-child paths remain straight. Geometry and the multilevel live tree were visually checked; all 344 checks pass and both review axes report zero findings. This change affects styling only.

The next visual refinement removes directional arrows. Filled diamonds now show green for covered supply, amber for uncertain supply and red for insufficient supply. Their independent color variable preserves status during connection hover/focus. Verified on the live multilevel tree; the full 344-test check and both review axes pass.

## Charcoal from all available wood

Charcoal automatically considers all native wood conversion inputs, without a default selection. The native `createCharcoal` flow credits quantity times the fixed yield table: Pine 1, Spruce 2, Birch 3, Teak 4, Mahogany 5, Ironbark 6, Redwood 7 and Ancient 8. Discovery validates the native table using Pine/Ancient artwork and yield anchors.

The planner reserves every existing recipe requirement before allocating spare owned wood, highest yield first, rounding to whole logs. Shared wood is allocated once. Projected conversion output and surplus remain separate from the native Charcoal balance. The remaining acquisition shortfall drives the summary and supply colors. Wood stock changes invalidate the observation even when a wood type was not used in the previous plan. Unknown balances remain uncertain; pending loot and projected production never provide convertible wood. Used wood appears beneath Charcoal in the tree; its modal lists all eight yields, available logs, planned conversions and output. No conversion is executed.

The assembled workflow tests cover mixed wood types, competing recipe requirements, shared Charcoal demand, round-up surplus, deep balance changes, unknown stock, pending loot exclusion and Charcoal already covered by stock. Live native validation showed 39,559,770 required, 116,345 owned and 382,187 convertible from spare wood, correctly leaving 39,061,238 to acquire. All eight native wood types appeared in the modal.

Final verification: build, complete check, deterministic assembly, syntax and whitespace validation pass all 347 tests, including 35 shopping workflows. Standards and Spec reviews have zero unresolved findings.

Presentation follow-up: diamonds gently breathe over 3.2 seconds using opacity and scale, disabled under reduced-motion preferences. Charcoal conversion wood branches are hidden from the tree while the complete wood breakdown and calculations remain available in Charcoal details. Direct wood ingredients of other recipes remain visible. Live tree inspection confirmed the hidden branches; all 347 tests and both reviews pass.

Connection-flow refinement: continuous SVG paths replace the separate CSS border segments, closing rounded-corner and endpoint gaps. Tree layout assigns explicit subtree widths so paths meet their icon centers at every depth. Green paths have a moving light dash over a solid green base; amber/red paths remain solid. Overlapping shared segments are painted in severity order so green siblings cannot cover a shortage. Bend radius shrinks for nearly centered children to avoid reversing along short horizontal spans. Reduced motion removes the moving overlay and diamond pulse. The live green Gold Gloves chain was visually checked with both single-child and branching connections.

Final connector verification: all 347 tests pass after updating the tree markup assertion for explicit sizing. Live mobile panel width and scroll width both measured 370 px; the temporary viewport was reset. Review findings (unused CSS variables and overlapping elbows on short spans) were corrected.

## Recipe Calc presentation

The card is now branded Recipe Calc with a small trademark symbol. Its header has a labelled refresh icon and compact Edit control; Inputs and Clear target live with the target editor. Green connection highlights now move from ingredients toward the finished item.

Production modals present Required, Owned and To produce as three metric cards, followed by attempt count, skill/level and a short native recipe link. Yield, eligibility, stock allocation and projected surplus remain available under Recipe details. Ingredient captions and observation footnotes are shorter. The disclosure state belongs to the selected item and survives live observations; owner switches and opening another item reset it. Workflow coverage verifies Inputs discoverability and disclosure persistence while balances update.

Verification: the live Super Multi Craft Potion modal shows the new metric cards and collapsed notes. At a 390px viewport, modal width and scroll width both measured 364px; the viewport was restored. Build and complete check pass all 348 tests, including 36 shopping workflows. Both review axes have zero unresolved findings.
