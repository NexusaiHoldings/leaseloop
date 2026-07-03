import {
  getDashboardSummary,
  getOpenWorkOrders,
  getActiveConversations,
  getActiveEscalations,
} from '@/lib/tenantthread/dashboard-queries';
import type { SlaStatus, WorkOrderRow, ConversationRow, EscalationRow } from '@/lib/tenantthread/dashboard-queries';

export const metadata = { title: 'Operations Dashboard — TenantThread' };

// ── Server Actions ────────────────────────────────────────────────────────────

async function handleTakeOver(formData: FormData): Promise<void> {
  'use server';
  const conversationId = (formData.get('conversation_id') as string | null) ?? '';
  const fromNumber = (formData.get('from_number') as string | null) ?? '';
  const issue = (formData.get('issue') as string | null) ?? 'Maintenance request';
  const unitNumber = (formData.get('unit_number') as string | null) ?? 'N/A';
  const propertyName = (formData.get('property_name') as string | null) ?? 'Unknown Property';

  const managerPhone = process.env.MANAGER_PHONE_NUMBER;
  if (!managerPhone) {
    console.error('[dashboard] MANAGER_PHONE_NUMBER env var is not set — cannot route Take Over SMS');
    return;
  }

  const smsBody = `TenantThread TAKE OVER — ${propertyName} Unit ${unitNumber}: "${issue}". Caller: ${fromNumber}. ID: ${conversationId.slice(0, 8)}`;
  const baseUrl = process.env.NEXTAUTH_URL ?? '';

  try {
    await fetch(`${baseUrl}/api/notifications/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        channel: 'sms',
        to: managerPhone,
        template_name: 'escalation_takeover',
        html: `<h2>TenantThread Escalation</h2><p>${smsBody}</p>`,
        variables: { message: smsBody },
      }),
    });

    await fetch(`${baseUrl}/api/analytics/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'dashboard.escalation.takeover',
        properties: { conversation_id: conversationId, urgency: 'high' },
      }),
    });
  } catch (err) {
    console.error('[dashboard] handleTakeOver notification error:', err);
  }
}

// ── Style helpers ─────────────────────────────────────────────────────────────

const URGENCY_PILL: Record<string, { background: string; color: string; label: string }> = {
  emergency: { background: '#fee2e2', color: '#b91c1c', label: 'EMERGENCY' },
  urgent:    { background: '#ffedd5', color: '#c2410c', label: 'URGENT' },
  routine:   { background: '#fef9c3', color: '#854d0e', label: 'Routine' },
  deferred:  { background: '#f3f4f6', color: '#374151', label: 'Deferred' },
};

const SLA_STYLE: Record<SlaStatus, { background: string; color: string }> = {
  green: { background: '#dcfce7', color: '#15803d' },
  amber: { background: '#fef9c3', color: '#854d0e' },
  red:   { background: '#fee2e2', color: '#b91c1c' },
};

function formatHours(hours: number): string {
  if (hours < 1) return `${Math.round(hours * 60)}m`;
  if (hours < 24) return `${hours.toFixed(1)}h`;
  return `${Math.round(hours / 24)}d`;
}

