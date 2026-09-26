  function discoverNativeMastery(Page, modules) {
    if (!Page) return null;
    // Read the route component's named bindings, never construct a component
    // or depend on a particular build's minified module/export identifiers.
    const source = Function.prototype.toString.call(Page);
    const binding = name => source.match(new RegExp(`this\\.${name}\\s*=\\s*([\\w$]+)\\.([\\w$]+)`));
    const catalog = binding('MASTERY_DATA'), cost = binding('MASTERY_COST'), exp = binding('MASTERY_EXP'), required = binding('calcMasteryItems');
    if (!catalog || !cost || !exp || !required || cost[1] !== catalog[1] || exp[1] !== catalog[1]) return null;
    const catalogs = modules.filter(module => module[catalog[2]]?.['1']?.name === 'Woodcutting'
      && module[catalog[2]]['1'].items && module[catalog[2]]['1'].badgeId);
    const calculations = modules.filter(module => typeof module[required[2]] === 'function');
    if (catalogs.length !== 1 || calculations.length !== 1) return null;
    const data = catalogs[0];
    return { catalog: data[catalog[2]], cost: masteryNumber(data[cost[2]]), exp: masteryNumber(data[exp[2]]), required: calculations[0][required[2]] };
  }
