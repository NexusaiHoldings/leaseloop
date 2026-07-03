import { listConversations, getFirstPropertyPhone } from '@/lib/tenantthread/conversation-queries';
import type { UrgencyLevel } from '@/lib/tenantthread/conversation-queries';

export const metadata = { title: 'Conversations — TenantThread' };

const URGENCY_STYLE: Record<UrgencyLevel, { background: string; color: string; label: string }> = {
  emergency: { background: '#fee2e2', color: '#b91c1c', label: 'EMERGENCY' },
  urgent:    { background: '#ffedd5', color: '#c2410c', label: 'URGENT' },
  routine:   { background: '#fef9c3', color: '#854d0e', label: 'Routine' },
  deferred:  { background: '#f3f4f6', color: '#374151', label: 'Deferred' },
};

const STAGE_STYLE: Record<string, { background: string; color: string }> = {
  completed:     { background: '#dcfce7', color: '#15803d' },
  failed:        { background: '#fee2e2', color: '#b91c1c' },
  greeting:      { background: '#dbeafe', color: '#1e40af' },
  gather_unit:   { background: '#dbeafe', color: '#1e40af' },
  gather_issue:  { background: '#dbeafe', color: '#1e40af' },
};

function stageLabel(stage: string): string {
  const map: Record<string, string> = {
    completed: 'Completed',
    failed: 'Failed',
    greeting: 'In Progress',
    gather_unit: 'In Progress',
    gather_issue: 'In Progress',
  };
  return map[stage] ?? stage;
}

const SAMPLE_MESSAGES = [
  { role: 'ai',     content: 'Thank you for calling the TenantThread maintenance line. Which unit number are you calling about?' },
  { role: 'tenant', content: 'Unit 204' },
  { role: 'ai',     content: 'Got it, unit 204. Please briefly describe your maintenance issue.' },
  { role: 'tenant', content: 'The kitchen faucet has been dripping for a few days and is getting worse.' },
  { role: 'ai',     content: 'I have created a routine maintenance work order. Our team will schedule a visit within the next 3 to 5 business days and will send you a confirmation.' },
];

export default async function ConversationsPage() {
  const [conversations, propertyPhone] = await Promise.all([
    listConversations(),
    getFirstPropertyPhone(),
  ]);

  return (
    <main>
      <h1>Conversations</h1>
      <p>
        Review every AI-tenant interaction, monitor triage decisions, and take action on
        maintenance calls.
      </p>

      {conversations.length === 0 ? (
        <div>
          <div className="empty">
            <div style={{ fontSize: '2.5rem', lineHeight: 1, marginBottom: '0.75rem' }}>💬</div>
            <strong>Your first call will appear here</strong>
            {propertyPhone && (
              <p style={{ margin: '0.5rem 0 0', fontSize: '1.1rem', fontWeight: 600 }}>
                Tenant maintenance line:{' '}
                <span style={{ color: '#1e40af' }}>{propertyPhone}</span>
              </p>
            )}
            <p className="muted" style={{ marginTop: '0.5rem' }}>
              Share the number above with your tenants. When they call, the AI agent will
              greet them, collect their unit number and maintenance issue, and route the
              request automatically.
            </p>
          </div>

          <section style={{ marginTop: '2rem' }}>
            <h2 style={{ marginBottom: '1rem' }}>Sample Conversation</h2>
            <div className="card" style={{ maxWidth: '640px' }}>
              <p className="muted" style={{ marginBottom: '1rem', fontSize: '0.85rem' }}>
                Preview — Jane Doe · Unit 204 · Sunrise Apartments
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {SAMPLE_MESSAGES.map((msg, idx) => (
                  <div
                    key={idx}
                    style={{
                      display: 'flex',
                      flexDirection: msg.role === 'tenant' ? 'row-reverse' : 'row',
                      gap: '0.5rem',
                      alignItems: 'flex-start',
                    }}
                  >
                    <span
                      style={{
                        background: msg.role === 'ai' ? '#dbeafe' : '#f3f4f6',
                        color: msg.role === 'ai' ? '#1e40af' : '#374151',
                        borderRadius: '999px',
                        padding: '0.2rem 0.6rem',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        whiteSpace: 'nowrap',
                        alignSelf: 'flex-start',
                        marginTop: '0.1rem',
                      }}
                    >
                      {msg.role === 'ai' ? 'AI' : 'Tenant'}
                    </span>
                    <p
                      style={{
                        margin: 0,
                        padding: '0.5rem 0.75rem',
                        background: msg.role === 'ai' ? '#eff6ff' : '#f9fafb',
                        borderRadius: '0.5rem',
                        fontSize: '0.9rem',
                        maxWidth: '80%',
                      }}
                    >
                      {msg.content}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '1rem' }}>
          {conversations.map((conv) => {
            const urgencyStyle = URGENCY_STYLE[conv.urgency];
            const stageStyle = STAGE_STYLE[conv.stage] ?? { background: '#f3f4f6', color: '#374151' };
            return (
              <div key={conv.id} className="card">
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    gap: '1rem',
                    flexWrap: 'wrap',
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.25rem' }}>
                      <span
                        style={{
                          background: urgencyStyle.background,
                          color: urgencyStyle.color,
                          padding: '0.15rem 0.55rem',
                          borderRadius: '999px',
                          fontSize: '0.78rem',
                          fontWeight: 700,
                        }}
                      >
                        {urgencyStyle.label}
                      </span>
                      <span
                        style={{
                          background: stageStyle.background,
                          color: stageStyle.color,
                          padding: '0.15rem 0.55rem',
                          borderRadius: '999px',
                          fontSize: '0.78rem',
                          fontWeight: 600,
                        }}
                      >
                        {stageLabel(conv.stage)}
                      </span>
                    </div>

                    <p style={{ margin: 0, fontWeight: 600, fontSize: '0.95rem' }}>
                      {conv.from_number}
                      {conv.property_name && (
                        <span className="muted" style={{ fontWeight: 400, marginLeft: '0.4rem' }}>
                          · {conv.property_name}
                          {conv.unit_number && ` · Unit ${conv.unit_number}`}
                        </span>
                      )}
                    </p>

                    {conv.issue_description && (
                      <p
                        className="muted"
                        style={{
                          margin: '0.25rem 0 0',
                          fontSize: '0.88rem',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          maxWidth: '480px',
                        }}
                      >
                        {conv.issue_description}
                      </p>
                    )}

                    {conv.work_order_number && (
                      <p className="muted" style={{ margin: '0.2rem 0 0', fontSize: '0.8rem' }}>
                        Work order: {conv.work_order_number}
                        {conv.work_order_status && ` · ${conv.work_order_status}`}
                      </p>
                    )}
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'flex-end',
                      gap: '0.4rem',
                    }}
                  >
                    <p className="muted" style={{ margin: 0, fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                      {new Date(conv.created_at).toLocaleString()}
                    </p>
                    <a href={`/admin/conversations/${conv.id}`} className="btn secondary">
                      View transcript
                    </a>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
