# Ironwood RPG Status

A Tampermonkey userscript adding Status and Skills pages alongside Pancake-Scripts. Follow current actions and guild countdowns, start or stop remembered activities, inspect consumable reserves and usage estimates, track mastery and Traits, and plan recipe chains with optional automatic progression.

Install the standalone [ironwood-stats.user.js](ironwood-stats.user.js) using the [installation guide](docs/user/installation.md). The local loader continues to use that generated file.

- [User documentation](docs/user/README.md): features, settings, and troubleshooting.
- [Ironwood gameplay reference](docs/reference/ironwood-game.md): skills, resources, parallel activities and the game rules behind the dashboard.
- [Technical documentation](docs/technical/README.md): architecture, tests, and releases.
- [Project walkthrough](docs/project-overview.md): how the features and data flow fit together, with a suggested reading order.
- [Player feature ideas](docs/player-feature-ideas.md): grounded proposals and small first versions to discuss.
- [Interface style guide](docs/design/style-guide.md): shared rows, controls, progress bars and responsive behavior.
- [Quick skill panel specification](docs/specs/quick-skill-panel.md): the implemented behavior, native integration constraints and acceptance record.

Development requires Node 22 or later and no package installation. Edit `src/`, run `npm run build`, then `npm run check`. Commit the generated userscript with its source changes.

Licensed under the [PolyForm Noncommercial License 1.0.0](LICENSE). Use, sharing, and modification are permitted for noncommercial purposes. This is source-available software; commercial use is not permitted under this license.
