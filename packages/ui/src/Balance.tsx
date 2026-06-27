import { type CSSProperties } from 'react';
import { colors, font, radius, space } from './tokens.js';

export interface BalanceProps {
  /** Human-readable, already-formatted amount (e.g. from readTokenBalance). */
  formatted: string;
  symbol?: string;
  label?: string;
}

/** Compact balance card used on the Spend-first home (Section 7.1). */
export function Balance({ formatted, symbol = 'G$', label = 'Your balance' }: BalanceProps) {
  const card: CSSProperties = {
    background: colors.surface,
    color: colors.text,
    borderRadius: radius.lg,
    padding: space.lg,
    fontFamily: font.family,
  };
  return (
    <div style={card}>
      <div style={{ color: colors.textMuted, fontSize: 14 }}>{label}</div>
      <div style={{ fontSize: 32, fontWeight: 700, marginTop: space.xs }}>
        {formatted} <span style={{ color: colors.brand }}>{symbol}</span>
      </div>
    </div>
  );
}
