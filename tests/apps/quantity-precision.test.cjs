const {test} = require('node:test');
const assert = require('node:assert/strict');
const harness = require('../harness.cjs');

const quantity = (textContent, attrs = {}) => ({textContent, getAttribute:key=>attrs[key] || null});
function inventoryDoc(amount) {
  const button = {querySelector:selector=>({img:{getAttribute:()=>'/assets/items/logbook-100.png'}, '.amount':amount, '.name':{textContent:'Elite Logbook'}})[selector]};
  return {querySelectorAll:()=>[button]};
}

test('full counts stay exact and abbreviations retain their magnitude and uncertainty', () => {
  const h = harness();
  for (const [text, amount, approximate] of [['11,708',11708,false], ['11K',11000,true], ['1.2M',1200000,true], ['0',0,false]]) {
    const parsed = h.context.readItemQuantity(quantity(text));
    assert.equal(parsed.amount, amount);
    assert.equal(parsed.approximate, approximate);
    assert.equal(h.context.formatItemQuantity(parsed).includes('≈'), false);
  }
  assert.equal(h.context.formatItemQuantity({amount:11708}), '11,708');
  assert.equal(h.context.formatItemQuantity({amount:11000,amountText:'11K'}), '11K');
});

test('exact quantity metadata beats rounded text, while unrelated metadata is ignored', () => {
  const h = harness();
  assert.equal(h.context.readItemQuantity(quantity('11K', {title:'11,708'})).amount, 11708);
  assert.equal(h.context.readItemQuantity(quantity('11K', {'aria-label':'11708'})).approximate, false);
  assert.equal(h.context.readItemQuantity(quantity('11K', {title:'Worth 187,328 coins'})).approximate, true);
});

test('loot reader parses rounded native labels without treating 11K as eleven items', () => {
  const row = {querySelector:selector=>({':scope > .amount':quantity('11K'), ':scope > .name':{textContent:'Elite Logbook'}, ':scope > .image img':{src:'/assets/items/logbook-100.png'}})[selector]};
  const h = harness();
  h.context.card = {querySelectorAll:()=>[row]};
  h.run('findCard=()=>card');
  const loot = h.context.readLoot();
  assert.equal(loot[0].amount, 11000);
  assert.equal(loot[0].approximate, true);
});

test('confirmed additions preserve exact balances and never turn rounded balances into exact ones', () => {
  for (const [text, expected, approximate] of [['11,708',11720,false], ['11K',11012,true]]) {
    const h = harness();
    h.context.collectInventory(inventoryDoc(quantity(text)));
    const claim = h.context.beginInventoryLootClaim([{name:'Elite Logbook',image:'/assets/items/logbook-100.png',amount:12}]);
    assert.equal(h.context.applyInventoryLootClaim(claim), true);
    assert.equal(h.context.applyInventoryLootClaim(claim), false);
    const item = h.run('getCache().inventory.allItems[0]');
    assert.equal(item.amount, expected);
    assert.equal(h.context.quantityIsApproximate(item), approximate);
    assert.equal(h.context.formatItemQuantity(item).includes('≈'), false);
  }
});

test('a later exact observation replaces approximation even when the numeric amount is unchanged', () => {
  const h = harness();
  h.context.collectInventory(inventoryDoc(quantity('11K')));
  h.context.setCachedInventoryQuantity('logbook-100.png',11000,'Elite Logbook','/assets/items/logbook-100.png');
  assert.equal(h.run('getCache().inventory.allItems[0].approximate'), false);
  assert.equal(h.context.formatItemQuantity(h.run('getCache().inventory.allItems[0]')), '11,000');
  h.context.collectInventory(inventoryDoc(quantity('11,708')));
  assert.equal(h.context.formatItemQuantity(h.run('getCache().inventory.allItems[0]')), '11,708');
});

test('rounded loot keeps the resulting inventory approximate even with an exact starting balance', () => {
  const h = harness();
  h.context.collectInventory(inventoryDoc(quantity('708')));
  const claim = h.context.beginInventoryLootClaim([{name:'Elite Logbook',image:'/assets/items/logbook-100.png',amount:11000,amountText:'11K'}]);
  h.context.applyInventoryLootClaim(claim);
  assert.equal(h.run('getCache().inventory.allItems[0].amount'), 11708);
  assert.equal(h.run('getCache().inventory.allItems[0].approximate'), true);
});

test('live quantity updates retain approximation and do not animate rounded jumps', () => {
  const h = harness();
  const value = {textContent:''};
  let removed = false;
  const element = {querySelector:selector=>selector === '.iw-quantity-value' ? value : {remove(){removed=true;}}};
  h.context.updateQuantityValue(element,11000,{delta:1000,until:200000},'logbook',100000,true);
  assert.match(value.innerHTML,/11<small class="iw-quantity-suffix">K<\/small>/);
  assert.equal(removed,true);
  h.context.updateQuantityValue(element,11708,null,'logbook');
  assert.match(value.innerHTML,/title="11,708"/);
});

