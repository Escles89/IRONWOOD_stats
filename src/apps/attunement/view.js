  function renderAttunementAvailability(availability = attunementProgression().availability) {
    const label = availability === 'ready' ? 'Passive improvement available'
      : availability === 'collect' ? 'Passive improvement available after collection' : '';
    return label ? `<span class="iw-task-icon ${availability === 'ready' ? 'done' : 'participating'} iw-attunement-available" role="img" title="${label}" aria-label="${label}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20V4m-6 6 6-6 6 6M5 20h14"></path></svg></span>` : '';
  }

  function renderAttunementProgression(model) {
    const header = '<div class="header"><div class="name">Passive progression</div></div>';
    if (!model.regions.length) return `${header}<div class="iw-attunement-empty">Waiting for current Attunement data.</div>`;
    return header + model.regions.map(region => {
      const target = region.target;
      if (!target) return `<div class="iw-attunement-empty"><strong>${escapeHtml(region.name)}</strong><span>${region.state === 'complete' ? 'All passives at maximum level.' : 'Pending shard balance unavailable.'}</span></div>`;
      const title = target.state === 'ready' ? `Upgrade ${target.name} ${target.passive} now`
        : target.state === 'collect' ? `Collect, then upgrade ${target.name} ${target.passive}`
        : `${region.selectedId === target.id ? 'Keep attuning' : 'Attune'} ${target.name}`;
      const status = target.state === 'ready' ? 'Upgrade now' : target.state === 'collect' ? 'Collect first'
        : region.selectedId === target.id ? 'Keep attuning' : 'Attune next';
      const tone = target.state === 'gather' ? region.selectedId === target.id ? 'current' : 'next' : target.state;
      const balance = `${target.owned} owned${target.pending === null ? ' · pending unknown' : target.pending ? ` + ${target.pending} pending` : ''} / ${target.cost} shards`;
      const shortfall = target.missing ? `${target.missing} more shard${target.missing === 1 ? '' : 's'}`
        : target.state === 'collect' ? 'Ready after collection' : 'Ready to upgrade';
      const ownedCoverage = Math.min(target.cost, target.owned);
      const pendingCoverage = Math.min(target.cost - ownedCoverage, target.pending || 0);
      const hint = target.state === 'ready' ? 'Open Passives to buy this improvement.'
        : target.state === 'collect' ? 'Collect the pending shards, then open Passives to upgrade.'
        : !region.selectedId ? 'Choose this skill in the regional slot when available.' : title;
      const shared = model.regions.filter(other => other.target?.id === target.id).length > 1
        ? '<div class="iw-attunement-shared">Shared skill balance across regions; upgrade once, then reassess.</div>' : '';
      return `<div class="row iw-attunement-target" aria-label="${escapeHtml(title)}">
        <img class="iw-attunement-art" src="/assets/${escapeHtml(target.image)}" alt="">
        <div class="iw-attunement-main">
          <div class="iw-attunement-top"><div><span class="iw-attunement-region">${escapeHtml(region.name)}</span><strong>${escapeHtml(target.name)}</strong></div><span class="iw-attunement-state is-${tone}" title="${escapeHtml(hint)}">${status}</span></div>
          <div class="iw-attunement-meta"><span>${escapeHtml(target.passive)} <b>${target.level} → ${target.next}</b></span><span>${shortfall}</span></div>
          <div class="iw-attunement-track" role="img" aria-label="${escapeHtml(balance)}" title="${escapeHtml(balance)}"><span class="iw-attunement-owned" style="width:${ownedCoverage / target.cost * 100}%"></span><span class="iw-attunement-pending" style="width:${pendingCoverage / target.cost * 100}%"></span></div>
          <div class="iw-attunement-balance"><span>${target.owned} owned${target.pending === null ? ' · pending unknown' : target.pending ? ` <span class="iw-attunement-pending-label">+ ${target.pending} pending</span>` : ''}</span><span><b>${ownedCoverage + pendingCoverage}</b> / ${target.cost} shards</span></div>
          ${target.gains.length ? `<div class="iw-attunement-set"><span aria-hidden="true">↑</span> <span>Set bonus: ${escapeHtml(target.gains.join(' · '))}</span></div>` : ''}${shared}
        </div></div>`;
    }).join('') + '<div class="iw-attunement-footer" title="Prioritize lower passive levels, then fewer missing shards. Set bonuses and the current skill break ties.">Lowest levels first <span aria-hidden="true">·</span> Fewest missing shards</div>';
  }

  function syncAttunementProgression() {
    const root = document.querySelector('attunement-page');
    if (!root || location.pathname !== '/attunement') return;
    const cards = [...root.querySelectorAll('.card')].filter(card => card.id !== 'iw-attunement-progression');
    const heading = card => clean(card.querySelector(':scope > .header > .name')?.textContent);
    const anchor = cards.find(card => heading(card) === 'Slots') || cards.find(card => heading(card) === 'Menu');
    if (!anchor) return;
    let host = root.querySelector('#iw-attunement-progression');
    if (!host) {
      // Preserve Angular's current style scope so native card/row styles apply.
      host = anchor.cloneNode(false);
      host.id = 'iw-attunement-progression';
      host.className = 'card iw-attunement-progression';
      host.setAttribute('aria-label', 'Attunement passive progression');
    }
    if (anchor.nextElementSibling !== host) anchor.after(host);
    const markup = renderAttunementProgression(attunementProgression());
    if (host._iwMarkup === markup) return;
    host.innerHTML = markup;
    const scope = anchor.getAttributeNames().filter(name => name.startsWith('_ngcontent-'));
    for (const child of host.querySelectorAll('*')) for (const name of scope) child.setAttribute(name, '');
    host._iwMarkup = markup;
  }
