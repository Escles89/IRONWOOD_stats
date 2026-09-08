  function renderAutomationsPanel(automationRows, cache, automationOn) {
    return `        <section class="iw-card iw-automations-card">
          <div class="iw-card-header"><span>Automations</span><div class="iw-summary"><small>${AppState.ui.refreshingAutomations ? 'Updating…' : humanAge(cache.automations?.checkedAt)}</small>${AppState.ui.collectingAutomation || automationRows.some((item) => item.lootAmount > 0) ? `<button class="iw-collect-button iw-claim-button" data-collect-automations data-claim-state="${AppState.ui.collectingAutomation ? 'busy' : 'ready'}" ${automationOn && !AppState.ui.collectingAutomation && !AppState.ui.refreshingAutomations ? '' : 'disabled'} title="${automationOn ? 'Claim all automation loot' : 'Automation is disabled'}">${AppState.ui.collectingAutomation ? 'Claiming…' : 'Claim'}</button>` : ''}</div></div>
          ${cache.automations?.lastError ? `<div class="iw-muted" role="alert">${escapeHtml(cache.automations.lastError)}</div>` : ''}
          ${automationRows.length ? `<div class="iw-data-table iw-automation-table">
            <div class="iw-table-head"><span>Structure</span><span>Making</span><span>Loot</span><span>Queued</span></div>
            ${automationRows.map((item, index) => `<div class="iw-table-row">
              <div class="iw-automation-label" title="${escapeHtml(item.structure)}"><img src="${escapeHtml(item.image)}" alt=""><span>${escapeHtml(item.structure)}</span></div>
              <div class="iw-automation-label" title="${escapeHtml(item.making || 'Idle')}">${item.makingImage ? `<img src="${escapeHtml(item.makingImage)}" alt="">` : '<span class="iw-zero iw-automation-placeholder">—</span>'}<span>${escapeHtml(item.making || 'Idle')}</span></div>
              <div class="iw-automation-value ${item.lootAmount ? '' : 'iw-zero'}" title="${escapeHtml(item.lootName || 'Loot')}" data-live-automation-loot="${index}">${item.lootAmount ? formatNumber(item.lootAmount) : '0'}</div>
              <div class="iw-table-number ${item.queuedTotal > item.queuedDone ? '' : 'iw-zero'}" data-live-automation-queue="${index}">${item.queuedTotal ? formatNumber(Math.max(0, item.queuedTotal - item.queuedDone)) : '0'}</div>
            </div>`).join('')}
          </div>` : `<div class="iw-muted">${AppState.ui.refreshingAutomations ? 'Reading structures…' : 'Automation data has not been loaded yet.'}</div>`}
        </section>`;
  }
