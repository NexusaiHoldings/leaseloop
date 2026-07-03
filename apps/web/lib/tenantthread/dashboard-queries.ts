/**
 * Dashboard query helpers for the TenantThread operations dashboard.
 *
 * Aggregates data from voice_calls and work_orders to power the manager-facing
 * real-time dashboard: summary KPIs, open work-order table, conversation panel,
 * and active escalation list.
 */

import { Pool } from 'pg';

let _pool: Pool | null = null;

function getPool(): Pool {
  if (!_pool) {
    _pool = new Pool({ connectionString: process.env.DATABASE_URL });
  }
  return _pool;
}

// ── Types ─────────────────────────────────────────────────────────────────────

export type SlaStatus = 'green' | 'amber' | 'red';

export interface DashboardSummary {
  totalOpenTickets: number;
  deflectionRate: number;
  avgResponseTimeMinutes: number;
  activeEscalations: number;
}

export interface WorkOrderRow {
  id: string;
  work_order_number: string;
  property_name: string | null;
  unit_number: string | null;
  priority: string;
  status: string;
  pms_sync_status: string | null;
  created_at: Date;
  sla_status: SlaStatus;
  hours_open: number;
}

export interface ConversationRow {
  id: string;
  from_number: string;
  property_name: string | null;
  unit_number: string | null;
  issue_description: string | null;
  stage: string;
  urgency: string;
  created_at: Date;
}

