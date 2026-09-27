# Planned next action

The Status card saves one action you want to do next. Choose **Skill**, optionally filter the action list, choose **Action**, and select **Save plan**. Every current main gathering, crafting and combat action is available, including actions you have never run and actions whose requirements you cannot yet meet. Combat skills remain separate even when they share an enemy. Taming, House production, Attunement and Adventures have separate workflows.

For crafting, save the **Native quantity** used by Ironwood's amount control. It does not guarantee that many output items. If supplies cannot cover the saved quantity at Start, the quantity dialog asks for a new amount. Cancelling keeps the plan. A one-time shortage choice does not change Quick Skills' saved amounts or silently reduce the plan.

**Start** is manual and requires confirmed idle. Stop continuous work yourself first. In this version, finite batches must also be stopped and collected manually, including batches whose estimated timer has expired. Unknown, loading and inconsistent state keeps Start disabled. Use the card's **Refresh** for a fresh, read-only check of the current state and the target's native requirements. This does not start daily work. Requirements observations show their age; waiting does not trigger background page reads.

The native game checks equipment, access, materials and its other requirements. The card does not change equipment or settings. If state or requirements change while a quantity dialog is open, the attempt can be refused; the plan remains available for another deliberate attempt. Starts, claims and synchronization share the Quick Skills coordination lock. The native stop request is also blocked for this workflow.

A confirmed start from this card clears the plan and records the real start in Last action. Rejections, cancellations and unconfirmed outcomes keep the plan. Starting the target elsewhere does not clear it, and an already-running target cannot be restarted from this card. A later synchronization error does not undo confirmed success.

**Edit** changes the plan, and **Clear** removes it. The plan stays in this browser for the current character and game mode across reloads. Form controls support keyboard use and stack vertically on small screens. There are no automatic starts or completion notifications.
