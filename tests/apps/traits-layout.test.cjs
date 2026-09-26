const {test} = require('node:test');
const assert = require('node:assert/strict');
const harness = require('../harness.cjs');

function traitsFixture(names) {
  let mutations = 0;
  const parent = {
    children: [],
    querySelectorAll: () => parent.children.filter(node => node.dataset?.region),
    appendChild(node) {
      const index = parent.children.indexOf(node);
      if (index >= 0) parent.children.splice(index, 1);
      parent.children.push(node); node.parentElement = parent; mutations++;
    },
    insertBefore(node, before) {
      parent.children.splice(parent.children.indexOf(before), 0, node);
      node.parentElement = parent; mutations++;
    }
  };
  function node(name) {
    return {
      name, dataset: {}, parentElement: parent,
      querySelector: selector => selector === ':scope > .title' && name ? {textContent:name} : null,
      get nextElementSibling() { return parent.children[parent.children.indexOf(this) + 1] || null; },
      remove() { parent.children.splice(parent.children.indexOf(this), 1); mutations++; }
    };
  }
  names.forEach(name => parent.children.push(node(name)));
  const card = {
    querySelector: () => ({textContent:'Traits'}),
    querySelectorAll: selector => selector === '.row .title'
      ? parent.children.filter(n => n.name).map(n => ({textContent:n.name}))
      : parent.children.filter(n => n.name)
  };
  const h = harness({location:{pathname:'/traits'}, document:{
    querySelectorAll: selector => selector === '.card' ? [card] : [],
    querySelector: () => null, createElement: () => node(null)
  }});
  return {h, parent, add:name=>parent.appendChild(node(name)), settle() {
    // The body MutationObserver invokes this installer again after its own DOM writes.
    for (let turn=0; turn<20; turn++) {
      const before=mutations;
      h.context.installInterfaceControls();
      if (mutations===before) return;
    }
    assert.fail('Traits DOM mutations never settle: observer keeps rescheduling itself');
  }};
}

test('opening partially mounted Traits does not create an endless mutation loop', () => {
  const f=traitsFixture(['Mining', 'Woodcutting']);
  f.settle();
  assert.deepEqual(f.parent.children.filter(n=>n.name).map(n=>n.name), ['Woodcutting','Mining']);
});

test('incremental Traits rows get one header per present group and remain stable', () => {
  const f=traitsFixture(['Woodcutting', 'Defense']);
  f.settle();
  assert.deepEqual(f.parent.children.filter(n=>n.dataset.region).map(n=>n.dataset.region), ['Forest','All Regions']);
  f.add('Smelting'); f.add('Cooking');
  f.settle();
  assert.deepEqual(f.parent.children.filter(n=>n.dataset.region).map(n=>n.dataset.region), ['Forest','Mountain','Ocean','All Regions']);
  f.add('Mining'); f.add('Fishing');
  f.settle();
  assert.deepEqual(f.parent.children.filter(n=>n.dataset.region).map(n=>n.nextElementSibling.name), ['Woodcutting','Mining','Fishing','Defense']);
});

test('fully mounted Traits sorts once, keeps native row identities, and settles', () => {
  const h=harness();
  const names=Array.from(h.run('TRAIT_REGION_ORDER')).reverse();
  const f=traitsFixture(names);
  const originals=f.parent.children.slice();
  f.settle();
  assert.deepEqual(f.parent.children.filter(n=>n.name).map(n=>n.name),names.slice().reverse());
  assert.ok(originals.every(row=>f.parent.children.includes(row)));
  f.settle();
});
