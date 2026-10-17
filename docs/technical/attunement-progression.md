# Attunement passive progression

`apps/attunement/native.js` discovers the native passive and slot catalogs and cost helper from the Attunement route component's named bindings. It reads the current character directly; recommendations are not persisted or inferred from cached Tribute balances. Native Attunement IDs are distinct from skill IDs, and region membership is mapped through the catalogs.

Collected, unspent shards are earned points minus spent points. Pending shards come only from matching slot loot and are summed once per skill across slots. Missing pending loot is unknown. Unknown definitions, invalid balances, incompatible region membership and character transitions disable recommendations rather than inventing affordable upgrades.

`progression.js` selects one next passive rank per region, ordered by current passive level, remaining shortfall after known collection, number of set levels completed, current slot selection, and stable catalog order. A set advances only if the purchased passive is its sole minimum. Regional and completion sets are considered; Defense remains one shared skill. Candidates are alternative purchases against the same observed balance, never a simulated batch that spends that balance repeatedly.

The status icon independently reports whether any non-capped passive is affordable now or after collection, including higher levels that are not the balanced target. Available-now takes precedence when both kinds exist. The native card recommends buying an affordable target before further training and recalculates from live state after purchase or collection.

`view.js` mounts an informational card after Slots, or after Menu on other Attunement subviews. It inherits the current native card's Angular style scope and preserves the native controls. The visible-page scheduler refreshes the card; unchanged markup produces no DOM writes, and the observer ignores changes inside it. The status render signature includes availability so purchases refresh the indicator without requiring a cache change.

Validation covers ranking, first unlocks, rising costs, shared Defense and competing passive balances, regional/completion sets, pending rewards, unavailable data, native ID mapping and binding discovery. The live game check is read-only: it never purchases upgrades, collects rewards or changes slots to test the feature.
