# Troubleshooting

**Status is missing:** reload Ironwood and confirm Tampermonkey and the full userscript are enabled. Keep only one installed full copy.

**No action in progress:** start an activity on its native skill page. An idle dashboard should still display loot, status, potions, and automations.

**Unknown or old panel values:** open the corresponding native page, or enable cache lookups. After the modular upgrade the data cache starts empty. Production projections need an initial House snapshot.

**Claim is disabled:** enable automation in Preferences. Structure Claim also stays disabled while a collection or refresh is running. If a claim reports a confirmation error, inspect the native page before retrying; already confirmed rows stay updated.

**Status could not render:** reload first. If it persists, use the offered Repair cached data control, then revisit the relevant pages or enable cache lookups. The idle `isCombat` error is fixed; cache repair is not needed for that bug.

**Local changes do not appear:** rebuild the generated userscript and reload. See the [local loader instructions](../technical/release-process.md).