test('dashboard renders exact loot and approximate legacy inventory without hidden lookups', () => {
  const h = harness();
  h.run(`
    withPage=()=>{throw Error('Unexpected lookup')};
    readLoot=()=>[{name:'Elite Logbook',image:'/assets/items/logbook-100.png',amount:11708}];
    CacheStore.set('inventory',{schema:1,allItems:[{key:'logbook-100.png',amount:11000,amountText:'11K'}],items:[]});
    AppState.ui.page={hidden:false,innerHTML:'',style:{setProperty(){}},querySelector(){return null;}};
    StatusRenderer.render(AppState);
  `);
  const html = h.run('AppState.ui.page.innerHTML');
  assert.match(html, /data-live-loot="0"><span class="iw-quantity-display" title="11,708"/);
  assert.match(html, /11<small class="iw-quantity-suffix">K<\/small>/);
  assert.doesNotMatch(html, /≈/);
  assert.doesNotMatch(html, /Status could not render/);
});

test('native pipe hook preserves exact numeric input on Status, Inventory and source skill pages', () => {
  const h = harness();
  class Pipe { transform(value) { return `${this.prefix}${value === null ? 'empty' : '11.7K'}`; } }
  Pipe.ɵpipe = {name:'layoutNumber'};
  assert.equal(h.context.patchNativeQuantityPipe(Pipe,'layoutNumber'), true);
  const pipe = new Pipe(); pipe.prefix = 'native:';
  assert.equal(pipe.transform(11708), '11,708');
  assert.equal(pipe.transform(null), 'native:empty');
  h.run("location.pathname='/inventory'");
  assert.equal(pipe.transform(2568), '2,568');
  h.run("location.pathname='/skill/17/action/865'");
  assert.equal(pipe.transform(11708), '11,708');
  h.run("location.pathname='/guild'");
  assert.equal(pipe.transform(11708), 'native:11.7K');
  const patched = Pipe.prototype.transform;
  h.context.patchNativeQuantityPipe(Pipe,'layoutNumber');
  assert.equal(Pipe.prototype.transform, patched);
  assert.equal(h.context.patchNativeQuantityPipe(Pipe,'unrelated'), false);
});

test('native pipe discovery uses metadata instead of bundle IDs, and is idempotent', () => {
  class Layout { transform() { return '11.7K'; } }
  class Short { transform() { return '2.5K'; } }
  Layout.ɵpipe = {name:'layoutNumber'}; Short.ɵpipe = {name:'shortNumber'};
  const chunks = [[[],{
    arbitraryA:function(){ return {name:'layoutNumber'}; },
    arbitraryB:function(){ return {name:'shortNumber'}; },
    unrelated:function(){ throw Error('Must not load unrelated modules'); }
  }]];
  const loaded = [];
  chunks.push = chunk => chunk[2](id => {loaded.push(id); return id==='arbitraryA' ? {a:Layout} : {H:Short};});
  const h = harness({window:{webpackChunkidle_game:chunks}});
  h.context.installNativeQuantityPrecision();
  assert.equal(h.run('AppState.ui.quantityPrecision.installed'), true);
  assert.equal(new Layout().transform(11708), '11,708');
  assert.equal(new Short().transform(2568), '2,568');
  h.time(120000);
  h.context.installNativeQuantityPrecision();
  assert.deepEqual(loaded,['arbitraryA','arbitraryB']);
});

test('a missing or changed native bundle leaves quantity parsing available', () => {
  const h = harness({window:{}});
  assert.doesNotThrow(()=>h.context.installNativeQuantityPrecision());
  assert.equal(h.run('AppState.ui.quantityPrecision.installed'),false);
  assert.equal(h.context.formatItemQuantity(h.context.readItemQuantity(quantity('11K'))),'11K');
});

test('responsive quantities offer full counts and a separate suffix without changing the stored number', () => {
  const h = harness();
  const item = {amount:12108};
  const markup = h.context.formatQuantityMarkup(item);
  assert.match(markup, /title="12,108" aria-label="12,108"/);
  assert.match(markup, /iw-quantity-full" aria-hidden="true">12,108</);
  assert.match(markup, /iw-quantity-compact" aria-hidden="true">12.1<small class="iw-quantity-suffix">K<\/small>/);
  assert.doesNotMatch(markup, /≈/);
  assert.equal(item.amount,12108);
});

test('loot gains animate the exact difference even when the compact display does not change', () => {
  const h = harness();
  h.run(`
    globalThis.count=12108;
    readLoot=()=>[{name:'Elite Logbook',image:'/assets/items/logbook-100.png',amount:count}];
    AppState.ui.page={hidden:false,innerHTML:'',style:{setProperty(){}},querySelector(){return null;}};
    StatusRenderer.render(AppState);
  `);
  assert.equal(h.run('AppState.ui.lootDeltaNotices.size'),0);
  h.time(100500);
  h.run('count+=5; StatusRenderer.render(AppState)');
  assert.equal(h.run("AppState.ui.lootDeltaNotices.get('/assets/items/logbook-100.png').delta"),5);
  assert.equal(h.run('formatCompact(12108)'),h.run('formatCompact(12113)'));
  assert.equal(h.run("AppState.live.previousLootValues.get('/assets/items/logbook-100.png')"),12113);
});
