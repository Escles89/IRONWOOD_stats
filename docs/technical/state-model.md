# Application state

`createAppState()` returns independent mutable containers; `AppState` is the runtime instance.

| Area | Data and ownership |
| --- | --- |
| `live` | `action`, `combatants`, `loot`, `consumables`, `materials`, mastery progress, finite queue, native observation timestamp/route; previous combat and quantity observations; revive timing |
| `cache` | `schemaVersion: 2`, `records` keyed by feature, each with capture time, source, feature schema and optional expiry/refresh time |
| `derived` | Projected automation rows, potion/consumable rows, elite classification, countdowns and panel-ready activity flags |
| `ui` | Page/sidebar references, active route, rendering signature, modal/preferences state, pending refreshes, action locks, transient notices and event/effect maps |

`SourceAdapter.capture(document)` normalizes rendered observations and writes `live` once per render. Combat transitions compare previous fighters and update retained effect records. The status service builds derived values from those observations and CacheStore records before rendering. Services write action locks and notices directly through `AppState.ui`.

The cache persistence boundary reloads the current localStorage envelope so captures by temporary frames are not lost to stale in-memory copies. Explicit UI preferences remain in their original separate keys.
