# Installation

1. Install Tampermonkey in your browser.
2. Create a new userscript and replace its contents with [ironwood-stats.user.js](../../ironwood-stats.user.js).
3. Save, reload Ironwood RPG, and select **Status** above Inventory.

Install only one full copy. Pancake-Scripts may remain enabled. Old `/stats` bookmarks automatically open `/status`.

Both **Enable automation** and **Allow fallback lookups** start off for new installations. Configure them in Settings beside the main money bar. Existing preferences survive updates.

Developers using the local loader should follow [the release and development guide](../technical/release-process.md).

Tampermonkey manages updates through Greasy Fork, following your manager's update settings. The script leaves Greasy Fork's update and download addresses intact. The local development loader continues to use your checkout.

For Greasy Fork installations, the script reads the installed update address from Tampermonkey and checks the published version on startup and every six hours while the game is visible. A green up arrow appears immediately to the right of the coins in the main header when a newer version is available. Hover for the available and installed versions; click to open the script's Greasy Fork page. Offline checks leave the dashboard working and retry after 15 minutes. Local loaders and pasted installations use the project’s public [Greasy Fork listing](https://greasyfork.org/en/scripts/594029-ironwood-rpg-status-page) for the same availability check.

When your installed version is ahead of the public release, the subtitle under Status shows both versions, for example `v1.13.16 · Public v1.13.14`. The public number appears after a successful check or from the last saved result. The green update arrow only appears when the public release is newer than your installed version.
