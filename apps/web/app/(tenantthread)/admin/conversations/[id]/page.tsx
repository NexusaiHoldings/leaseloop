import { notFound, redirect } from 'next/navigation';
import {
  getConversation,
  escalateConversation,
  markConversationResolved,
  flagConversationForReview,
} from '@/lib/tenantthread/conversation-queries';
import type { UrgencyLevel } from '@/lib/tenantthread/conversation-queries';

const URGENCY_STYLE: Record<UrgencyLevel, { background: string; color: string; label: string }> = {
  emergency: { background: '#fee2e2', color: '#b91c1c', label: 'EMERGENCY' },
  urgent:    { background: '#ffedd5', color: '#c2410c', label: 'URGENT' },
  routine:   { background: '#fef9c3', color: '#854d0e', label: 'Routine' },
  deferred:  { background: '#f3f4f6', color: '#374151', label: 'Deferred' },
};

interface PageProps {
  params: { id: string };
  searchParams?: Record<string, string | string[] | undefined>;
}

export async function generateMetadata({ params }: PageProps) {
  const conv = await getConversation(params.id);
  if (!conv) return { title: 'Conversation Not Found — TenantThread' };
  return {
    title: `Call from ${conv.from_number} — TenantThread`,
  };
}

export default async function ConversationDetailPage({ params, searchParams }: PageProps) {
  const conv = await getConversation(params.id);
  if (!conv) notFound();

  const actionResult = searchParams?.action as string | undefined;
  const convId = params.id;

  async function handleEscalate() {
    'use server';
    await escalateConversation(convId);
    redirect(`/admin/conversations/${convId}?action=escalated`);
  }

  async function handleResolve() {
    'use server';
    await markConversationResolved(convId);
    redirect(`/admin/conversations/${convId}?action=resolved`);
  }

  async function handleFlag() {
    'use server';
    await flagConversationForReview(convId);
    redirect(`/admin/conversations/${convId}?action=flagged`);
  }

  const urgencyStyle = URGENCY_STYLE[conv.urgency];
  const stageColor =
    conv.stage === 'completed'
      ? { background: '#dcfce7', color: '#15803d' }
      : conv.stage === 'failed'
      ? { background: '#fee2e2', color: '#b91c1c' }
      : { background: '#dbeafe', color: '#1e40af' };

  const actionBanner: Record<string, { msg: string; bg: string }> = {
    escalated: { msg: 'Conversation escalated to a human agent. A support ticket has been created.', bg: '#fff7ed' },
    resolved:  { msg: 'Conversation marked as resolved.', bg: '#f0fdf4' },
    flagged:   { msg: 'Conversation flagged for review. A support ticket has been created.', bg: '#fef9c3' },
  };
  const banner = actionResult ? actionBanner[actionResult] : null;

  return (
    <main>
      <p className="muted" style={{ marginBottom: '0.5rem' }}>
        <a href="/admin/conversations">← All Conversations</a>
      </p>

      <h1 style={{ marginBottom: '0.25rem' }}>
        Call from {conv.from_number}
      </h1>
      <p className="muted">
        {conv.property_name ?? 'Unknown Property'}
        {conv.unit_number ? ` · Unit ${conv.unit_number}` : ''}
        {' · '}
        {new Date(conv.created_at).toLocaleString()}
      </p>

      {banner && (
        <div
          style={{
            background: banner.bg,
            border: '1px solid #d1d5db',
            borderRadius: '0.5rem',
            padding: '0.75rem 1rem',
            marginBottom: '1.5rem',
            fontSize: '0.9rem',
          }}
        >
          {banner.msg}
        </div>
      )}

      {/* ── Triage outcome card ─────────────────────────────────────── */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <h2 style={{ margin: '0 0 0.75rem', fontSize: '1rem' }}>Triage Outcome</h2>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
          <span
            style={{
              background: urgencyStyle.background,
              color: urgencyStyle.color,
              padding: '0.25rem 0.75rem',
              borderRadius: '999px',
              fontSize: '0.85rem',
              fontWeight: 700,
            }}
          >
            {urgencyStyle.label}
          </span>
          <span
            style={{
              background: stageColor.background,
              color: stageColor.color,
              padding: '0.25rem 0.75rem',
              borderRadius: '999px',
              fontSize: '0.85rem',
              fontWeight: 600,
            }}
          >
            {conv.stage}
          </span>
          <span
            style={{
              background: '#f3f4f6',
              color: '#374151',
              padding: '0.25rem 0.75rem',
              borderRadius: '999px',
              fontSize: '0.85rem',
            }}
          >
            Confidence: {Math.round(conv.confidence_score * 100)}%
          </span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '0.5rem' }}>
          {conv.work_order_number && (
            <p style={{ margin: 0, fontSize: '0.88rem' }}>
              <span className="muted">Work order: </span>
              <strong>{conv.work_order_number}</strong>
              {conv.work_order_status && (
                <span className="muted"> ({conv.work_order_status})</span>
              )}
            </p>
          )}
          {conv.pms_sync_status && (
            <p style={{ margin: 0, fontSize: '0.88rem' }}>
              <span className="muted">PMS sync: </span>
              <strong>{conv.pms_sync_status}</strong>
            </p>
          )}
          <p style={{ margin: 0, fontSize: '0.88rem' }}>
            <span className="muted">Call SID: </span>
            <code style={{ fontSize: '0.82rem' }}>{conv.call_sid}</code>
          </p>
        </div>

        {conv.reasoning_summary && (
          <details style={{ marginTop: '1rem' }}>
            <summary
              style={{ cursor: 'pointer', fontSize: '0.88rem', color: '#6b7280', userSelect: 'none' }}
            >
              AI reasoning summary
            </summary>
            <p
              style={{
                marginTop: '0.5rem',
                padding: '0.75rem',
                background: '#f9fafb',
                borderRadius: '0.375rem',
                fontSize: '0.85rem',
                lineHeight: 1.6,
              }}
            >
              {conv.reasoning_summary}
            </p>
          </details>
        )}
      </div>

      {/* ── Message thread ──────────────────────────────────────────── */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <h2 style={{ margin: '0 0 1rem', fontSize: '1rem' }}>Transcript</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {conv.messages.map((msg, idx) => (
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
                  fontWeight: 700,
                  whiteSpace: 'nowrap',
                  alignSelf: 'flex-start',
                  marginTop: '0.1rem',
                  flexShrink: 0,
                }}
              >
                {msg.role === 'ai' ? 'AI' : 'Tenant'}
              </span>
              <div style={{ maxWidth: '75%' }}>
                <p
                  style={{
                    margin: 0,
                    padding: '0.5rem 0.75rem',
                    background: msg.role === 'ai' ? '#eff6ff' : '#f9fafb',
                    borderRadius: '0.5rem',
                    fontSize: '0.9rem',
                    lineHeight: 1.5,
                  }}
                >
                  {msg.content}
                </p>
                <p
                  className="muted"
                  style={{ margin: '0.15rem 0 0', fontSize: '0.75rem' }}
                >
                  {new Date(msg.timestamp).toLocaleTimeString()}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Action buttons ──────────────────────────────────────────── */}
      <div className="card">
        <h2 style={{ margin: '0 0 0.75rem', fontSize: '1rem' }}>Actions</h2>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <form action={handleEscalate}>
            <button type="submit">Escalate to Human</button>
          </form>
          <form action={handleResolve}>
            <button type="submit" style={{ background: '#15803d' }}>Mark Resolved</button>
          </form>
          <form action={handleFlag}>
            <button type="submit" className="btn secondary">Flag for Review</button>
          </form>
        </div>
        <p className="muted" style={{ marginTop: '0.75rem', fontSize: '0.82rem' }}>
          Escalating routes this conversation to the human operator queue via the support
          system. Flagging creates a review ticket for quality assurance.
        </p>
      </div>
    </main>
  );
}
