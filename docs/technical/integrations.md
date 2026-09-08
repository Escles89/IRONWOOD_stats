# Native integrations

`SourceAdapter.capture(document)` reads the mounted skill interface: current action, combatants, loot, consumables, materials, mastery and finite queue. The DOM readers accept a document so tests can supply representative native fixtures. Native XP/hour excludes the Pancake estimator; the hidden native Estimates tab can be selected to expose its value.

`withPage(path, selector, task)` creates a same-origin frame, waits for the source selector, calls the task and removes the frame in a finally block. Feature services add specific readiness loops before recording values or performing actions. No direct private game API is used.

Passive capture runs for visible source pages and retains the existing readiness/throttle rules. House capture merges the visible structure without rewriting other structure timestamps. Equipped items retain their existing separate storage key as well as the normalized cache record.

`NativeControlAdapter.run(document, command)` routes loot, automations, attunement, taming, challenge and craft commands. Game-changing Status actions enforce the automation toggle and their own busy guards. Craft All uses the explicitly clicked dialog control and stays independent of that toggle.

Automation collection opens House once, clicks native `automate-component > .action-buttons > button` Collect controls, and waits for the loot decrease. A disabled pending button alone is not confirmation. Errors stop the batch and remain visible; successful rows render progressively. Quest, challenge, map, taming and attunement workflows retain their bounded confirmation loops.

Adventure snapshots include numeric RP, map cost, daily/storage counts, reset/expiry and map automation results. Map creation confirms both counters and RP deduction; common through epic maps are sold, legendary maps retained. Guild event participation matches the stored signed-in player name exactly.

The quantity-precision adapter discovers Ironwood's already-loaded `layoutNumber` and `shortNumber` Angular pipe modules by their metadata names, without hardcoded build module IDs. It retains full numeric precision on Status, Inventory, and source skill routes and delegates to the original formatter elsewhere. It does not read game state, call endpoints, or change layout breakpoints. Missing or changed modules leave the DOM fallback active. Debug reports whether both formatters were patched.

After a challenge or Attunement batch attempts a native mutation, `synchronizeNativeGame()` runs once after the frame closes and before the recap. It discovers the existing Angular platform and native service types from loaded module metadata, calls Ironwood's own `getUser()` client method, and applies the native header's `checkSync` sequence: `syncUser`, then action, automation, and expedition reconciliation. It preserves the route and does not copy the frame's simulated action history or construct API requests. Pending calls are coalesced; requests time out after 15 seconds and unsubscribe. Changed characters, incomplete responses, unsupported builds and network errors leave a visible recap warning.

The synchronized inventory is mapped through Ironwood's native item catalog, updating exact cached amounts and new rewards without an Inventory-page lookup. Unknown item shapes preserve the old cache and mark it for reconciliation. Runtime synchronization timing and errors appear in Debug. This adapter depends on Angular's existing platform module injector structure; a changed structure fails closed without creating another application.

Attunement collection keeps its busy guard until post-batch synchronization completes. Partial runs synchronize too, and their confirmed slot totals remain separate from synchronization errors. A missing/loading XP row is not a zero; selection must finish before Collect is clicked. Native state application explicitly re-enters Angular after the asynchronous response so mounted pages receive their updates without navigation or reload.

Attunement reward reporting observes the existing native `lootAttunement` response in the collection frame. It forwards the original observable through a single subscription, records XP, loot and points, and restores the method after each slot. It never creates another collection request to obtain a receipt. Item names and images come from the native catalog; categories come from the selected skill and Tribute requirement. Synchronization accepts both epoch timestamps and Ironwood’s ISO date strings, preserving the original value for the native loop handlers.
