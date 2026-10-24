/**
 * Custom SVG Icons for «Тёмный рубеж»
 * Dark fantasy minimalism. Code-drawn, no external dependencies.
 */

import React from 'react';
import { TowerType } from '../game/config';

/** Tower picture from public/sprites; falls back to the shape icon if the file is missing. */
export function TowerSpriteIcon({ type, size = 24, color }: { type: TowerType; size?: number | string; color?: string }) {
  const [failed, setFailed] = React.useState(false);
  if (failed) return <TowerShapeIcon type={type} size={size} color={color} />;
  return (
    <img
      src={`sprites/tower_${type}.png`}
      alt=""
      draggable={false}
      onError={() => setFailed(true)}
      style={{ height: size, width: 'auto', maxWidth: typeof size === 'number' ? size * 1.1 : '100%', objectFit: 'contain' }}
    />
  );
}

export function TowerShapeIcon({ type, size = 24, color }: { type: TowerType; size?: number | string; color?: string }) {
  if (type === 'archer') {
    // Triangle
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <polygon points="12,3 21,21 3,21" fill={color || '#d9b44a'} stroke="#121118" strokeWidth="2" />
      </svg>
    );
  }
  if (type === 'mage') {
    // Rhombus
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <polygon points="12,2 22,12 12,22 2,12" fill={color || '#8f6bff'} stroke="#121118" strokeWidth="2" />
      </svg>
    );
  }
  if (type === 'ballista') {
    // Square with plank
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <rect x="4" y="4" width="16" height="16" fill={color || '#c9663a'} stroke="#121118" strokeWidth="2" />
        <line x1="2" y1="12" x2="22" y2="12" stroke="#121118" strokeWidth="4" />
        <line x1="12" y1="2" x2="12" y2="22" stroke="#d9b44a" strokeWidth="3" />
      </svg>
    );
  }
  // Priest: circle with ring
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="9" fill={color || '#f2f0e0'} stroke="#121118" strokeWidth="2" />
      <circle cx="12" cy="12" r="4.5" stroke="#121118" strokeWidth="2" fill="none" />
    </svg>
  );
}

// «Связка»: two interlocked rings on a plinth, as drawn on the field
export function BinderIcon({ size = 24 }: { size?: number | string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M7 22 L8.5 16 L15.5 16 L17 22 Z" fill="#2b2838" stroke="#121118" strokeWidth="1.2" />
      <ellipse cx="9.5" cy="9" rx="4.5" ry="6" stroke="#3ed6c4" strokeWidth="2" />
      <ellipse cx="14.5" cy="9" rx="4.5" ry="6" stroke="#3ed6c4" strokeWidth="2" />
      <circle cx="12" cy="9" r="1.4" fill="#3ed6c4" />
    </svg>
  );
}

export function GoldIcon({ size = 18 }: { size?: number | string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="9" fill="#f4c06a" stroke="#8a6519" strokeWidth="1.5" />
      <circle cx="12" cy="12" r="5.5" stroke="#d99824" strokeWidth="1" fill="none" />
      <text x="12" y="16" textAnchor="middle" fontSize="11" fontWeight="bold" fill="#5c4109">
        G
      </text>
    </svg>
  );
}

export function HeartCastleIcon({ size = 18 }: { size?: number | string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path
        d="M3 21V9l4-4 5 3 5-3 4 4v12H3z"
        fill="#e0452f"
        stroke="#121118"
        strokeWidth="1.5"
      />
      <rect x="9" y="14" width="6" height="7" fill="#121118" />
    </svg>
  );
}

export function StarIcon({ filled, size = 18 }: { filled: boolean; size?: number | string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <polygon
        points="12,2 15,9 22,9 17,14 19,21 12,17 5,21 7,14 2,9 9,9"
        fill={filled ? '#f4c06a' : '#2f3542'}
        stroke={filled ? '#a67c1e' : '#1f242e'}
        strokeWidth="1.5"
      />
    </svg>
  );
}

export function LockIcon({ size = 18 }: { size?: number | string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <rect x="5" y="11" width="14" height="10" rx="2" fill="#4a3a38" stroke="#121118" strokeWidth="1.5" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" stroke="#8a7470" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
