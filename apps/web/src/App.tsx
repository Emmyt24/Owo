import { useAccount } from 'wagmi';
import { Balance, colors, space, font, radius } from '@owo/ui';
import { useGdollarBalance } from './useGdollarBalance';
import { GDOLLAR_TOKEN_ADDRESS } from './env';

const page: React.CSSProperties = {
  minHeight: '100vh',
  background: colors.bg,
  color: colors.text,
  fontFamily: font.family,
  padding: space.lg,
  maxWidth: 480,
  margin: '0 auto',
};

const button: React.CSSProperties = {
  minHeight: font.minTapTarget,
  width: '100%',
  border: 'none',
  borderRadius: radius.pill,
  background: colors.brand,
  color: colors.text,
  fontSize: 16,
  fontWeight: 700,
  marginTop: space.md,
  cursor: 'pointer',
};

export function App() {
  const { isConnected, address } = useAccount();
  const { data: balance, isLoading } = useGdollarBalance(address);

  return (
    <div style={page}>
      <h1 style={{ color: colors.brand, marginBottom: space.xs }}>Owo</h1>
      <p style={{ color: colors.textMuted, marginTop: 0 }}>
        Spend your G$. Trade for Naira. Keep it circulating.
      </p>

      {/* AppKit web component renders the connect/account modal trigger. */}
      <appkit-button />

      {isConnected && (
        <div style={{ marginTop: space.lg }}>
          <Balance formatted={isLoading ? '…' : (balance?.formatted ?? '0')} />
          {!GDOLLAR_TOKEN_ADDRESS && (
            <p style={{ color: colors.warning, fontSize: 13 }}>
              Set VITE_GDOLLAR_TOKEN_ADDRESS to read a real balance.
            </p>
          )}

          <button style={button}>Buy airtime / data</button>
          <button style={{ ...button, background: colors.surface }}>Sell G$ for Naira</button>
        </div>
      )}
    </div>
  );
}