function stageLabel(stage: string): string {
  const map: Record<string, string> = {
    completed: 'Completed', failed: 'Failed',
    greeting: 'Active', gather_unit: 'Active', gather_issue: 'Active',
  };
  return map[stage] ?? stage;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatCard({
  label, value, sub, alert,
}: {
  label: string; value: string | number; sub?: string; alert?: boolean;
}) {
  return (
    <div
      className="card"
      style={{
        flex: '1 1 180px',
        background: alert ? '#fee2e2' : undefined,
        borderColor: alert ? '#f87171' : undefined,
      }}
    >
      <p className="muted" style={{ margin: '0 0 0.25rem', fontSize: '0.8rem' }}>{label}</p>
      <p style={{ margin: 0, fontSize: '1.75rem', fontWeight: 700, color: alert ? '#b91c1c' : undefined }}>
        {value}
      </p>
      {sub && <p className="muted" style={{ margin: '0.2rem 0 0', fontSize: '0.8rem' }}>{sub}</p>}
    </div>
  );
}

function EscalationBanner({ escalations }: { escalations: EscalationRow[] }) {
  if (escalations.length === 0) return null;
  return (
    <div
      style={{
        background: '#fee2e2',
        border: '1.5px solid #f87171',
        borderRadius: '0.5rem',
        padding: '0.85rem 1rem',
        marginBottom: '1.5rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.6rem',
      }}
    >
      <p style={{ margin: 0, fontWeight: 700, color: '#b91c1c', fontSize: '0.95rem' }}>
        ⚠ {escalations.length} active escalation{escalations.length > 1 ? 's' : ''} requiring immediate attention
      </p>
      {escalations.map((esc) => (
        <div
          key={esc.id}
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '0.5rem',
            padding: '0.5rem 0.75rem',
            background: '#fff',
            borderRadius: '0.375rem',
            border: '1px solid #fca5a5',
          }}
        >
          <div>
            <p style={{ margin: 0, fontWeight: 600, fontSize: '0.9rem' }}>
              {URGENCY_PILL[esc.urgency]?.label ?? esc.urgency}
              {' — '}
              {esc.property_name ?? 'Unknown Property'}
              {esc.unit_number ? ` · Unit ${esc.unit_number}` : ''}
            </p>
            {esc.issue_description && (
              <p className="muted" style={{ margin: '0.1rem 0 0', fontSize: '0.83rem' }}>
                {esc.issue_description}
              </p>
            )}
            <p className="muted" style={{ margin: '0.1rem 0 0', fontSize: '0.78rem' }}>
              Caller: {esc.from_number} · {new Date(esc.created_at).toLocaleString()}
            </p>
          </div>
          <form action={handleTakeOver}>
            <input type="hidden" name="conversation_id" value={esc.id} />
            <input type="hidden" name="from_number" value={esc.from_number} />
            <input type="hidden" name="issue" value={esc.issue_description ?? ''} />
            <input type="hidden" name="unit_number" value={esc.unit_number ?? ''} />
            <input type="hidden" name="property_name" value={esc.property_name ?? ''} />
            <button
              type="submit"
              style={{
                background: '#b91c1c',
                color: '#fff',
                border: 'none',
                borderRadius: '0.375rem',
                padding: '0.4rem 0.9rem',
                fontWeight: 700,
                fontSize: '0.85rem',
                cursor: 'pointer',
              }}
            >
              Take Over
            </button>
          </form>
        </div>
      ))}
    </div>
  );
}

