import { colors, space, font } from '@owo/ui';

const page: React.CSSProperties = {
  minHeight: '100vh',
  background: colors.bg,
  color: colors.text,
  fontFamily: font.family,
  padding: space.xl,
};

// Sprint 1 stub. Each surface (disputes, KYC review, treasury controls,
// kill-switches) becomes a real RBAC-gated, audit-logged screen in later sprints.
const surfaces = ['Disputes', 'KYC review', 'Treasury controls', 'Kill-switches', 'Reconciliation'];

export function App() {
  return (
    <div style={page}>
      <h1 style={{ color: colors.brand }}>Owo Ops Console</h1>
      <p style={{ color: colors.textMuted }}>
        Internal console — RBAC + audit log on every action (Section 5). Sprint 1 stub.
      </p>
      <ul>
        {surfaces.map((s) => (
          <li key={s} style={{ margin: `${space.sm} 0` }}>
            {s} <span style={{ color: colors.textMuted }}>· coming soon</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