export interface EscalationRow {
  id: string;
  from_number: string;
  property_name: string | null;
  unit_number: string | null;
  issue_description: string | null;
  urgency: string;
  created_at: Date;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function computeSlaStatus(createdAt: Date): { status: SlaStatus; hoursOpen: number } {
  const hoursOpen = (Date.now() - new Date(createdAt).getTime()) / 3_600_000;
  const status: SlaStatus = hoursOpen < 2 ? 'green' : hoursOpen < 8 ? 'amber' : 'red';
  return { status, hoursOpen };
}

// ── Query functions ───────────────────────────────────────────────────────────

export async function getDashboardSummary(): Promise<DashboardSummary> {
  const pool = getPool();
  try {
    const openResult = await pool.query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM work_orders WHERE status NOT IN ('completed', 'cancelled')`,
    );
    const totalOpenTickets = parseInt(openResult.rows[0]?.count ?? '0', 10);

    const deflectionResult = await pool.query<{ total: string; deflected: string }>(
      `SELECT COUNT(*) AS total,
              COUNT(*) FILTER (WHERE stage = 'completed') AS deflected
       FROM voice_calls
       WHERE created_at > NOW() - INTERVAL '7 days'`,
    );
    const total = parseInt(deflectionResult.rows[0]?.total ?? '0', 10);
    const deflected = parseInt(deflectionResult.rows[0]?.deflected ?? '0', 10);
    const deflectionRate = total > 0 ? Math.round((deflected / total) * 100) : 0;

    const responseResult = await pool.query<{ avg_minutes: string | null }>(
      `SELECT ROUND(AVG(EXTRACT(EPOCH FROM (wo.created_at - vc.created_at)) / 60), 1)::text AS avg_minutes
       FROM voice_calls vc
       JOIN work_orders wo ON wo.call_sid = vc.call_sid
       WHERE vc.created_at > NOW() - INTERVAL '7 days'`,
    );
    const avgResponseTimeMinutes =
      parseFloat(responseResult.rows[0]?.avg_minutes ?? '0') || 0;

    const escalationResult = await pool.query<{ count: string }>(
      `SELECT COUNT(*) AS count
       FROM voice_calls vc
       JOIN work_orders wo ON wo.call_sid = vc.call_sid
       WHERE wo.priority IN ('emergency', 'urgent')
         AND wo.status NOT IN ('completed', 'cancelled')
         AND vc.created_at > NOW() - INTERVAL '24 hours'`,
    );
    const activeEscalations = parseInt(escalationResult.rows[0]?.count ?? '0', 10);

    return { totalOpenTickets, deflectionRate, avgResponseTimeMinutes, activeEscalations };
  } catch (err) {
    console.error('[dashboard-queries] getDashboardSummary error:', err);
    return { totalOpenTickets: 0, deflectionRate: 0, avgResponseTimeMinutes: 0, activeEscalations: 0 };
  }
}

export async function getOpenWorkOrders(): Promise<WorkOrderRow[]> {
  const pool = getPool();
  try {
    const result = await pool.query<{
      id: string;
      work_order_number: string;
      property_name: string | null;
      unit_number: string | null;
      priority: string;
      status: string;
      pms_sync_status: string | null;
      created_at: Date;
    }>(
      `SELECT wo.id, wo.work_order_number,
              COALESCE(vc.property_name, p.name) AS property_name,
              wo.unit_number,
              wo.priority, wo.status,
              p.pms_sync_status,
              wo.created_at
       FROM work_orders wo
       LEFT JOIN voice_calls vc ON vc.call_sid = wo.call_sid
       LEFT JOIN properties p ON p.id = vc.property_id
       WHERE wo.status NOT IN ('completed', 'cancelled')
       ORDER BY
         CASE wo.priority
           WHEN 'emergency' THEN 1
           WHEN 'urgent'    THEN 2
           WHEN 'routine'   THEN 3
           ELSE 4
         END,
         wo.created_at ASC
       LIMIT 100`,
    );

    return result.rows.map((row) => {
      const { status, hoursOpen } = computeSlaStatus(row.created_at);
      return {
        id: row.id,
        work_order_number: row.work_order_number,
        property_name: row.property_name,
        unit_number: row.unit_number,
        priority: row.priority ?? 'routine',
        status: row.status,
        pms_sync_status: row.pms_sync_status,
        created_at: row.created_at,
        sla_status: status,
        hours_open: Math.round(hoursOpen * 10) / 10,
      };
    });
  } catch (err) {
    console.error('[dashboard-queries] getOpenWorkOrders error:', err);
    return [];
  }
}

export async function getActiveConversations(): Promise<ConversationRow[]> {
  const pool = getPool();
  try {
    const result = await pool.query<{
      id: string;
      from_number: string;
      property_name: string | null;
      unit_number: string | null;
      issue_description: string | null;
      stage: string;
      urgency_raw: string | null;
      created_at: Date;
    }>(
      `SELECT vc.id, vc.from_number, vc.property_name, vc.unit_number,
              vc.issue_description, vc.stage, vc.created_at,
              wo.priority AS urgency_raw
       FROM voice_calls vc
       LEFT JOIN work_orders wo ON wo.call_sid = vc.call_sid
       ORDER BY vc.created_at DESC
       LIMIT 50`,
    );

    return result.rows.map((row) => ({
      id: row.id,
      from_number: row.from_number,
      property_name: row.property_name,
      unit_number: row.unit_number,
      issue_description: row.issue_description,
      stage: row.stage,
      urgency: row.urgency_raw ?? 'routine',
      created_at: row.created_at,
    }));
  } catch (err) {
    console.error('[dashboard-queries] getActiveConversations error:', err);
    return [];
  }
}

export async function getActiveEscalations(): Promise<EscalationRow[]> {
  const pool = getPool();
  try {
    const result = await pool.query<{
      id: string;
      from_number: string;
      property_name: string | null;
      unit_number: string | null;
      issue_description: string | null;
      urgency_raw: string | null;
      created_at: Date;
    }>(
      `SELECT vc.id, vc.from_number, vc.property_name, vc.unit_number,
              vc.issue_description, vc.created_at,
              wo.priority AS urgency_raw
       FROM voice_calls vc
       JOIN work_orders wo ON wo.call_sid = vc.call_sid
       WHERE wo.priority IN ('emergency', 'urgent')
         AND wo.status NOT IN ('completed', 'cancelled')
         AND vc.created_at > NOW() - INTERVAL '24 hours'
       ORDER BY
         CASE wo.priority WHEN 'emergency' THEN 1 ELSE 2 END,
         vc.created_at DESC
       LIMIT 20`,
    );

    return result.rows.map((row) => ({
      id: row.id,
      from_number: row.from_number,
      property_name: row.property_name,
      unit_number: row.unit_number,
      issue_description: row.issue_description,
      urgency: row.urgency_raw ?? 'urgent',
      created_at: row.created_at,
    }));
  } catch (err) {
    console.error('[dashboard-queries] getActiveEscalations error:', err);
    return [];
  }
}
