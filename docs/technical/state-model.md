# Application state

`createAppState()` returns independent mutable containers; `AppState` is the runtime instance.

| Area | Data and ownership |
| --- | --- |
| `live` | `action`, `combatants`, `loot`, `consumables`, `materials`, mastery progress, finite queue, native observation timestamp/route; previous combat and quantity observations; revive timing |
| `cache` | `schemaVersion: 2`, `records` keyed by feature, each with capture time, source, feature schema and optional expiry/refresh time |
| `derived` | Projected automation rows, consumable rows, elite classification, countdowns and panel-ready activity flags |
| `ui` | Page/sidebar references, active route, rendering signature, modal/preferences state, pending refreshes, action locks, transient notices and event/effect maps |

`SourceAdapter.capture(document)` normalizes rendered observations and writes `live` once per render. Combat transitions compare previous fighters and update retained effect records. The status service builds derived values from those observations and CacheStore records before rendering. Services write action locks and notices directly through `AppState.ui`.

Feature state under `ui` includes both virtual pages, the Quick Skills interaction hold, ephemeral consumable usage samples/category overview, separate tracked and temporarily viewed mastery selections, Trait changes, and recipe editor/runner state. Consumable samples are not persisted or used as owned inventory.

Quick Skills history/amounts, ranks, mastery observations, shopping targets and planned actions use their own validated character/game-mode storage. Rank observations have a one-hour TTL; gameplay snapshot age alone does not schedule reads. Recipe runner records distinguish confirmed tracked work from interrupted requests requiring review. See the individual [feature contracts](README.md).

The cache persistence boundary reloads the current localStorage envelope so captures by temporary frames are not lost to stale in-memory copies. Explicit UI preferences remain in their original separate keys.
