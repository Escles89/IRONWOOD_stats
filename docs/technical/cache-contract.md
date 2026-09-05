# Cache contract

The new key is `iw-stats-cache-v2`. Its envelope is `{ schemaVersion: 2, records: { ... } }`. The old `iw-stats-cache-v1` is deliberately ignored. Invalid JSON, an incompatible envelope, or a non-object records container starts empty.

`CacheStore.get(key)` reads a feature record; omitting the key returns all records. `set(key, value, metadata)` merges a default `checkedAt` and native source with feature fields and optional metadata, persists the envelope, and invalidates the rendering signature. `isFresh(key)` applies existing feature schemas, daily boundaries, explicit expiry, refresh times and TTLs. `invalidate(key)` removes one record; `reset()` clears all data records. Neither operation removes preferences.

Feature schemas are unchanged: quests 2, adventure 10, challenges 3, taming 2, automations 4, attunement 3, mastery 1, guild event 7 and guild trial 3. Inventory requires an `allItems` array. Missing or invalid capture timestamps are stale. Equipped data and mastery have infinite normal TTL, while explicit expiry takes precedence.

[User refresh table](../user/cache-and-refresh.md) documents the actual cadence. Daily boundaries use 01:00 UTC throughout the year. Automation records retain per-structure capture times; a batch snapshot uses the oldest capture time and bounds expiry by queue completion and the 24-hour limit.

`SyncCoordinator.refresh(key, { force, load })` returns cached data when fresh or lookups are disabled, joins a pending same-key refresh, and releases its lock on success or failure. `syncStale` sequences feature-specific readiness workflows; simple sources use the coordinator and complex feature workflows retain their existing guards. Forcing a refresh never bypasses the global cache-lookup preference.
