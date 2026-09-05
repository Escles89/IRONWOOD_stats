  function renderPotionPanel(displayedPotions, showSuperPotions) {
    return `        <section class="iw-card iw-potion-card">
          <div class="iw-card-header"><span>${showSuperPotions ? 'Potions' : 'Divine Potions'}</span><small>${displayedPotions.length} types</small></div>
          ${displayedPotions.length ? `<div class="iw-data-table iw-potion-table">
            <div class="iw-table-head"><span>Potion</span><span>Equipped</span><span>Stored</span></div>
            ${displayedPotions.map((item) => `<div class="iw-table-row">
              <div class="iw-table-item"><span class="iw-item-image"><img src="${escapeHtml(item.image)}" alt=""></span><span>${escapeHtml(item.name)}</span></div>
              <div class="iw-table-number ${item.equipped ? '' : 'iw-zero'}">${item.superPotion && item.equipped === null ? '—' : formatNumber(item.equipped || 0)}</div>
              <div class="iw-table-number ${item.stored ? '' : 'iw-zero'}">${formatNumber(item.stored || 0)}</div>
            </div>`).join('')}
          </div>` : '<div class="iw-muted">No Divine Potions found.</div>'}
        </section>`;
  }
