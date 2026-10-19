const { test } = require('node:test');
const assert = require('node:assert/strict');
const setup = require('../fixtures/quick-skills.cjs');

async function edit(f) {
  f.learn('4', '103'); f.current('2', '101');
  f.click('data-quick-skills'); f.click('data-quick-edit', '4');
  await f.until(() => f.panel().includes('data-quick-amount-form'));
}

test('new recipes default to max while saved fixed preferences and planned quantities remain explicit', async () => {
  const f = setup();
  await edit(f);
  assert.match(f.panel(), /name="max" checked/);
  assert.equal(f.h.run('AppState.ui.quickSkills.prompt.value'), 20);
  f.click('data-quick-close'); await f.until(() => !f.busy());
  f.h.run('AppState.ui.quickSkills.data.amounts["4:103"] = { amount: 7, reuse: false }');
  f.click('data-quick-skills');
  f.click('data-quick-edit', '4'); await f.until(() => f.panel().includes('data-quick-amount-form'));
  assert.doesNotMatch(f.panel(), /name="max" checked/);
  assert.equal(f.h.run('AppState.ui.quickSkills.prompt.value'), 7);
  f.click('data-quick-close'); await f.until(() => !f.busy());
  f.h.context.quickPromptAmount({ skillId: '4', actionId: '103' }, null, 20, { planned: true });
  assert.equal(f.h.run('AppState.ui.quickSkills.prompt.max'), false);
  assert.doesNotMatch(f.panel(), /name="max"/);
  f.click('data-quick-close');
});

test('editing a shortage always saves without a second replace checkbox', async () => {
  const f = setup();
  f.h.run('AppState.ui.quickSkills.data.amounts["4:103"] = { amount: 50, reuse: true }');
  await edit(f);
  assert.match(f.panel(), /configured amount exceeds/);
  assert.doesNotMatch(f.panel(), /name="save"|Replace my configured amount/);
  f.submit(12, { reuse: true });
  await f.until(() => !f.busy());
  assert.deepEqual(f.saved().amounts['4:103'], { amount: 12, reuse: true });
  assert.deepEqual(f.subscriptions, []);
});

test('Always use max persists across reload and recalculates changing supplies per start', async () => {
  const f = setup();
  await edit(f);
  assert.match(f.panel(), /Always use max/);
  f.submit('', { max: true });
  await f.until(() => !f.busy());
  assert.deepEqual(f.saved().amounts['4:103'], { max: true, reuse: true });
  assert.deepEqual(f.subscriptions, []);
  f.h.run('AppState.ui.quickSkills.owner = null'); f.render();
  assert.match(f.panel(), /Always use max/);
  const ready = f.h.context.quickNativeReady;
  let capacity = 7;
  f.h.context.quickNativeReady = async (...args) => {
    const native = await ready(...args);
    native.runtime.state.user.metalParts = capacity * 3;
    return native;
  };
  for (capacity of [7, 18]) {
    f.click('data-quick-resume', '4');
    await f.until(() => !f.busy());
    assert.equal(f.calls.filter(call => call[0] === 'start').at(-1)[3], capacity);
    f.current('2', '101'); f.click('data-quick-skills');
  }
});

test('max rechecks supply after preparing native controls, and zero supply never starts', async () => {
  for (const capacity of [0, 6]) {
    const f = setup();
    await edit(f); f.submit('', { max: true }); await f.until(() => !f.busy());
    const ready = f.h.context.quickNativeReady;
    f.h.context.quickNativeReady = async (...args) => {
      const native = await ready(...args), startControl = native.startControl.bind(native);
      native.startControl = async amount => {
        const control = await startControl(amount);
        native.runtime.state.user.metalParts = capacity * 3;
        return control;
      };
      return native;
    };
    f.click('data-quick-resume', '4'); await f.until(() => !f.busy());
    const starts = f.calls.filter(call => call[0] === 'start');
    if (capacity) assert.equal(starts[0][3], capacity);
    else { assert.equal(starts.length, 0); assert.deepEqual(f.subscriptions, []); }
  }
});

test('max can be saved without current supplies and changed back to a fixed amount', async () => {
  const f = setup();
  const ready = f.h.context.quickNativeReady;
  let capacity = 0;
  f.h.context.quickNativeReady = async (...args) => {
    const native = await ready(...args);
    native.runtime.state.user.metalParts = capacity * 3;
    return native;
  };
  await edit(f); f.submit('', { max: true }); await f.until(() => !f.busy());
  assert.deepEqual(f.saved().amounts['4:103'], { max: true, reuse: true });
  f.click('data-quick-resume', '4'); await f.until(() => !f.busy());
  assert.deepEqual(f.subscriptions, []);
  capacity = 10;
  f.click('data-quick-edit', '4'); await f.until(() => f.panel().includes('data-quick-amount-form'));
  assert.match(f.panel(), /name="max" checked/);
  f.submit(5, { reuse: true }); await f.until(() => !f.busy());
  assert.deepEqual(f.saved().amounts['4:103'], { amount: 5, reuse: true });
});

test('max toggle updates the field and disables conflicting choices without submitting', async () => {
  const f = setup(); await edit(f);
  const nodes = new Map();
  const form = {
    elements: { amount: { value: '20' }, reuse: { checked: false }, max: { checked: false } },
    querySelector(selector) { if (!nodes.has(selector)) nodes.set(selector, {}); return nodes.get(selector); },
    closest() { return this; }
  };
  f.h.context.quickUpdateQuantity(form);
  form.elements.amount.value = '12';
  form.elements.max.checked = true;
  f.h.context.quickUpdateQuantity(form);
  assert.equal(form.elements.amount.value, '20');
  assert.equal(form.elements.amount.disabled, true);
  assert.equal(form.elements.reuse.checked, true);
  assert.equal(form.querySelector('[data-quick-amount-choice="target"]').disabled, true);
  form.elements.max.checked = false;
  f.h.context.quickUpdateQuantity(form);
  assert.equal(form.elements.amount.value, '12');
  assert.equal(form.elements.amount.disabled, false);
  assert.deepEqual(f.subscriptions, []);
  f.click('data-quick-close'); await f.until(() => !f.busy());
});
