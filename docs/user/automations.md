# Automations and preferences

Open Preferences from the Status header. **Enable automation** controls game-changing Status actions and background automations. **Enable cache lookups** controls background information retrieval independently. Both default to off; explicit preferences survive upgrades and cache repair.

## Structure production

The Automations panel shows each structure's selected action, projected loot, and remaining queue. Values advance using that structure's known production interval without opening a background page for each update. Opening House → Automate refreshes the visible structure.

The single **Claim** button opens House once and collects structures sequentially. Each row refreshes when Ironwood confirms its loot decreased. If confirmation fails, the batch stops and shows an error; completed rows remain updated. Collection preserves the known production rate.

## Other controls

Choose exactly five generic skills for daily quest completion. Your choices apply when their daily actions change. Attunement and Taming Claim buttons use the corresponding native collection controls.

Native crafting dialogs include **Craft All**. It reads the current Craftable amount and submits it through the native Craft control. This explicit dialog action remains available independently of the background automation toggle.

## Challenge automation

The Challenges row shows the cached number of available Challenge Scrolls and remaining Ironwood auto-completes. Its **Run** button opens a temporary same-origin Challenges page, selects the configured region, starts the currently selected challenge tier, uses an available auto-complete, selects the configured reward skill, and claims the reward. It repeats up to `min(scrolls available, auto-completes remaining)`. The default is Mountain + Defense.

The displayed `used / limit` Auto Challenge Completes value is converted to a remaining allowance with `limit - used`. Accounts without an auto-complete allowance run zero challenges. The run is bounded and fails closed if no scroll or auto-complete remains, a native control does not appear, or the scroll reduction cannot be confirmed. Region and skill can be changed from **Dashboard options → Challenges**; only skills supported by the selected region are offered.

## Automatic map creation

When Adventure data refreshes, Status uses Ironwood's native **Create** control until the daily map limit is reached. After every creation it re-reads RP from the **Create Map** requirements card and confirms both the daily counter increase and the full RP-cost deduction. Legendary maps are retained; Common, Uncommon, Rare, and Epic maps are sold through the native **Sell** control. The cached run records starting RP, remaining RP, and RP spent.

The run is bounded to 12 creations and fails closed if storage is full, RP is insufficient, a control is unavailable, rarity cannot be read, or a create/sell counter change is not confirmed. The Status page displays **Complete** once `dailyMapsCreated` reaches `dailyMapsLimit`; an active Adventure still takes precedence.
