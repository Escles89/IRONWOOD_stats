# Native integrations

`SourceAdapter.capture(document)` reads the mounted skill interface: current action, combatants, loot, consumables, materials, mastery and finite queue. The DOM readers accept a document so tests can supply representative native fixtures. Native XP/hour excludes the Pancake estimator; the hidden native Estimates tab can be selected to expose its value.

`withPage(path, selector, task)` creates a same-origin frame, waits for the source selector, calls the task and removes the frame in a finally block. Feature services add specific readiness loops before recording values or performing actions. No direct private game API is used.

Passive capture runs for visible source pages and retains the existing readiness/throttle rules. House capture merges the visible structure without rewriting other structure timestamps. Equipped items retain their existing separate storage key as well as the normalized cache record.

`NativeControlAdapter.run(document, command)` routes loot, automations, attunement, taming, challenge and craft commands. Game-changing Status actions enforce the automation toggle and their own busy guards. Craft All uses the explicitly clicked dialog control and stays independent of that toggle.

Automation collection opens House once, clicks native `automate-component > .action-buttons > button` Collect controls, and waits for the loot decrease. A disabled pending button alone is not confirmation. Errors stop the batch and remain visible; successful rows render progressively. Quest, challenge, map, taming and attunement workflows retain their bounded confirmation loops.

Adventure snapshots include numeric RP, map cost, daily/storage counts, reset/expiry and map automation results. Map creation confirms both counters and RP deduction; common through epic maps are sold, legendary maps retained. Guild event participation matches the stored signed-in player name exactly.
