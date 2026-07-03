/**
 * Voice agent state machine and TwiML builder for inbound maintenance calls.
 *
 * Each inbound Twilio call progresses through stages stored in the
 * voice_calls table:
 *   greeting → gather_unit → gather_issue → completed | failed
 *
 * TwiML helpers produce XML strings that Twilio interprets to drive the call.
 */

import { Pool } from 'pg';
import type { EscalationDecision } from './escalation-rules';

export type CallStage =
  | 'greeting'
  | 'gather_unit'
  | 'gather_issue'
  | 'completed'
  | 'failed';

export interface VoiceCallRecord {
  id: string;
  call_sid: string;
  from_number: string;
  to_number: string;
  property_id: string | null;
  property_name: string | null;
  unit_number: string | null;
  issue_description: string | null;
  stage: CallStage;
  work_order_id: string | null;
  created_at: Date;
  updated_at: Date;
}

let _pool: Pool | null = null;

function getPool(): Pool {
  if (!_pool) {
    _pool = new Pool({ connectionString: process.env.DATABASE_URL });
  }
  return _pool;
}

// ── DB helpers ────────────────────────────────────────────────────────────────

/**
 * Retrieves an existing voice call record by CallSid. Returns null when not
 * found or when the voice_calls table does not yet exist.
 */
export async function getCallRecord(callSid: string): Promise<VoiceCallRecord | null> {
  const pool = getPool();
  try {
    const result = await pool.query<VoiceCallRecord>(
      'SELECT * FROM voice_calls WHERE call_sid = $1 LIMIT 1',
      [callSid],
    );
    return result.rows[0] ?? null;
  } catch {
    return null;
  }
}

/**
 * Creates a new voice_calls row for an inbound call.
 * Falls back to an in-memory record when the table is absent.
 */
export async function createCallRecord(
  callSid: string,
  fromNumber: string,
  toNumber: string,
  propertyId: string | null,
  propertyName: string | null,
): Promise<VoiceCallRecord> {
  const pool = getPool();
  const now = new Date();
  try {
    const result = await pool.query<VoiceCallRecord>(
      `INSERT INTO voice_calls
         (call_sid, from_number, to_number, property_id, property_name, stage)
       VALUES ($1, $2, $3, $4, $5, 'greeting')
       ON CONFLICT (call_sid) DO UPDATE
         SET updated_at = now()
       RETURNING *`,
      [callSid, fromNumber, toNumber, propertyId, propertyName],
    );
    return result.rows[0];
  } catch {
    return {
      id: `mem-${callSid}`,
      call_sid: callSid,
      from_number: fromNumber,
      to_number: toNumber,
      property_id: propertyId,
      property_name: propertyName,
      unit_number: null,
      issue_description: null,
      stage: 'greeting',
      work_order_id: null,
      created_at: now,
      updated_at: now,
    };
  }
}

/**
 * Updates mutable fields on a voice call record.
 */
export async function updateCallRecord(
  callSid: string,
  updates: Partial<Pick<VoiceCallRecord, 'unit_number' | 'issue_description' | 'stage' | 'work_order_id'>>,
): Promise<void> {
  const pool = getPool();
  const clauses: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  if (updates.unit_number !== undefined) {
    clauses.push(`unit_number = $${idx++}`);
    values.push(updates.unit_number);
  }
  if (updates.issue_description !== undefined) {
    clauses.push(`issue_description = $${idx++}`);
    values.push(updates.issue_description);
  }
  if (updates.stage !== undefined) {
    clauses.push(`stage = $${idx++}`);
    values.push(updates.stage);
  }
  if (updates.work_order_id !== undefined) {
    clauses.push(`work_order_id = $${idx++}`);
    values.push(updates.work_order_id);
  }

  if (clauses.length === 0) return;
  clauses.push('updated_at = now()');
  values.push(callSid);

  try {
    await pool.query(
      `UPDATE voice_calls SET ${clauses.join(', ')} WHERE call_sid = $${idx}`,
      values,
    );
  } catch {
    // Best-effort — voice call continues even if state update fails
  }
}

/**
 * Looks up the property associated with a Twilio "To" phone number.
 * Returns null if no match (open/welcome flow still proceeds).
 */
export async function lookupPropertyByPhone(
  toNumber: string,
): Promise<{ id: string; name: string } | null> {
  const pool = getPool();
  try {
    const result = await pool.query<{ id: string; name: string }>(
      `SELECT id, name FROM properties WHERE maintenance_phone = $1 LIMIT 1`,
      [toNumber],
    );
    return result.rows[0] ?? null;
  } catch {
    return null;
  }
}

// ── TwiML builders ────────────────────────────────────────────────────────────

function xmlEscape(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Wraps content in a TwiML Response envelope.
 */
export function wrapTwiML(content: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?><Response>${content}</Response>`;
}

/**
 * TwiML for the initial greeting. Uses <Gather> with speech input to capture
 * the caller's unit number in one step.
 */
export function buildGreetingTwiML(propertyName: string | null, actionUrl: string): string {
  const property = propertyName ? xmlEscape(propertyName) : 'the property';
  const speech = `Welcome to ${property} maintenance line. Please say your unit number after the tone.`;
  const gather = `<Gather input="speech dtmf" action="${xmlEscape(actionUrl)}" speechTimeout="auto" timeout="8" finishOnKey="#"><Say voice="alice">${speech}</Say></Gather>`;
  const fallback = `<Say voice="alice">I'm sorry, I didn't receive a response. Please call back or press pound to repeat.</Say><Redirect>${xmlEscape(actionUrl)}?retry=1</Redirect>`;
  return wrapTwiML(gather + fallback);
}

/**
 * TwiML that asks the caller to describe their maintenance issue.
 */
export function buildGatherIssueTwiML(unitNumber: string, actionUrl: string): string {
  const unit = xmlEscape(unitNumber);
  const speech = `Thank you. You said unit ${unit}. Please describe your maintenance issue after the tone and press pound when done.`;
  const gather = `<Gather input="speech" action="${xmlEscape(actionUrl)}" speechTimeout="auto" timeout="10" finishOnKey="#"><Say voice="alice">${speech}</Say></Gather>`;
  const fallback = `<Say voice="alice">I didn't catch that. Goodbye.</Say><Hangup/>`;
  return wrapTwiML(gather + fallback);
}

/**
 * TwiML for the call completion — reads back the escalation decision and
 * work order number to the caller.
 */
export function buildCompletionTwiML(
  decision: EscalationDecision,
  workOrderNumber: string,
): string {
  const msg = xmlEscape(decision.responseMessage);
  const woNum = xmlEscape(workOrderNumber);
  const speech =
    `${msg} Your work order number is ${woNum.split('').join(' ')}. Thank you for calling. Goodbye.`;
  return wrapTwiML(`<Say voice="alice">${speech}</Say><Hangup/>`);
}

/**
 * TwiML for an unrecoverable error condition.
 */
export function buildErrorTwiML(): string {
  return wrapTwiML(
    `<Say voice="alice">I'm sorry, I encountered a technical issue. Please call back and our team will assist you. Goodbye.</Say><Hangup/>`,
  );
}

/**
 * TwiML for a "no input received" retry prompt.
 */
export function buildRetryTwiML(actionUrl: string): string {
  const gather = `<Gather input="speech dtmf" action="${xmlEscape(actionUrl)}" speechTimeout="auto" timeout="8" finishOnKey="#"><Say voice="alice">I'm sorry, I didn't catch that. Please try again.</Say></Gather>`;
  return wrapTwiML(gather + `<Hangup/>`);
}
