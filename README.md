# Ironwood RPG Status

A Tampermonkey userscript adding a live Status dashboard alongside Pancake-Scripts, with optional native-control automations and cached progress panels.

Install the standalone [ironwood-stats.user.js](ironwood-stats.user.js) using the [installation guide](docs/user/installation.md). The local loader continues to use that generated file.

- [User documentation](docs/user/README.md): features, settings, and troubleshooting.
- [Technical documentation](docs/technical/README.md): architecture, tests, and releases.

Development requires Node 22 or later and no package installation. Edit `src/`, run `npm run build`, then `npm run check`. Commit the generated userscript with its source changes.

Licensed under the [PolyForm Noncommercial License 1.0.0](LICENSE). Use, sharing, and modification are permitted for noncommercial purposes. This is source-available software; commercial use is not permitted under this license.
