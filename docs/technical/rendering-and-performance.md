# Rendering and performance

The entrypoint requests a refresh every 250 ms through a coalesced `requestAnimationFrame` callback. This is the native-data sampling interval; CSS animations run independently at the browser's frame rate. Hidden tabs and hidden dashboards skip capture and rendering, cancel queued frames, and request a fresh update when shown.

After native capture and event detection, the status service compares a compact signature **before** constructing inventory maps, potion lists or markup. A monotonic in-memory cache revision replaces serialization of the full inventory in that signature; local writes and external storage changes both advance it. Loot quantity changes update the existing number/notice nodes without composing the whole dashboard. Structural changes, consumables, preferences, cache updates and bonus expiry still invalidate the signature.

A local fixture benchmark with 1,500 inventory items and 15 loot rows measured median unchanged-update work at approximately 0.313 ms before this change and 0.010 ms afterward (five batches of 500 iterations after warmup). This isolates JavaScript derivation with a supplied native snapshot and mock DOM; it does not measure browser FPS or painting costs. Regression tests verify the fast path skips inventory access while cache changes still rebuild.

Health fills animate `scaleX` with a fixed layout width instead of changing element width on each animation frame. Compositor hints are limited to health fills, the two fighter sprites and temporary quantity notices.

Structural or displayed-content changes call the status markup composer and feature views. The renderer reconciles text and attributes on existing nodes and inserts or removes only the affected children. Fighter images, health bars and unrelated panels stay mounted during combat effects. Changing the overall grid layout still rebuilds the grid. CSS lives in `apps/status/styles.css` and is serialized into the standalone build.

Combat effect delays change only when that specific event timestamp changes; a new hit does not fast-forward an ongoing heal. Hit classes remain active for the impact duration instead of being removed on the next 250 ms poll. All quantity notices use separate number and animation spans. Each notice is keyed by item and event timestamp, and its delay is set only when the span is created. Renders leave those spans to the live updater. Repeated polling neither restarts an animation nor extends its expiry. Number formatting reuses one locale formatter. Cache reads reuse the parsed snapshot until the storage string changes, including writes from other pages. The native mutation observer ignores changes inside the dashboard.


Automation projections are pure arithmetic on fixed intervals and the per-structure snapshot timestamp. They cap progression at the remaining queue and preserve output rate after collection. Live projection never calls a source loader.

When there is no action, location selectors accept null and the dashboard renders its empty-action panel alongside the other sections. The error pane is reserved for actual rendering errors. Enemy remount gaps use the last combat snapshot for up to 2.5 seconds, then expire to idle. A newly started noncombat action takes precedence over that snapshot. Revive parsing reads native skill content only, preventing dashboard text from feeding back into its own timer.

The Current Action trial badge uses `guildTrialBonusActive` to require both ongoing participation and an exact match between the trial skill and the active action skill. The resulting flag participates in the render signature. The Status row continues to show participation regardless of the current action.
