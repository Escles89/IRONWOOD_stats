  function discoverPlannedSkillLevel(Page, modules) {
    if (!Page) return null;
    // Resolve the native effective-level calculation from the SkillPage's own
    // skillLevel$ binding. Never approximate bonus levels with the XP level.
    const source = Function.prototype.toString.call(Page);
    const binding = source.match(/this\.skillLevel\$=([\s\S]*?),this\.canFight\$/)?.[1];
    const calls = [...(binding || '').matchAll(/\(0,[\w$]+\.([\w$]+)\)/g)];
    const exportName = calls.at(-1)?.[1];
    const candidates = modules.map(module => module[exportName]).filter(value => typeof value === 'function'
      && /\.skills\[[^\]]+\]\.exp/.test(Function.prototype.toString.call(value)));
    return candidates.length === 1 ? candidates[0] : null;
  }
