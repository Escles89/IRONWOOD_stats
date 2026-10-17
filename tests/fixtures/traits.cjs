const levels = [100, 115, 130];
const thresholds = [12000000, 40812335, 138803896];
function definitions() {
  const names = ['Woodcutting XP', 'Mining XP', 'Fishing XP', 'Defense XP', 'Woodcutting Yield', 'Mining Yield', 'Fishing Yield'];
  const catalog = Object.fromEntries(names.map((name, index) => [String(index + 1), { id: String(index + 1), name, image: 'misc/woodcutting.png' }]));
  const regions = { Forest: ['1', '4', '5'], Mountain: ['2', '4', '6'], Ocean: ['3', '4', '7'], All: Object.keys(catalog) };
  const sets = {};
  for (const [index, level] of levels.entries()) {
    for (const [region, traitIds] of Object.entries(regions)) {
      const id = String(Object.keys(sets).length + 1);
      sets[id] = { id, name: `Lv. ${level} ${region} Set`, description: `+1% ${region} Skill Efficiency`, exp: thresholds[index], traitIds };
    }
  }
  return { catalog, sets, level: (user, id) => {
    const xp = user.traits.storage[id]?.exp ?? 0;
    return xp >= thresholds[2] ? 130 : xp >= thresholds[1] ? 115 : xp >= thresholds[0] ? 100 : 99;
  }, capacity: user => 1 + (user.traits.upgrades.slots || 0), gain: user => user.gain,
  canClaim: (user, id) => !user.traits.sets?.[id] && sets[id].traitIds.every(traitId => (user.traits.storage[traitId]?.exp ?? 0) >= sets[id].exp) };
}
function user() {
  return { displayName: 'Player', isSolo: false, inventory: {}, action: { skillId: '1', actionId: '1' }, gain: 20,
    traits: { storage: Object.fromEntries(Object.keys(definitions().catalog).map(id => [id, { id, exp: Number(id) * 100 }])),
      equippedIds: { '1': true, '2': true, '3': true }, upgrades: { slots: 2 }, sets: {} } };
}
module.exports = { definitions, user, thresholds };
