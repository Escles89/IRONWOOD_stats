# Automations and preferences

Open Settings using the sliders beside the main money bar. **Enable automation** controls game-changing Status actions and background automations. **Allow fallback lookups** controls background information retrieval independently. Both default to off; explicit preferences survive upgrades and cache repair.

## Structure production

The Automations panel shows each structure's selected action, projected loot, and remaining queue. Values advance using that structure's known production interval without opening a background page for each update. Opening House → Automate refreshes the visible structure.

The single **Claim** button opens House once and collects structures sequentially. Each row refreshes when Ironwood confirms its loot decreased. If confirmation fails, the batch stops and shows an error; completed rows remain updated. Collection preserves the known production rate.

## Other controls

Daily quest completion and map creation require both **Enable automation** and **Allow fallback lookups**. They are checked at startup, when automation is enabled, when the tab becomes visible, and once per minute while visible. These checks use cached values; a background page is opened only for pending daily work. Completed tasks wait until the next daily reset. Incomplete or failed attempts wait at least 15 minutes before retrying; known RP or storage shortages wait for a native page update or the next daily reset.

Choose exactly five generic skills for daily quest completion. Your choices apply when their daily actions change. Attunement and Taming Claim buttons use the corresponding native collection controls.

Native crafting dialogs include **Craft All**. It reads the current Craftable amount and submits it through the native Craft control. This explicit dialog action remains available independently of the background automation toggle.

## Challenge automation

The Challenges row shows available Challenge Scrolls, the selected region and reward skill. Remaining Ironwood auto-completes are tracked for the loop and reported in its recap. Its **Claim** button opens a temporary same-origin Challenges page, selects the configured region, starts the currently selected challenge tier, uses an available auto-complete, selects the configured reward skill, and claims the reward. It continues while usable scrolls or enabled paid entries and auto-completes remain, with a hard limit of 15 scroll starts plus six paid starts per run. The default is Mountain + Defense.

The displayed `used / limit` Auto Challenge Completes value is converted to a remaining allowance with `limit - used`. No new challenge is started without an auto-complete allowance. The run is bounded and fails closed if no scroll or auto-complete remains, a native control does not appear, or the scroll reduction cannot be confirmed. Region and skill can be changed from **Dashboard options → Challenges**; only skills supported by the selected region are offered.

**Cancel blocked challenges** is an optional switch under **Dashboard options → Challenges**, off by default. A loaded challenge showing **Cannot Auto** or a disabled auto-complete control shows an orange warning instead of Claim while cancellation is off. Turning the switch on allows the next Claim run to use the native Steps trashcan and confirm **Abandon Challenge**, then continue with available scrolls. This also covers an unavailable Auto Limit control on an already active challenge. Cancellation does not refund the scroll or gold used to start the challenge. The run stops if abandonment is not confirmed, and every newly started scroll counts against the batch limit, including cancelled challenges.

Already active challenges are captured even when Ironwood hides Start requirements. Known inventory counts are preserved until the native page supplies fresh counts. Loading transitions alone never trigger cancellation.

**Buy scroll entries** is another optional switch, off by default. During Claim, the loop uses available scrolls first, then uses Ironwood's **Buy → Challenge Entry → Buy** controls to start paid challenges. Gold entries start directly and do not add or consume inventory scrolls. They can continue after the daily scroll cap, but only while auto-completes remain.

**Maximum purchase tier** selects the highest price per entry: 10K, 20K, 40K, 80K, 160K or 320K. The default is 320K, inclusive; 640K and higher are never purchased. From the first tier, all six entries cost 630K total. The game doubles prices after each purchase and resets them weekly. Each native quote is checked again before spending. Insufficient gold, a disabled purchase, an unreadable price, a failed confirmation or an unexpected price progression stops purchasing. Blocked paid challenges follow the cancellation switch and their gold is not refunded. The run records purchased entries and total gold spent in its result.

## Automatic map creation

When daily map creation is due, Status uses Ironwood's native **Create** control until the daily map limit is reached. After every creation it re-reads RP from the **Create Map** requirements card and confirms both the daily counter increase and the full RP-cost deduction. Legendary maps are retained; Common, Uncommon, Rare, and Epic maps are sold through the native **Sell** control. The cached run records starting RP, remaining RP, and RP spent.

The run is bounded to 12 creations and fails closed if storage is full, RP is insufficient, a control is unavailable, rarity cannot be read, or a create/sell counter change is not confirmed. The Status page displays **Complete** once `dailyMapsCreated` reaches `dailyMapsLimit`; an active Adventure still takes precedence.

## Action recaps

Challenge runs end with a toast showing confirmed scrolls used, paid entries bought, completions, cancellations, gold spent and auto-completes remaining. The stop reason explains price limits, disabled purchasing, blocked challenges and errors. Partial totals are retained if a later step fails; unknown allowance is shown as Unknown. The complete recap is also saved in the challenge cache's last run for Debug.

Taming and Attunement Claim actions also show collection recaps. Successful toasts dismiss after 18 seconds, pausing while hovered, focused or the tab is hidden. Stopped runs remain until dismissed. Toasts stay visible across native page navigation and respect reduced motion.

The Daily Scroll Limit row is optional: Ironwood omits it when its counter is inactive. The loop reads the loaded Start controls and current scroll/auto-complete counts instead of waiting for this row or reusing a previous day's cap.

After a challenge run or Attunement claim changes the game, Status synchronizes the main game's inventory, gold and running timers before showing the recap. This happens once per batch, including partially stopped runs, so you can continue without reloading Inventory. If synchronization fails, completed totals stay intact and the recap asks you to reload the game.

Recaps use compact game-style rows with native scroll, coin, challenge and quest icons. Synchronization warnings stay visible until dismissed.

Attunement claims also synchronize the main game before their recap, so opening Attunement shows the updated slots and balances without manually refreshing. A partial collection still synchronizes, and a synchronization warning does not erase confirmed rewards.

Attunement recaps group confirmed XP, item rewards and skill-specific shards by region and skill (for example, Forest · Farming). Each item uses its game icon and exact count. XP appears beside each skill header with a dedicated XP icon; overall XP and slot totals are omitted. Empty rewards say None; unavailable receipt details say Unknown rather than zero. Partial runs retain rewards already confirmed.

Each skill has a compact header with its native icon, name, region and XP amount. Item rewards and shards sit directly underneath. Successful recaps omit the redundant confirmation footer; errors and synchronization warnings remain visible.

### Collection recaps

Current Loot, House and Taming claims show a compact reward recap. Native Collect buttons on House, Taming and Attunement, plus skill Stop & Loot, also show recaps. Matching item rewards are combined into one count. House batches retain collected rewards if a later structure fails; a failed action restart does not erase a successful loot claim.

During collection, native item, coin and XP toasts are replaced by the recap. Error and level-up notifications remain visible. Exact native reward details are preferred; if those are unavailable, confirmed visible loot is used where possible, otherwise the recap says reward details are unavailable. A disabled Collect button alone does not confirm a Taming claim.
