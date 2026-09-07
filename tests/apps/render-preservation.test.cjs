const { test } = require('node:test');
const assert = require('node:assert/strict');
const harness = require('../harness.cjs');

function element(name, attributes = {}, children = [], styles = {}) {
  const attrs = new Map(Object.entries(attributes));
  const css = new Map(Object.entries(styles));
  const node = { nodeType: 1, nodeName: name, childNodes: children,
    get attributes() { return [...attrs].map(([name, value]) => ({ name, value })); },
    hasAttribute: key => attrs.has(key), getAttribute: key => attrs.get(key) ?? null,
    setAttribute: (key, value) => attrs.set(key, value), removeAttribute: key => attrs.delete(key),
    style: { [Symbol.iterator]: () => css.keys(), getPropertyValue: key => css.get(key) || '',
      setProperty: (key, value) => css.set(key, value), removeProperty: key => css.delete(key) },
    matches: selector => selector.split(', ').some(part => attrs.has(part.slice(1, -1))),
    querySelector(selector) { return children.find(child => child.getAttribute?.('class') === selector.slice(1)) || null; },
    appendChild(child) { children.push(child); },
    replaceWith(replacement) { this.replacement = replacement; }, remove() { this.removed = true; }
  };
  return node;
}
const text = nodeValue => ({ nodeType: 3, nodeName: '#text', nodeValue, replaceWith(value) { this.replacement = value; } });

test('combat effects update in place without replacing fighter images or quantity animations', () => {
  const h = harness();
  const image = element('IMG', { src: '/treant.png' });
  const float = element('SPAN', { class: 'iw-quantity-delta' }, [text('-1')]);
  const quantity = element('B', { 'data-live-consumable-equipped': '0' }, [element('SPAN', { class: 'iw-quantity-value' }, [text('99')]), float]);
  const fighter = element('DIV', { class: 'iw-fighter' }, [image]);
  const current = element('SECTION', {}, [fighter, quantity]);
  const next = element('SECTION', {}, [element('DIV', { class: 'iw-fighter iw-heal' }, [element('IMG', { src: '/treant.png' }), element('SPAN', { class: 'iw-floating-heal' })]), element('B', { 'data-live-consumable-equipped': '0' }, [text('98')])]);
  h.context.patchStatusSection(current, next);
  assert.equal(current.replacement, undefined);
  assert.equal(fighter.replacement, undefined);
  assert.equal(image.replacement, undefined);
  assert.equal(fighter.getAttribute('class'), 'iw-fighter iw-heal');
  assert.equal(fighter.childNodes.length, 2);
  assert.equal(quantity.childNodes[1], float);
  assert.equal(float.removed, undefined);
});

test('retained effects keep their delay even when a different effect starts', () => {
  const h = harness();
  const current = element('DIV', { style: '', 'data-effect-times': '{"heal":100000,"hit":99500}' }, [], { '--iw-heal-delay': '-50ms', '--iw-hit-delay': '-500ms' });
  const next = element('DIV', { style: '', 'data-effect-times': '{"heal":100000,"hit":101000}' }, [], { '--iw-heal-delay': '-1000ms', '--iw-hit-delay': '0ms' });
  h.context.patchStatusSection(current, next);
  assert.equal(current.style.getPropertyValue('--iw-heal-delay'), '-50ms');
  assert.equal(current.style.getPropertyValue('--iw-hit-delay'), '0ms');
});

test('text, attributes, additions, removals and different node types are reconciled', () => {
  const h = harness();
  const label = text('old');
  const removed = element('SPAN');
  const current = element('DIV', { hidden: '', class: 'old' }, [label, removed]);
  h.context.patchStatusSection(current, element('DIV', { class: 'new' }, [text('new')]));
  assert.equal(label.nodeValue, 'new');
  assert.equal(removed.removed, true);
  assert.equal(current.hasAttribute('hidden'), false);
  assert.equal(current.getAttribute('class'), 'new');
  const replacement = element('IMG');
  h.context.patchStatusSection(label, replacement);
  assert.equal(label.replacement, replacement);
});
