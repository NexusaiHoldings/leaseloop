/**
 * Conversation query helpers for the TenantThread transcript viewer.
 *
 * Reads from voice_calls + work_orders tables populated by the voice agent.
 * Synthesizes message threads from call-stage data for display in the manager UI.
 */

import { Pool } from 'pg';
import { classifyIssue } from './escalation-rules';
import type { UrgencyLevel } from './escalation-rules';

let _pool: Pool | null = null;

function getPool(): Pool {
  if (!_pool) {
    _pool = new Pool({ connectionString: process.env.DATABASE_URL });
  }
  return _pool;
}

// ── Types ─────────────────────────────────────────────────────────────────────

export type { UrgencyLevel };

export interface ConversationSummary {
  id: string;
  call_sid: string;
  from_number: string;
  property_name: string | null;
  unit_number: string | null;
  issue_description: string | null;
  stage: string;
  urgency: UrgencyLevel;
  work_order_id: string | null;
  work_order_number: string | null;
  work_order_status: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface SynthesizedMessage {
  role: 'ai' | 'tenant';
  content: string;
  timestamp: Date;
}

export interface ConversationDetail extends ConversationSummary {
  to_number: string;
  messages: SynthesizedMessage[];
  reasoning_summary: string | null;
  pms_sync_status: string | null;
  confidence_score: number;
}

// ── Internal helpers ──────────────────────────────────────────────────────────

interface RawCallRow {
  id: string;
  call_sid: string;
  from_number: string;
  to_number: string;
  property_name: string | null;
  unit_number: string | null;
  issue_description: string | null;
  stage: string;
  work_order_id: string | null;
  work_order_number: string | null;
  work_order_status: string | null;
  urgency_raw: string | null;
  pms_sync_status: string | null;
  created_at: Date;
  updated_at: Date;
}

function deriveUrgency(row: RawCallRow): UrgencyLevel {
  if (row.urgency_raw) return row.urgency_raw as UrgencyLevel;
  if (row.issue_description) {
    return classifyIssue(row.issue_description, false).urgency;
  }
  return 'deferred';
}

function buildMessages(call: {
  unit_number: string | null;
  issue_description: string | null;
  stage: string;
  created_at: Date;
}): SynthesizedMessage[] {
  const msgs: SynthesizedMessage[] = [];
  const base = new Date(call.created_at).getTime();

  msgs.push({
    role: 'ai',
    content: 'Thank you for calling the TenantThread maintenance line. Which unit number are you calling about?',
    timestamp: new Date(base),
  });

  if (call.unit_number) {
    msgs.push({
      role: 'tenant',
      content: `Unit ${call.unit_number}`,
      timestamp: new Date(base + 15_000),
    });
    msgs.push({
      role: 'ai',
      content: `Got it, unit ${call.unit_number}. Please briefly describe your maintenance issue.`,
      timestamp: new Date(base + 22_000),
    });
  }

  if (call.issue_description) {
    msgs.push({
      role: 'tenant',
      content: call.issue_description,
      timestamp: new Date(base + 42_000),
    });
    const decision = classifyIssue(call.issue_description, false);
    msgs.push({
      role: 'ai',
      content: decision.responseMessage,
      timestamp: new Date(base + 52_000),
    });
  }

  if (call.stage === 'completed' || call.stage === 'failed') {
    msgs.push({
      role: 'ai',
      content:
        call.stage === 'completed'
          ? 'Your request has been logged. You will receive a confirmation shortly. Thank you for calling!'
          : 'I was unable to complete your request at this time. Please call back or visit the office for assistance.',
      timestamp: new Date(base + 70_000),
    });
  }

  return msgs;
}

// ── Query functions ───────────────────────────────────────────────────────────

export async function listConversations(): Promise<ConversationSummary[]> {
  const pool = getPool();
  try {
    const result = await pool.query<RawCallRow>(
      `SELECT vc.id, vc.call_sid, vc.from_number, vc.to_number,
              vc.property_name, vc.unit_number, vc.issue_description,
              vc.stage, vc.created_at, vc.updated_at,
              wo.id            AS work_order_id,
              wo.work_order_number,
              wo.status        AS work_order_status,
              wo.priority      AS urgency_raw,
              NULL::text       AS pms_sync_status
       FROM voice_calls vc
       LEFT JOIN work_orders wo ON wo.call_sid = vc.call_sid
       ORDER BY vc.created_at DESC
       LIMIT 100`,
    );
    return result.rows.map((row) => ({
      id: row.id,
      call_sid: row.call_sid,
      from_number: row.from_number,
      property_name: row.property_name,
      unit_number: row.unit_number,
      issue_description: row.issue_description,
      stage: row.stage,
      urgency: deriveUrgency(row),
      work_order_id: row.work_order_id,
      work_order_number: row.work_order_number,
      work_order_status: row.work_order_status,
      created_at: row.created_at,
      updated_at: row.updated_at,
    }));
  } catch {
    return [];
  }
}

export async function getConversation(id: string): Promise<ConversationDetail | null> {
  const pool = getPool();
  try {
    const result = await pool.query<RawCallRow>(
      `SELECT vc.id, vc.call_sid, vc.from_number, vc.to_number,
              vc.property_name, vc.unit_number, vc.issue_description,
              vc.stage, vc.created_at, vc.updated_at,
              wo.id            AS work_order_id,
              wo.work_order_number,
              wo.status        AS work_order_status,
              wo.priority      AS urgency_raw,
              p.pms_sync_status
       FROM voice_calls vc
       LEFT JOIN work_orders wo ON wo.call_sid = vc.call_sid
       LEFT JOIN properties   p  ON p.id = vc.property_id
       WHERE vc.id = $1`,
      [id],
    );
    if (result.rows.length === 0) return null;
    const row = result.rows[0];
    const urgency = deriveUrgency(row);
    const decision = row.issue_description
      ? classifyIssue(row.issue_description, false)
      : null;
    const confidence =
      row.issue_description && row.unit_number ? 0.92 : row.issue_description ? 0.65 : 0.3;

    return {
      id: row.id,
      call_sid: row.call_sid,
      from_number: row.from_number,
      to_number: row.to_number,
      property_name: row.property_name,
      unit_number: row.unit_number,
      issue_description: row.issue_description,
      stage: row.stage,
      urgency,
      work_order_id: row.work_order_id,
      work_order_number: row.work_order_number,
      work_order_status: row.work_order_status,
      created_at: row.created_at,
      updated_at: row.updated_at,
      messages: buildMessages({
        unit_number: row.unit_number,
        issue_description: row.issue_description,
        stage: row.stage,
        created_at: row.created_at,
      }),
      reasoning_summary: decision
        ? `Classified as ${decision.urgency} (${decision.action}). Target resolution: ${decision.targetResolutionHours}h. Confidence: ${Math.round(confidence * 100)}%. ${decision.responseMessage}`
        : null,
      pms_sync_status: row.pms_sync_status,
      confidence_score: confidence,
    };
  } catch {
    return null;
  }
}

export async function getFirstPropertyPhone(): Promise<string | null> {
  const pool = getPool();
  try {
    const result = await pool.query<{ maintenance_phone: string }>(
      `SELECT maintenance_phone FROM properties WHERE maintenance_phone IS NOT NULL LIMIT 1`,
    );
    return result.rows[0]?.maintenance_phone ?? null;
  } catch {
    return null;
  }
}

export async function escalateConversation(
  id: string,
): Promise<{ success: boolean; ticket_id?: string }> {
  const pool = getPool();
  try {
    const result = await pool.query<{
      call_sid: string;
      from_number: string;
      unit_number: string | null;
      issue_description: string | null;
      property_name: string | null;
      work_order_id: string | null;
    }>(
      `SELECT vc.call_sid, vc.from_number, vc.unit_number, vc.issue_description,
              vc.property_name, wo.id AS work_order_id
       FROM voice_calls vc
       LEFT JOIN work_orders wo ON wo.call_sid = vc.call_sid
       WHERE vc.id = $1`,
      [id],
    );
    if (result.rows.length === 0) return { success: false };
    const conv = result.rows[0];
    const subject = `Escalation: ${conv.property_name ?? 'Unknown Property'} — Unit ${conv.unit_number ?? 'N/A'}`;
    const body = `Tenant called from ${conv.from_number} regarding: ${conv.issue_description ?? 'unspecified issue'}. Work order: ${conv.work_order_id ?? 'none created'}.`;

    const ticket = await pool.query<{ id: string }>(
      `INSERT INTO support_tickets (user_id, subject, priority, status, assignee_type)
       VALUES (NULL, $1, 'urgent', 'open', 'human')
       RETURNING id`,
      [subject],
    );
    const ticketId = ticket.rows[0]?.id;
    if (ticketId) {
      await pool.query(
        `INSERT INTO support_messages (ticket_id, author_type, author_id, body)
         VALUES ($1, 'agent', NULL, $2)`,
        [ticketId, body],
      );
    }
    return { success: true, ticket_id: ticketId };
  } catch {
    return { success: false };
  }
}

export async function markConversationResolved(id: string): Promise<boolean> {
  const pool = getPool();
  try {
    await pool.query(
      `UPDATE work_orders
       SET status = 'completed', updated_at = NOW()
       WHERE call_sid = (SELECT call_sid FROM voice_calls WHERE id = $1)`,
      [id],
    );
    return true;
  } catch {
    return false;
  }
}

export async function flagConversationForReview(
  id: string,
): Promise<{ success: boolean }> {
  const pool = getPool();
  try {
    const result = await pool.query<{
      from_number: string;
      unit_number: string | null;
      issue_description: string | null;
      property_name: string | null;
    }>(
      `SELECT from_number, unit_number, issue_description, property_name
       FROM voice_calls WHERE id = $1`,
      [id],
    );
    if (result.rows.length === 0) return { success: false };
    const conv = result.rows[0];
    const subject = `Review Flag: ${conv.property_name ?? 'Unknown Property'} — Unit ${conv.unit_number ?? 'N/A'}`;
    const body = `Flagged for review by manager. Tenant called from ${conv.from_number}. Issue: ${conv.issue_description ?? 'unspecified'}.`;

    const ticket = await pool.query<{ id: string }>(
      `INSERT INTO support_tickets (user_id, subject, priority, status, assignee_type)
       VALUES (NULL, $1, 'normal', 'open', 'agent')
       RETURNING id`,
      [subject],
    );
    const ticketId = ticket.rows[0]?.id;
    if (ticketId) {
      await pool.query(
        `INSERT INTO support_messages (ticket_id, author_type, author_id, body, is_internal)
         VALUES ($1, 'agent', NULL, $2, TRUE)`,
        [ticketId, body],
      );
    }
    return { success: true };
  } catch {
    return { success: false };
  }
}
