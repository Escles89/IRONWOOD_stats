# Rendering and performance

The entrypoint schedules `StatusRenderer.render(AppState)` every 250 ms. Hidden dashboards return immediately. The status service captures native values, computes panel data, and compares a signature. When the signature matches, `StatusRenderer.updateLive(state)` updates text, meters, quantities and countdowns without replacing the dashboard.

Structural or displayed-content changes call the status markup composer and feature views. Potions, automations and combat each own their markup; the status view composes the overall layout. CSS lives in `apps/status/styles.css` and is serialized into the standalone build.

Combat animation timestamps survive full replacement. Negative CSS delays resume one-shot effects at their original elapsed time. Quantity and consumable notices use the same approach. Repeated polling does not extend event expiry.

Automation projections are pure arithmetic on fixed intervals and the per-structure snapshot timestamp. They cap progression at the remaining queue and preserve output rate after collection. Live projection never calls a source loader.

When there is no action, location selectors accept null and the dashboard renders its empty-action panel alongside the other sections. The error pane is reserved for actual rendering errors.
