import { RARITIES, RARITY_COLORS, contentRu, getContent } from '@ao/content';
import { itemBase, itemValue, levelScale, type ItemInstance } from '@ao/sim';

export interface ItemText {
  name: string;
  color: string;
  rarity: string;
  lines: string[];
  affixes: string[];
  value: number;
}

const ATTACK_KIND: Record<string, string> = {
  sword: 'Меч · удар по дуге',
  axe: 'Топор · широкий тяжёлый удар',
  dagger: 'Кинжал · быстрые выпады',
  bow: 'Лук · стрелы',
  crossbow: 'Арбалет · пробивающий болт',
  staff: 'Посох · магический снаряд и удар вблизи',
};

const SLOT_NAME: Record<string, string> = {
  helmet: 'Шлем',
  chest: 'Нагрудник',
  boots: 'Сапоги',
  artifact: 'Артефакт',
};

export function describeItem(item: ItemInstance): ItemText {
  const b = itemBase(item);
  const ru = contentRu;
  const lines: string[] = [];
  const scale = levelScale(item.level);
  if (b.kind === 'weapon') {
    const atk = b.def.attack;
    lines.push(ATTACK_KIND[b.def.type] ?? b.def.type);
    const count = atk.kind === 'projectile' && atk.count > 1 ? ` ×${atk.count}` : '';
    lines.push(`Урон: ${Math.round(atk.damage * scale)}${count}`);
    lines.push(`Атак в секунду: ${(1 / atk.cooldown).toFixed(1)}`);
  } else if (b.kind === 'armor') {
    lines.push(SLOT_NAME[b.slot] ?? b.slot);
    lines.push(`Броня: ${Math.round(b.def.armor * scale)}`);
    if (b.def.maxHp) lines.push(`Здоровье: +${b.def.maxHp}`);
  } else {
    lines.push(SLOT_NAME.artifact!);
    lines.push(ru[b.def.descKey] ?? '');
    lines.push(`Перезарядка: ${b.def.cooldown} с`);
  }
  const affixes = item.affixes.map((a) => {
    const def = getContent().affixById.get(a.id);
    const tpl = def ? (ru[def.nameKey] ?? def.id) : a.id;
    return tpl.replace('{v}', String(a.v));
  });
  return {
    name: ru[b.def.nameKey] ?? item.base,
    color: RARITY_COLORS[item.rarity] ?? '#fff',
    rarity: `${ru[`rarity.${RARITIES[item.rarity]}`] ?? ''} · ур. ${item.level}`,
    lines,
    affixes,
    value: itemValue(item),
  };
}
