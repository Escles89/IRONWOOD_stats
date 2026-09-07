  const PAGE_ID = 'iw-stats-page';
  const NAV_ID = 'iw-stats-nav';
  const MULTIPLAYER_ID = 'iw-multiplayer-control';
  const STYLE_ID = 'iw-stats-style';
  const STATS_PATH = '/status';
  const LEGACY_STATS_PATH = '/stats';
  const CACHE_KEY = 'iw-stats-cache-v2';
  const PREFS_KEY = 'iw-stats-quest-prefs';
  const EQUIPPED_KEY = 'iw-stats-equipped-divine';
  const CHALLENGE_PREFS_KEY = 'iw-stats-challenge-prefs';
  const AUTOMATION_KEY = 'iw-stats-automation-enabled';
  const CACHE_LOOKUPS_KEY = 'iw-stats-cache-lookups-enabled';
  const SUPER_POTIONS_KEY = 'iw-stats-show-super-potions';
  const POTION_TYPES_KEY = 'iw-stats-potion-types';
  const POTION_TYPES = ['Regular', 'Super', 'Divine'];
  const HEADER_ICONS_KEY = 'iw-stats-header-icons';
  const MULTIPLAYER_VISIBLE_KEY = 'iw-stats-show-multiplayer';
  const DEBUG_KEY = 'iw-stats-debug';
  const PLAYER_NAME_KEY = 'iw-stats-player-name-v2';
  const CHALLENGE_SKILLS = {
    Forest: ['Woodcutting', 'Farming', 'Alchemy', 'Exploring', 'Ranged', 'Defense'],
    Mountain: ['Mining', 'Smelting', 'Smithing', 'Delving', 'One-handed', 'Defense'],
    Ocean: ['Fishing', 'Cooking', 'Enchanting', 'Imbuing', 'Two-handed', 'Defense']
  };
  const GATHERING_SKILLS = new Set(['Woodcutting', 'Mining', 'Farming', 'Fishing', 'Delving', 'Exploring']);
  const CRAFTING_SKILLS = new Set(['Smelting', 'Smithing', 'Enchanting', 'Alchemy', 'Cooking', 'Imbuing']);
  const COMBAT_SKILLS = new Set(['One-handed', 'Two-handed', 'Ranged', 'Defense']);
  const TRAIT_REGION_ORDER = [
    'Woodcutting', 'Farming', 'Alchemy', 'Exploring', 'Ranged',
    'Mining', 'Smelting', 'Smithing', 'Delving', 'One-handed',
    'Fishing', 'Cooking', 'Enchanting', 'Imbuing', 'Two-handed',
    'Defense'
  ];
  const TRAIT_REGIONS = [
    { name: 'Forest', skills: ['Woodcutting', 'Farming', 'Alchemy', 'Exploring', 'Ranged', 'Defense'] },
    { name: 'Mountain', skills: ['Mining', 'Smelting', 'Smithing', 'Delving', 'One-handed', 'Defense'] },
    { name: 'Ocean', skills: ['Fishing', 'Cooking', 'Enchanting', 'Imbuing', 'Two-handed', 'Defense'] }
  ];
  const TTL = { quests: 26 * 3600000, inventory: 3600000, equipped: Number.POSITIVE_INFINITY, adventure: 26 * 3600000, challenges: 26 * 3600000, taming: 3600000, automations: 24 * 3600000, attunement: 4 * 3600000, mastery: Number.POSITIVE_INFINITY, guildEvent: 24 * 3600000, guildTrial: 24 * 3600000 };
