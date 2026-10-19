# Installation

1. Install Tampermonkey in your browser.
2. Create a new userscript and replace its contents with [ironwood-stats.user.js](../../ironwood-stats.user.js).
3. Save, reload Ironwood RPG, and select **Status** above Inventory.

**Skills** appears beneath Status and can also be bookmarked at `/skills`. Use it for remembered actions, ranks and the recipe planner; Equipment’s **Consumables** tab contains supply reserves and usage estimates.

Install only one full copy. Pancake-Scripts may remain enabled. Old `/stats` bookmarks automatically open `/status`.

Both **Enable automation** and **Allow fallback lookups** start off for new installations. Configure them in Settings beside the main money bar. Existing preferences survive updates.

Developers using the local loader should follow [the release and development guide](../technical/release-process.md).

Tampermonkey manages updates through Greasy Fork, following your manager's update settings. The script leaves Greasy Fork's update and download addresses intact. The local development loader continues to use your checkout.

For Greasy Fork installations, the script reads the installed update address from Tampermonkey and checks the published version on startup and every six hours while the game is visible. Opening Settings also checks immediately. Its update control reports **Checking…**, **Up to date**, **Update available · v…** or **Check failed · Retry**. Selecting the control checks again and opens Tampermonkey’s userscript installer only when a newer public release is confirmed. Offline checks leave the dashboard working and retry after 15 minutes. Local loaders and pasted installations use the project’s public [Greasy Fork listing](https://greasyfork.org/en/scripts/594029-ironwood-rpg-status-page) for the same availability check.

The sidebar logo shows the installed version as **with status panel v…**. Settings shows the available public version when it is newer. A local build ahead of the public release is not offered a downgrade.
