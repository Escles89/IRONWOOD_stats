  async function collectLootAndContinue() {
    if (!automationEnabled()) return;
    if (AppState.ui.collectingLoot) return;
    const stopButton = [...document.querySelectorAll('skill-page button.action-stop')]
      .find((button) => /Stop\s*&\s*Loot/i.test(clean(button.textContent)) && !button.disabled);
    if (!stopButton) return;
    AppState.ui.collectingLoot = true;
    const control = AppState.ui.page?.querySelector('[data-collect-loot]');
    if (control) { control.disabled = true; control.textContent = 'Claiming…'; }
    try {
      stopButton.click();
      const start = Date.now();
      let startButton = null;
      while (Date.now() - start < 8000) {
        startButton = document.querySelector('skill-page button.action-start, skill-page button[class*="action-start"]');
        if (!startButton) startButton = [...document.querySelectorAll('skill-page button')].find((button) =>
          !button.disabled && !button.classList.contains('row') && /^(Gather|Mine|Craft|Smelt|Smith|Enchant|Farm|Brew|Fish|Cook|Delve|Imbue|Explore|Tame|Fight|Start)$/i.test(clean(button.textContent))
        );
        if (startButton && !startButton.disabled) break;
        await wait(100);
      }
      if (!startButton || startButton.disabled) throw new Error('Ironwood did not expose the continue-action button');
      startButton.click();
      const restart = Date.now();
      while (Date.now() - restart < 8000 && !document.querySelector('skill-page action-component > .card .bars .fill')) await wait(100);
      if (!document.querySelector('skill-page action-component > .card .bars .fill')) throw new Error('The action did not resume');
      AppState.ui.lastSignature = '';
      render();
    } catch (error) {
      console.error('[Ironwood Status] Collect and continue failed', error);
      if (control) { control.textContent = 'Claim'; control.title = error.message; }
    } finally {
      AppState.ui.collectingLoot = false;
      const current = AppState.ui.page?.querySelector('[data-collect-loot]');
      if (current) { current.disabled = false; if (current.textContent === 'Claiming…') current.textContent = 'Claim'; }
    }
  }

  const NativeControlAdapter = {
    run(document, command) {
      const actions = {
        loot: collectLootAndContinue,
        automations: collectAllAutomationLoot,
        attunement: collectAllAttunementLoot,
        taming: collectTamingLoot,
        challenge: automateChallenge,
        craft: () => craftAll(document, command.button)
      };
      if (!actions[command.type]) throw new Error(`Unknown native command: ${command.type}`);
      if (command.type !== 'craft' && !automationEnabled()) return;
      return actions[command.type]();
    }
  };

  function craftAll(document, button) {
        const modal = button.closest('modal-component .modal');
        const craftableRow = [...(modal?.querySelectorAll(':scope > .row') || [])]
          .find((row) => clean(row.querySelector(':scope > span')?.textContent) === 'Craftable');
        const input = modal?.querySelector('form.actions input[name="quantity"], form.actions input[placeholder="Quantity"]');
        const nativeCraft = [...(modal?.querySelectorAll('form.actions > .buttons > button') || [])]
          .find((button) => clean(button.textContent) === 'Craft' && !button.matches('[data-craft-all]'));
        const amount = numberFrom(clean(craftableRow?.textContent).replace('Craftable', ''));
        if (!input || !nativeCraft || amount <= 0) return;
        const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
        if (valueSetter) valueSetter.call(input, String(amount));
        else input.value = String(amount);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        requestAnimationFrame(() => nativeCraft.disabled || nativeCraft.click());
  }
