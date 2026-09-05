# Testing

Run `npm run build`, then `npm run check` (or `node src/build/check.js`). No dependency installation is needed. `npm test` runs the focused Node suites; `npm run build:check` validates reproducibility without writing the artifact.

The check command syntax-checks all source JavaScript and generated output, verifies deterministic assembly, runs every test recursively, and runs `git diff --check`. The GitLab pipeline runs the same command using Node 22. Assembly validates publication metadata, the Ironwood match scope and the strict 2 MiB size limit.

Coverage includes independent state containers; cache envelope migration, freshness, expiry, reset and preferences; refresh gating/concurrency; interval projections; revive parsing; badge classification/order; combat transitions and event expiry; native claim confirmation, timeout, batch failure and rate preservation; idle rendering; native DOM observation fixtures; and generated metadata/loader behavior.

Manual acceptance should exercise the connected browser with the local loader: idle, crafting/gathering, combat hits/heals/death/respawn/revive, changing consumables, toggles, passive page capture and a native claim batch. Unit fixtures cover these transitions without changing a real character's running activity. Browser automation is not part of CI in this first refactor.
