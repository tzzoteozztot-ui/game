// Иконки вместо эмодзи (Draw Things, 2026-11-15): файлы public/ui-icons/<имя>.webp, 128×128 с прозрачным фоном.
// Запись «эмодзи → файл» — в docs; нет файла (или не загрузился) — остаётся эмодзи из `fallback`.
import type { DamageType } from './game/config';

export const ICON_DIR = 'ui-icons/';

export type IconName =
  | 'dmg_phys' | 'dmg_fire' | 'dmg_ice' | 'dmg_lightning' | 'dmg_poison'
  | 'star' | 'res_gold' | 'res_wood' | 'res_crystal'
  | 'skill_order' | 'skill_stone' | 'skill_shard'
  | 'item_sword' | 'item_crossbow' | 'item_mail' | 'item_plate' | 'item_idol' | 'item_shard' | 'item_banner' | 'item_token' | 'item_mirror' | 'item_warbanner'
  | 'map_fortress' | 'map_camp' | 'map_event' | 'map_lock' | 'map_chest' | 'map_idol' | 'map_mine' | 'map_shrine' | 'map_hero'
  | 'arrow_right' | 'arrow_up' | 'arrow_down' | 'mark_dot' | 'mark_check'
  | 'ui_journal' | 'ui_save' | 'ui_center' | 'ui_eye' | 'ui_ghost' | 'ui_crown' | 'ui_refresh' | 'ui_close' | 'ui_back' | 'ui_enemy';

/** Подсветка: иконки тёмные, на тёмном фоне окон без неё теряются. */
export const ICON_GLOW = { filter: 'brightness(1.3) contrast(1.05) drop-shadow(0 0 1.5px rgba(255,238,190,0.95)) drop-shadow(0 0 4px rgba(255,214,120,0.55))' } as const;

export const iconUrl = (n: IconName) => `${ICON_DIR}${n}.webp`;

/** Иконка в строке текста: высота чуть больше строки, по базовой линии. */
export function Ico({ n, className = '', title }: { n: IconName; className?: string; title?: string }) {
  return (
    <img
      src={iconUrl(n)}
      alt=""
      title={title}
      draggable={false}
      className={`inline-block h-[1.2em] w-[1.2em] align-[-0.25em] select-none object-contain ${className}`}
      style={ICON_GLOW}
    />
  );
}

export const dmgIcon = (t: DamageType): IconName => `dmg_${t}` as IconName;
export const resIcon = (k: 'gold' | 'wood' | 'crystal'): IconName => `res_${k}`;
export const skillIcon = (id: string) => `skill_${id}` as IconName;
export const itemIcon = (id: string) => `item_${id}` as IconName;
