# Troubleshooting

**Status is missing:** reload Ironwood and confirm Tampermonkey and the full userscript are enabled. Keep only one installed full copy.

**No action in progress:** start an activity on its native skill page. An idle dashboard still displays loot, Status rows, planning and House production. Supplies are on **Equipment → Consumables**.

**Unknown or old panel values:** open the corresponding native page, use the Status refresh icon for a one-time read, or enable Allow fallback lookups for missing/incompatible data. Old snapshots are retained without scheduled polling; an expired age alone does not force a lookup. Production projections need an initial House snapshot.

**Claim is disabled:** enable automation in Settings. Structure Claim also stays disabled while a collection or refresh is running. If a claim reports a confirmation error, inspect the native page before retrying; already confirmed rows stay updated.

**Status could not render:** reload first. If it persists, use the offered Repair cached data control, then revisit the relevant pages or enable Allow fallback lookups. The idle `isCombat` error is fixed; cache repair is not needed for that bug.

**Local changes do not appear:** rebuild the generated userscript and reload. See the [local loader instructions](../technical/release-process.md).

**Daily quests or maps are not running:** enable both automation and fallback lookups. Select exactly five quest skills. Completed work waits until reset; failed attempts wait at least 15 minutes. Map creation can stop for low RP or full storage. It creates maps, not active adventures.

**The game page looks stale after a claim:** check the recap for a synchronization warning. Confirmed rewards remain recorded. Open the native page; reload if synchronization failed. Taming collection should return to your current skill before showing Status again.

**Potions or potion-type settings are missing:** the separate Status potion panel and type filter were removed. Open **Equipment → Consumables** for equipped supplies and category reserve panels; select a Current Action consumable row for its category overview.

**A consumable timer says Estimating… or Not in use:** food and keys need several observed uses; paused supplies do not run down. Refills, action/equipment changes and observation gaps reset estimates. Unknown data is not a zero supply.

**A skill rank is missing or cached:** Rank — means unavailable; Unranked means the loaded board has no entry. Leave Skills open and visible for an eligible refresh. Successful ranks last an hour; failed reads retry after five minutes and keep the last known rank.

**A recipe plan is waiting:** check its reason in **Skills → Recipe Calc & planner**. Automatic runs need automation enabled and a visible tab. Conversions, purchases and combat drops need manual work; unrelated actions must be finished and collected. Stop & Loot in Skills pauses the runner and leaves you idle. Spending items after Target satisfied does not restart a completed run.

**A divider or badge is unclear:** open the book beside money and use the guide’s Indicators or Status rows chapters. Resource icons stay with their numbers, while dividers separate groups. Green checks have different meanings for different features.
