# Combat

Combat shows the player and enemy, HP bars, and available action meters. Hits leave a brief HP trail. Healing, defeat, respawn, and consumed items use short effects. Repeated live updates keep an existing effect on its original timeline.

A defeated enemy can respawn with the same name and sprite. The dashboard recognizes its return to positive HP. While the player revives, Status displays a skull and the remaining revive time.

Elite encounters use the equipped key or native elite information. The key badge appears before the combat badge. Dungeon encounters receive a dungeon location badge.

Live combat readings depend on Ironwood's rendered interface. During a short native-page transition the last combat snapshot may remain briefly visible.
