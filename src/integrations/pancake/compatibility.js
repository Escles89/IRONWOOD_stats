  async function primeNativeEstimates() {
    if (nativeXpHourRow()) return;
    const estimatesTab = [...document.querySelectorAll('skill-page button.tab')]
      .find((button) => clean(button.textContent) === 'Estimates' && !button.disabled);
    estimatesTab?.click();
    const started = Date.now();
    while (estimatesTab && Date.now() - started < 1000 && !nativeXpHourRow()) await wait(25);
  }

  function installInterfaceControls() {
    const multiplayerName = [...document.querySelectorAll('nav-component .row-button > .name')]
      .find((name) => clean(name.textContent) === 'Multiplayer');
    const multiplayer = multiplayerName?.closest('.row-button');
    if (multiplayer) {
      multiplayer.id = MULTIPLAYER_ID;
      multiplayer.classList.toggle('iw-multiplayer-visible', multiplayerControlEnabled());
    }

    document.querySelectorAll('modal-component .modal').forEach((modal) => {
      const craftableRow = [...modal.querySelectorAll(':scope > .row')]
        .find((row) => clean(row.querySelector(':scope > span')?.textContent) === 'Craftable');
      const input = modal.querySelector('form.actions input[name="quantity"], form.actions input[placeholder="Quantity"]');
      const buttons = modal.querySelector('form.actions > .buttons');
      const nativeCraft = [...(buttons?.querySelectorAll(':scope > button') || [])]
        .find((button) => clean(button.textContent) === 'Craft');
      if (!craftableRow || !input || !buttons || !nativeCraft || buttons.querySelector('[data-craft-all]')) return;
      const craftable = numberFrom(clean(craftableRow.textContent).replace('Craftable', ''));
      const craftAll = nativeCraft.cloneNode(false);
      craftAll.type = 'button';
      craftAll.className = 'craft iw-craft-all';
      craftAll.removeAttribute('disabled');
      craftAll.removeAttribute('style');
      craftAll.dataset.craftAll = '';
      craftAll.textContent = 'Craft All';
      craftAll.disabled = craftable <= 0;
      craftAll.title = `Craft all ${formatNumber(craftable)}`;
      buttons.classList.add('iw-craft-buttons');
      nativeCraft.after(craftAll);
    });

    orderTraitsByRegion();
  }

  function orderTraitsByRegion() {
    if (!location.pathname.startsWith('/traits')) return;
    const card = [...document.querySelectorAll('.card')]
      .find((candidate) => clean(candidate.querySelector(':scope > .header')?.textContent) === 'Traits'
        && [...candidate.querySelectorAll('.row .title')].some((title) => /^Woodcutting\b/.test(clean(title.textContent))));
    const rows = [...(card?.querySelectorAll('.row') || [])]
      .filter((row) => row.querySelector(':scope > .title'));
    if (rows.length < 2 || !rows.every((row) => row.parentElement === rows[0].parentElement)) return;
    const rank = new Map(TRAIT_REGION_ORDER.map((skill, index) => [skill, index]));
    const skillFor = (row) => {
      const name = clean(row.querySelector(':scope > .title')?.textContent);
      return TRAIT_REGION_ORDER.find((skill) => name === skill || name.startsWith(`${skill} `)) || '';
    };
    const ordered = rows.map((row, index) => ({ row, index, order: rank.get(skillFor(row)) ?? TRAIT_REGION_ORDER.length }))
      .sort((a, b) => a.order - b.order || a.index - b.index)
      .map((entry) => entry.row);
    const parent = rows[0].parentElement;
    const headers = [...parent.querySelectorAll(':scope > .iw-trait-region-header')];
    const desiredHeaders = [
      ...TRAIT_REGIONS.map((region) => ({ name: region.name, firstSkill: region.skills[0] })),
      { name: 'All Regions', firstSkill: 'Defense' }
    ];
    const orderCorrect = ordered.every((row, index) => row === rows[index]);
    const headersCorrect = headers.length === desiredHeaders.length && desiredHeaders.every((wanted) => {
      const header = headers.find((candidate) => candidate.dataset.region === wanted.name);
      return header && !header.querySelector('.iw-set-tier') && skillFor(header.nextElementSibling) === wanted.firstSkill;
    });
    if (orderCorrect && headersCorrect) return;
    headers.forEach((header) => header.remove());
    ordered.forEach((row) => parent.appendChild(row));
    desiredHeaders.forEach(({ name, firstSkill }) => {
      const firstRow = ordered.find((row) => skillFor(row) === firstSkill);
      if (!firstRow) return;
      const header = document.createElement('div');
      header.className = 'iw-trait-region-header';
      header.dataset.region = name;
      header.innerHTML = `<strong>${name}</strong>`;
      parent.insertBefore(header, firstRow);
    });
  }
