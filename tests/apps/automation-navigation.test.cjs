const { test } = require('node:test');
const assert = require('node:assert/strict');
const harness = require('../harness.cjs');

test('cached automation links navigate directly from Status without replacing its history entry', async () => {
  const location = { pathname: '/status', href: '/status' };
  const h = harness({ location });
  h.run("setCache('automations', {structures:[{structure:'Smelter',route:'/house/automate/2/100'}]})");
  h.context.withPage = () => { throw new Error('Unnecessary lookup'); };
  await h.context.openAutomationFromStatus('Smelter');
  assert.equal(location.href, '/house/automate/2/100');
  assert.equal(h.run('AppState.ui.openingAutomation'), '');
});

test('uncached automation resolves the selected structure in a frame before one direct navigation', async () => {
  const location = { pathname: '/status', href: '/status' };
  const h = harness({ location });
  let selected = false;
  const row = { click() { selected = true; }, querySelector: () => ({ textContent: 'Kiln' }) };
  const card = { querySelector: selector => selector.includes('.header') ? {textContent:'Structures'} : selected ? row : null, querySelectorAll: () => [row] };
  h.context.openAutomationHouse = async () => {};
  h.context.withPage = async (_path, _selector, task) => task({querySelectorAll: () => [card]}, {location:{pathname:'/house/automate/4/200'}});
  await h.context.openAutomationFromStatus('Kiln');
  assert.equal(selected, true);
  assert.equal(location.href, '/house/automate/4/200');
});

test('automation destinations only accept native automation routes', () => {
  const h = harness();
  for (const path of ['https://example.com', '//example.com', '/house', '/house/automate/2/3?next=bad']) assert.equal(h.context.automationRoute(path), '');
  assert.equal(h.context.automationRoute('/house/automate/2/3'), '/house/automate/2/3');
});
