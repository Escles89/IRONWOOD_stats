# Event effects

`EventLedger.record(eventKey, payload, ttl)` records a new active event and returns true. Repeated active keys return false without extending expiry. `isActive(eventKey)` checks expiry and removes expired entries; recording also prunes expired records. The ledger lives in `AppState.ui.events`.

The combat service compares normalized fighters with the previous observation to detect hit, heal, defeat, and replacement. Zero HP followed by positive HP counts as an enemy respawn even when name and image are unchanged. Player recovery is healing rather than enemy spawn. Revive text accepts seconds, minutes, and clock formats.

Combat events use side/type/observation-time keys. Existing effect locks and retention intervals remain: shared heal/spawn lock 1.8 seconds, heal 3.2 seconds, death 3.6 seconds, spawn 4.5 seconds. Effect records retain start times. The renderer uses those timestamps for CSS delays so a loot update cannot restart an active effect from its beginning.

Quantity changes compare previous loot/consumable maps and record four-second ledger events and notices. Repeated unchanged amounts produce no new event. Tests cover unchanged polling, expiry, repeated death observations and same-sprite respawn.

Materials use separate previous-value and notice maps in AppState. Their four-second deltas are rendered as child spans next to the quantity, preserving the animation during lightweight updates and resuming with a negative delay after a full render. No change is emitted on initial capture, unchanged polling, or reappearing materials.

Quantity notices float upward for positive changes and downward for negative changes across loot, consumables, and materials. Both directions keep the same duration, elapsed-time restoration, and reduced-motion behavior.
