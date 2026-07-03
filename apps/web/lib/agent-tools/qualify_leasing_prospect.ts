/**
 * Agent tool: qualify_leasing_prospect
 *
 * Scores a prospective tenant based on gathered qualification signals
 * (contact info, move-in timeline, budget, unit type preference, engagement).
 * Also provides upsertLead / updateLeadInfo helpers used by the chat agent.
 *
 * Expected args (when called as agent tool):
 *   lead_id — UUID of the tt_leasing_leads row to score (string)
 */

import type { HandlerContext, HandlerResult } from '@nexus/identity-and-access';
import { Pool } from 'pg';

let _pool: Pool | null = null;

function getPool(): Pool {
  if (!_pool) {
    _pool = new Pool({ connectionString: process.env.DATABASE_URL });
  }
  return _pool;
}

export interface QualificationFactor {
  name: string;
  weight: number;
  passed: boolean;
  details: string;
}

export interface ProspectQualification {
  score: number;
  factors: QualificationFactor[];
  summary: string;
  recommended_action: 'schedule_tour' | 'needs_more_info' | 'not_qualified';
}

interface LeadRow {
  id: string;
  phone_number: string | null;
  email: string | null;
  full_name: string | null;
  desired_move_in: Date | null;
  desired_unit_type: string | null;
  budget_min: number | null;
  budget_max: number | null;
  conversation_summary: string | null;
}

export async function qualifyProspect(leadId: string): Promise<ProspectQualification> {
  const pool = getPool();
  const result = await pool.query<LeadRow>(
    `SELECT id, phone_number, email, full_name, desired_move_in, desired_unit_type,
            budget_min, budget_max, conversation_summary
     FROM tt_leasing_leads WHERE id = $1`,
    [leadId],
  );
  const lead = result.rows[0];
  if (!lead) {
    return {
      score: 0,
      factors: [],
      summary: 'Lead record not found.',
      recommended_action: 'needs_more_info',
    };
  }

  const factors: QualificationFactor[] = [];

  const hasContact = Boolean(lead.email || lead.phone_number);
  factors.push({
    name: 'Contact information',
    weight: 20,
    passed: hasContact,
    details: hasContact
      ? `Contact provided: ${lead.email ?? lead.phone_number}`
      : 'No contact information collected yet',
  });

  const hasName = Boolean(lead.full_name?.trim());
  factors.push({
    name: 'Name provided',
    weight: 10,
    passed: hasName,
    details: hasName ? `Name: ${lead.full_name}` : 'No name provided yet',
  });

  let moveInRealistic = false;
  if (lead.desired_move_in) {
    const daysOut =
      (new Date(lead.desired_move_in).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
    moveInRealistic = daysOut >= 7 && daysOut <= 365;
  }
  factors.push({
    name: 'Move-in timeline',
    weight: 20,
    passed: moveInRealistic,
    details: lead.desired_move_in
      ? `Desired: ${new Date(lead.desired_move_in).toISOString().split('T')[0]} (${moveInRealistic ? 'realistic' : 'outside 7–365 day window'})`
      : 'No move-in date provided',
  });

  const hasBudget = lead.budget_max !== null && lead.budget_max > 0;
  factors.push({
    name: 'Budget range',
    weight: 25,
    passed: hasBudget,
    details: hasBudget
      ? `$${lead.budget_min ?? 0}–$${lead.budget_max}/mo`
      : 'No budget information provided',
  });

  const hasUnitType = Boolean(lead.desired_unit_type?.trim());
  factors.push({
    name: 'Unit type preference',
    weight: 15,
    passed: hasUnitType,
    details: hasUnitType
      ? `Prefers: ${lead.desired_unit_type}`
      : 'No unit type preference stated',
  });

  const hasEngagement = Boolean(
    lead.conversation_summary && lead.conversation_summary.length > 50,
  );
  factors.push({
    name: 'Conversation engagement',
    weight: 10,
    passed: hasEngagement,
    details: hasEngagement
      ? 'Prospect has engaged in qualifying conversation'
      : 'Limited conversation history',
  });

  const score = factors.reduce((acc, f) => acc + (f.passed ? f.weight : 0), 0);

  let recommended_action: ProspectQualification['recommended_action'];
  if (score >= 65) {
    recommended_action = 'schedule_tour';
  } else {
    recommended_action = 'needs_more_info';
  }

  const passed = factors.filter(f => f.passed).map(f => f.name);
  const failed = factors.filter(f => !f.passed).map(f => f.name);
  const summary =
    `Qualification score: ${score}/100. ` +
    (passed.length ? `Provided: ${passed.join(', ')}. ` : '') +
    (failed.length ? `Still needed: ${failed.join(', ')}.` : '');

  await pool.query(
    `UPDATE tt_leasing_leads SET qualification_score = $1, updated_at = now() WHERE id = $2`,
    [score, leadId],
  );

  return { score, factors, summary, recommended_action };
}

export async function upsertLead(params: {
  phoneNumber?: string;
  email?: string;
  fullName?: string;
  propertyId?: string;
  channel: 'sms' | 'web';
}): Promise<string> {
  const pool = getPool();

  if (params.phoneNumber) {
    const existing = await pool.query<{ id: string }>(
      'SELECT id FROM tt_leasing_leads WHERE phone_number = $1 LIMIT 1',
      [params.phoneNumber],
    );
    if (existing.rows[0]) return existing.rows[0].id;
  }
  if (params.email) {
    const existing = await pool.query<{ id: string }>(
      'SELECT id FROM tt_leasing_leads WHERE email = $1 LIMIT 1',
      [params.email],
    );
    if (existing.rows[0]) return existing.rows[0].id;
  }

  const result = await pool.query<{ id: string }>(
    `INSERT INTO tt_leasing_leads (phone_number, email, full_name, property_id, channel)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [
      params.phoneNumber ?? null,
      params.email ?? null,
      params.fullName ?? null,
      params.propertyId ?? null,
      params.channel,
    ],
  );
  return result.rows[0].id;
}

export async function updateLeadInfo(
  leadId: string,
  updates: Partial<{
    email: string;
    full_name: string;
    desired_move_in: string;
    desired_unit_type: string;
    budget_min: number;
    budget_max: number;
    conversation_summary: string;
  }>,
): Promise<void> {
  const pool = getPool();
  const setClauses: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  for (const [key, val] of Object.entries(updates)) {
    if (val !== undefined) {
      setClauses.push(`${key} = $${idx++}`);
      values.push(val);
    }
  }
  if (setClauses.length === 0) return;
  setClauses.push('updated_at = now()');
  values.push(leadId);

  await pool.query(
    `UPDATE tt_leasing_leads SET ${setClauses.join(', ')} WHERE id = $${idx}`,
    values,
  );
}

export async function handleQualifyLeasingProspect(
  _ctx: HandlerContext,
  args: Record<string, unknown>,
): Promise<HandlerResult> {
  const leadId = typeof args.lead_id === 'string' ? args.lead_id.trim() : '';
  if (!leadId) {
    return { status: 400, body: 'lead_id is required' };
  }

  try {
    const qualification = await qualifyProspect(leadId);
    return {
      status: 200,
      body: {
        lead_id: leadId,
        score: qualification.score,
        recommended_action: qualification.recommended_action,
        summary: qualification.summary,
        factors: qualification.factors,
      },
    };
  } catch (err) {
    return {
      status: 500,
      body: `Qualification failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
