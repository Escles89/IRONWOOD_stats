  function collectInventory(doc) {
    const allItems = [...doc.querySelectorAll('inventory-page button.item')].map((button) => {
      const src = button.querySelector('img')?.getAttribute('src') || '';
      const key = src.split('/').pop()?.split('?')[0] || '';
      const amountText = clean(button.querySelector('.amount')?.textContent);
      const name = clean(button.querySelector('.name')?.textContent);
      return key ? { key, name, amount: parseCompact(amountText), amountText, image: src } : null;
    }).filter(Boolean);
    const items = [...doc.querySelectorAll('inventory-page button.item')].map((button) => {
      const src = button.querySelector('img')?.getAttribute('src') || '';
      const slug = src.match(/potion-divine-[\w-]+/)?.[0];
      return slug ? { slug, name: `Divine ${titleFromSlug(slug)} Potion`, amount: parseCompact(button.querySelector('.amount')?.textContent), image: src } : null;
    }).filter(Boolean);
    setCache('inventory', { items, allItems });
  }
  function divineConsumables(doc) {
    const card = [...doc.querySelectorAll('.card')].find((item) =>
      clean(item.querySelector(':scope > .header > .name')?.textContent) === 'Consumables'
    );
    return [...(card?.querySelectorAll(':scope > .row, :scope > .items > button.item') || [])].map((row) => {
      const image = row.querySelector(':scope > .image img, img')?.getAttribute('src') || '';
      const slug = image.match(/potion-divine-[\w-]+/)?.[0];
      if (!slug) return null;
      return {
        slug,
        name: clean(row.querySelector('.description > .name, :scope > .name')?.textContent) || `Divine ${titleFromSlug(slug)} Potion`,
        amount: parseCompact(row.querySelector('.description > .amount, :scope > .amount')?.textContent),
        image
      };
    }).filter(Boolean);
  }
  function storeEquippedDivine(items, replace = false) {
    let equipped = [];
    try { equipped = JSON.parse(localStorage.getItem(EQUIPPED_KEY) || '[]'); } catch { equipped = []; }
    if (!Array.isArray(equipped)) equipped = [];
    equipped = equipped.filter((item) => item && typeof item.image === 'string' && item.image);
    items = (Array.isArray(items) ? items : []).filter((item) => item && typeof item.image === 'string' && item.image);
    const map = new Map((replace ? [] : equipped).map((item) => [item.slug || item.image.split('/').pop(), item]));
    items.forEach((item) => map.set(item.slug || item.image.split('/').pop(), item));
    equipped = [...map.values()];
    const serialized = JSON.stringify(equipped);
    if (localStorage.getItem(EQUIPPED_KEY) !== serialized) localStorage.setItem(EQUIPPED_KEY, serialized);
    const cached = getCache().equipped?.items;
    if (JSON.stringify(cached) !== serialized) setCache('equipped', { items: equipped });
    return equipped;
  }
  function collectMastery(doc) {
    const root = doc.querySelector('mastery-page');
    const skillsCard = [...(root?.querySelectorAll('.card') || [])]
      .find((card) => [...card.querySelectorAll(':scope > .row .name')]
        .some((name) => clean(name.textContent) === 'Woodcutting'));
    const completeSkills = [...(skillsCard?.querySelectorAll(':scope > .row') || [])]
      .filter((row) => clean(row.textContent).endsWith('Complete'))
      .map((row) => clean(row.querySelector(':scope > .name')?.textContent))
      .filter(Boolean);
    const data = { schema: 1, completeSkills };
    setCache('mastery', data);
    return data;
  }
