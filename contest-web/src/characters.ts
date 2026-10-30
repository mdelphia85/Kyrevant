export const species = [
  { name: 'Human', description: 'Adaptable frontier explorers. +15 health, +15 shields.', health: 115, shield: 115 },
  { name: 'Aelari', description: 'Starborn mystics whose living armor stores energy. +35 shields.', health: 100, shield: 135 },
  { name: 'Stoneborn', description: 'Resilient deep-world clans. +40 health.', health: 140, shield: 100 },
] as const

export const characterClasses = [
  { name: 'Fighter', description: 'Assault rifle · resilient frontline · fragmentation grenade' },
  { name: 'Monk', description: 'Rapid carbine · fast movement · close-range dash strike' },
  { name: 'Cleric', description: 'Support rifle · healing pulse · revive nearby allies' },
  { name: 'Wizard', description: 'Heavy energy rifle · long range · arcane blast' },
] as const
export type Species = typeof species[number]['name']
export type CharacterClass = typeof characterClasses[number]['name']