function WorkOrdersTable({ workOrders }: { workOrders: WorkOrderRow[] }) {
  return (
    <section style={{ marginBottom: '2rem' }}>
      <h2>Open Work Orders</h2>
      {workOrders.length === 0 ? (
        <div className="empty">
          <strong>No open work orders</strong>
          <p className="muted">All maintenance requests are resolved.</p>
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th>Work Order</th>
                <th>Property / Unit</th>
                <th>Urgency</th>
                <th>PMS Status</th>
                <th>Time Open</th>
                <th>SLA</th>
              </tr>
            </thead>
            <tbody>
              {workOrders.map((wo) => {
                const urgency = URGENCY_PILL[wo.priority] ?? URGENCY_PILL.deferred;
                const sla = SLA_STYLE[wo.sla_status];
                return (
                  <tr key={wo.id}>
                    <td style={{ fontWeight: 600, fontSize: '0.88rem' }}>
                      {wo.work_order_number}
                    </td>
                    <td style={{ fontSize: '0.88rem' }}>
                      {wo.property_name ?? '—'}
                      {wo.unit_number ? ` · Unit ${wo.unit_number}` : ''}
                    </td>
                    <td>
                      <span
                        style={{
                          background: urgency.background,
                          color: urgency.color,
                          padding: '0.15rem 0.55rem',
                          borderRadius: '999px',
                          fontSize: '0.78rem',
                          fontWeight: 700,
                        }}
                      >
                        {urgency.label}
                      </span>
                    </td>
                    <td style={{ fontSize: '0.83rem' }}>
                      {wo.pms_sync_status ?? (
                        <span className="muted">—</span>
                      )}
                    </td>
                    <td style={{ fontSize: '0.83rem' }}>
                      {formatHours(wo.hours_open)}
                    </td>
                    <td>
                      <span
                        style={{
                          background: sla.background,
                          color: sla.color,
                          padding: '0.15rem 0.55rem',
                          borderRadius: '999px',
                          fontSize: '0.78rem',
                          fontWeight: 600,
                        }}
                      >
                        {wo.sla_status === 'green' ? '< 2h' : wo.sla_status === 'amber' ? '2–8h' : '> 8h'}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function ConversationsPanel({ conversations }: { conversations: ConversationRow[] }) {
  return (
    <section style={{ marginBottom: '2rem' }}>
      <h2>Active &amp; Recent Conversations</h2>
      {conversations.length === 0 ? (
        <div className="empty">
          <strong>No conversations yet</strong>
          <p className="muted">Tenant calls will appear here once received.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
          {conversations.map((conv) => {
            const urgency = URGENCY_PILL[conv.urgency] ?? URGENCY_PILL.deferred;
            return (
              <div
                key={conv.id}
                className="card"
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap' }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.2rem' }}>
                    <span
                      style={{
                        background: urgency.background,
                        color: urgency.color,
                        padding: '0.15rem 0.55rem',
                        borderRadius: '999px',
                        fontSize: '0.78rem',
                        fontWeight: 700,
                      }}
                    >
                      {urgency.label}
                    </span>
                    <span className="muted" style={{ fontSize: '0.78rem', alignSelf: 'center' }}>
                      {stageLabel(conv.stage)}
                    </span>
                  </div>
                  <p style={{ margin: 0, fontWeight: 600, fontSize: '0.9rem' }}>
                    {conv.from_number}
                    {conv.property_name && (
                      <span className="muted" style={{ fontWeight: 400, marginLeft: '0.4rem' }}>
                        · {conv.property_name}
                        {conv.unit_number ? ` · Unit ${conv.unit_number}` : ''}
                      </span>
                    )}
                  </p>
                  {conv.issue_description && (
                    <p
                      className="muted"
                      style={{
                        margin: '0.2rem 0 0',
                        fontSize: '0.85rem',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        maxWidth: '460px',
                      }}
                    >
                      {conv.issue_description}
                    </p>
                  )}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.4rem' }}>
                  <p className="muted" style={{ margin: 0, fontSize: '0.78rem', whiteSpace: 'nowrap' }}>
                    {new Date(conv.created_at).toLocaleString()}
                  </p>
                  <a href={`/admin/conversations/${conv.id}`} className="btn secondary">
                    Review &amp; Override
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function DashboardPage() {
  const [summary, workOrders, conversations, escalations] = await Promise.all([
    getDashboardSummary(),
    getOpenWorkOrders(),
    getActiveConversations(),
    getActiveEscalations(),
  ]);

  return (
    <main>
      <h1>Operations Dashboard</h1>
      <p>
        Real-time view of open work orders, active conversations, SLA performance, and
        escalations requiring human judgment.
      </p>

      <EscalationBanner escalations={escalations} />

      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '2rem' }}>
        <StatCard label="Open Tickets" value={summary.totalOpenTickets} />
        <StatCard
          label="Call Deflection Rate (7d)"
          value={`${summary.deflectionRate}%`}
          sub="AI-resolved without human"
        />
        <StatCard
          label="Avg Response Time (7d)"
          value={`${summary.avgResponseTimeMinutes.toFixed(1)}m`}
          sub="Call to work order"
        />
        <StatCard
          label="Active Escalations"
          value={summary.activeEscalations}
          alert={summary.activeEscalations > 0}
          sub={summary.activeEscalations > 0 ? 'Require immediate action' : 'All clear'}
        />
      </div>

      <WorkOrdersTable workOrders={workOrders} />
      <ConversationsPanel conversations={conversations} />
    </main>
  );
}
