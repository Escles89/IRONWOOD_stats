  function renderAutomationsPanel(automationRows, cache, automationOn) {
    return `        <section class="iw-card iw-automations-card">
          <div class="iw-card-header"><span>Automations</span><div class="iw-summary"><small>${AppState.ui.refreshingAutomations ? 'Updating…' : humanAge(cache.automations?.checkedAt)}</small>${AppState.ui.collectingAutomation || automationRows.some((item) => item.lootAmount > 0) ? `<button class="iw-collect-button iw-claim-button" data-collect-automations data-claim-state="${AppState.ui.collectingAutomation ? 'busy' : 'ready'}" ${automationOn && !AppState.ui.collectingAutomation && !AppState.ui.refreshingAutomations ? '' : 'disabled'} title="${automationOn ? 'Claim all automation loot' : 'Automation is disabled'}">${AppState.ui.collectingAutomation ? 'Claiming…' : 'Claim'}</button>` : ''}</div></div>
          ${cache.automations?.lastError ? `<div class="iw-muted" role="alert">${escapeHtml(cache.automations.lastError)}</div>` : ''}
          ${automationRows.length ? `<div class="iw-data-table iw-automation-table">
            ${automationRows.map((item, index) => `<div class="iw-table-row iw-automation-link" role="link" tabindex="0" data-open-automation="${escapeHtml(item.structure)}" aria-label="Open ${escapeHtml(item.structure)} automation">
              <div class="iw-automation-heading"><div class="iw-automation-label iw-automation-structure" title="${escapeHtml(item.structure)}"><img src="${escapeHtml(item.image)}" alt=""><span>${escapeHtml(item.structure)}</span></div>
              <div class="iw-automation-label iw-automation-recipe" title="${escapeHtml(item.making || 'Idle')}">${item.makingImage ? `<img src="${escapeHtml(item.makingImage)}" alt="">` : '<span class="iw-zero iw-automation-placeholder">—</span>'}<span>${escapeHtml(item.making || 'Idle')}</span></div></div>
              <div class="iw-automation-queue-bar" data-warning="${automationQueueWarning(item, cache.automations?.checkedAt)}" title="${escapeHtml(automationQueueDescription(item, cache.automations?.checkedAt))}" aria-valuetext="${escapeHtml(automationQueueDescription(item, cache.automations?.checkedAt))}" role="progressbar" aria-label="${escapeHtml(item.structure)} queue completion" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${automationQueuePercent(item)}" data-live-automation-progress="${index}">
                <div class="iw-automation-queue-fill" style="width:${automationQueuePercent(item)}%"></div>
                <span class="iw-automation-queue-count" title="Completed / total actions"><span data-live-automation-done="${index}">${formatNumber(item.queuedDone || 0)}</span><span class="iw-queue-slash"> / </span><span data-live-automation-queue="${index}">${formatNumber(item.queuedTotal || 0)}</span></span>
                <span class="iw-automation-queue-time" title="Approximate time remaining" data-live-automation-time="${index}">${automationRemainingTime(item, cache.automations?.checkedAt)}</span>
              </div>
            </div>`).join('')}
          </div>` : `<div class="iw-muted">${AppState.ui.refreshingAutomations ? 'Reading structures…' : 'Automation data has not been loaded yet.'}</div>`}
        </section>`;
  }
