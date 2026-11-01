/**
 * Icon of an enemy of a faction: its faction's sprite (`enemy_<type>_<faction>`), else the common one;
 * the boss — `boss_<faction>`. Used where the field's enemy look must match (army, next wave).
 */

import { useEffect, useState } from 'react';
import type { EnemyType } from '../game/config';

export function enemySpriteSources(type: EnemyType, faction: number): string[] {
  if (type === 'boss') return [`boss_${faction}`];
  if (type === 'imp') return ['enemy_imp', 'enemy_scout'];
  return [`enemy_${type}_${faction}`, `enemy_${type}`];
}

export function EnemyIcon({ type, faction, alt, title, className, style }: { type: EnemyType; faction: number; alt: string; title?: string; className?: string; style?: React.CSSProperties }) {
  const sources = enemySpriteSources(type, faction);
  const [step, setStep] = useState(0);
  useEffect(() => setStep(0), [type, faction]);
  if (step >= sources.length) return null;
  return (
    <img
      src={`sprites/${sources[step]}.png`}
      alt={alt}
      title={title}
      draggable={false}
      onError={() => setStep((n) => n + 1)}
      className={className}
      style={style}
    />
  );
}
