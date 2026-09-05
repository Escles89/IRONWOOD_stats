# Architecture

The repository uses Django-inspired feature directories, not the Django framework. JavaScript modules are assembly units sharing one private userscript IIFE. They do not use ES module imports, a module loader, or network dependencies.

`src/build/modules.json` is the explicit dependency order. Constants and state initialize first, core contracts and adapters follow, then feature services, views, UI wiring, and the entrypoint. Function declarations can refer to later modules because startup runs only after assembly has defined every contract.

| Boundary | Responsibility |
| --- | --- |
| `core/` | Application state, cache persistence/freshness, refresh coordination, event ledger, formatting and constants |
| `integrations/ironwood/` | Native DOM observations, temporary route frames, passive capture, native action dispatch and Craft All |
| `integrations/pancake/` | Native estimate selection, interface controls, trait grouping; excludes Pancake estimator values |
| `apps/status/` | Panel derivation, badges, dashboard composition, lightweight updates and CSS |
| `apps/combat/` | Revive parsing, normalized fighter transitions, effect timestamps and fighter markup |
| `apps/automations/` | Native structure capture/claims, fixed-interval projections, automation table |
| `apps/inventory/` | Inventory, equipped potions, mastery capture and potion table |
| Other feature apps | Quest, adventure, challenge, attunement, guild and taming capture/action workflows |
| `ui/` | Shared preferences, route/header/sidebar layout and delegated input handling |
| `entrypoint.js` | Startup, mutation observation and live render scheduling |

Feature functions retain their existing native readiness and confirmation loops. The initial refactor preserves these workflows instead of changing selectors or production formulas. Runtime mutable values belong to AppState. Shared named functions remain private to the generated closure; module boundaries are conventions checked by review and tests.

The root userscript is generated and remains checked in. The loader and installation format are unchanged. Edit source modules, never the publication file directly.
