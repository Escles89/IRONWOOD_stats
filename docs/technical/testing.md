# Testing

Run `npm run build`, then `npm run check` (or `node src/build/check.js`). No dependency installation is needed. `npm test` runs the focused Node suites; `npm run build:check` validates reproducibility without writing the artifact.

The check command syntax-checks all source JavaScript and generated output, verifies deterministic assembly, runs every test recursively, and runs `git diff --check`. The included `.gitlab-ci.yml` runs the same command using Node 22 when used on GitLab; the configured repository remote is GitHub. Assembly validates publication metadata, the Ironwood match scope and the strict 2 MiB size limit.

Coverage includes independent state containers; cache envelope migration, freshness, expiry, reset and preferences; refresh gating/concurrency; interval projections; revive parsing; badge classification/order; combat transitions and event expiry; native claim confirmation, timeout, batch failure and rate preservation; idle rendering; native DOM observation fixtures; and generated metadata/loader behavior.

Manual acceptance should exercise the connected browser with the local loader: idle, crafting/gathering, combat hits/heals/death/respawn/revive, changing consumables, toggles, passive page capture and a native claim batch. Unit fixtures cover these transitions without changing a real character's running activity. Browser automation is not part of the bundled CI configuration.

## Current interface coverage

- `header-guide.test.cjs`: guide navigation and illustrative examples; header controls and native gold button preservation.
- `skills-page.test.cjs`, `quick-skills-clicks.test.cjs`, `skill-ranks.test.cjs`: virtual-page history, stable input activation, owner-scoped ranks, cache TTL and failure backoff.
- `quick-skills-max.test.cjs`, `quick-skills-stop.test.cjs`: fresh maximum quantities, native stops, runner pause and independent collection/synchronization results.
- `consumables-tab.test.cjs`: native controls, category reserves, usage estimates and cleanup on tab changes.
- `current-action-progress.test.cjs`, `current-action-queue.test.cjs`, `status-countdowns.test.cjs`: action-image progress, labelled XP/queues, known/unknown duration and expiry.
- `skills-planner-layout.test.cjs`, `mastery-tracker.test.cjs`, recipe and Trait suites: shared page/modal layouts, tracked versus viewed mastery, planning and progression contracts.

For interface changes, inspect desktop and narrow layouts after the final build, including Guide chapter scrolling, long names, rank/action alignment, labelled progress, category tab transitions and focus restoration. Gameplay mutations need a separate deliberate acceptance exercise; read-only inspection and fixtures do not establish live mutation success. Historical validation sections retain their original revision/date and test counts.

## Documentation and guide validation — 19 October 2026

After the documentation refresh, `npm run check` passed all 569 tests, including guide chapter targets and non-interactive badge examples, source/generated syntax, deterministic assembly and whitespace checks. A local link check found no missing targets across 177 documentation links. Live read-only inspection confirmed the new Skills & plans chapter and expandable Mastery/Traits explanations, with 372 px content and scroll widths at a 390 × 844 viewport. Escape closed the guide and restored focus to its header trigger; the temporary viewport was reset. No gameplay start, stop, claim or plan change was part of this guide validation.
