/**
 * Unit-usage rollup cron — runs nightly via Vercel Cron.
 *
 * Counts active units per property-management org, records the daily
 * snapshot in billing_usage_events (meter: "active_units") for Stripe
 * per-unit billing at $8–$15/unit/month, and emits analytics events via
 * analytics_events for the operator dashboard.
 */

import { NextRequest, NextResponse } from 'next/server';
import { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import {
  getPricePerUnit,
  getTierStatus,
  type PropertyUsage,
} from '@/lib/tenantthread/access';

export const dynamic = 'force-dynamic';

// ── Row types ────────────────────────────────────────────────────────────────

type OrgUnitRow = {
  org_id: string;
  total_units: string;
};

type PropertyBreakdownRow = {
  org_id: string;
  property_id: string;
  property_name: string;
  unit_count: string;
};

type SubscriptionRow = {
  subscription_id: string;
  user_id: string;
  tier_name: string;
  current_period_start: string;
  current_period_end: string;
};

// ── Handler ──────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest): Promise<NextResponse> {
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const rolledUpAt = new Date();
  const today = rolledUpAt.toISOString().slice(0, 10); // YYYY-MM-DD

  try {
    // 1. Aggregate unit counts per org across all properties.
    const orgUnitsResult = await pool.query<OrgUnitRow>(
      `SELECT p.org_id, COUNT(u.id)::text AS total_units
       FROM properties p
       LEFT JOIN units u ON u.property_id = p.id
       WHERE p.org_id IS NOT NULL
       GROUP BY p.org_id
       HAVING COUNT(u.id) > 0`,
    );

    // 2. Property-level breakdown (re-used for billing metadata + portal view).
    const breakdownResult = await pool.query<PropertyBreakdownRow>(
      `SELECT p.org_id, p.id AS property_id, p.name AS property_name,
              COUNT(u.id)::text AS unit_count
       FROM properties p
       LEFT JOIN units u ON u.property_id = p.id
       WHERE p.org_id IS NOT NULL
       GROUP BY p.org_id, p.id, p.name
       ORDER BY p.org_id, p.name`,
    );

    // Index breakdown by org for O(1) lookup.
    const breakdownByOrg = new Map<string, PropertyUsage[]>();
    for (const row of breakdownResult.rows) {
      const list = breakdownByOrg.get(row.org_id) ?? [];
      list.push({
        propertyId: row.property_id,
        propertyName: row.property_name,
        unitCount: parseInt(row.unit_count, 10),
      });
      breakdownByOrg.set(row.org_id, list);
    }

    const results: Array<{
      orgId: string;
      totalUnits: number;
      tierStatus: string;
      pricingTier: string;
      pricePerUnit: number;
      monthlyEstimateUsd: number;
      hasSubscription: boolean;
      propertyCount: number;
      usageEventRecorded: boolean;
    }> = [];

    for (const orgRow of orgUnitsResult.rows) {
      const orgId = orgRow.org_id;
      const totalUnits = parseInt(orgRow.total_units, 10);
      const pricePerUnit = getPricePerUnit(totalUnits);
      const tierStatus = getTierStatus(totalUnits);
      const monthlyEstimateUsd = totalUnits * pricePerUnit;
      const pricingTier =
        totalUnits >= 1000 ? 'regional' : totalUnits >= 500 ? 'portfolio' : 'growth';
      const propertyBreakdown = breakdownByOrg.get(orgId) ?? [];
      let usageEventRecorded = false;

      // 3. Resolve active subscription for this org (owner or admin).
      const subResult = await pool.query<SubscriptionRow>(
        `SELECT s.id AS subscription_id, c.user_id, s.tier_name,
                s.current_period_start, s.current_period_end
         FROM billing_subscriptions s
         JOIN billing_customers c ON c.id = s.customer_id
         WHERE c.user_id IN (
           SELECT om.user_id
           FROM org_members om
           WHERE om.org_id = $1::uuid
             AND om.role IN ('owner', 'admin')
         )
           AND s.status IN ('active', 'trialing')
         ORDER BY s.created_at DESC
         LIMIT 1`,
        [orgId],
      );

      if (subResult.rows.length > 0) {
        const sub = subResult.rows[0];
        // Idempotency key is scoped to org + billing-day so nightly reruns are safe.
        const idempotencyKey = `unit-rollup-${orgId}-${today}`;
        const eventId = randomUUID();

        // 4. Upsert idempotent usage event into billing_usage_events.
        await pool.query(
          `INSERT INTO billing_usage_events
             (id, subscription_id, meter_name, quantity, idempotency_key, metadata)
           VALUES ($1::uuid, $2::uuid, 'active_units', $3, $4, $5::jsonb)
           ON CONFLICT (subscription_id, meter_name, idempotency_key) DO NOTHING`,
          [
            eventId,
            sub.subscription_id,
            totalUnits,
            idempotencyKey,
            JSON.stringify({
              org_id: orgId,
              rolled_up_at: rolledUpAt.toISOString(),
              tier_status: tierStatus,
              pricing_tier: pricingTier,
              price_per_unit: pricePerUnit,
              monthly_estimate_usd: monthlyEstimateUsd,
              property_breakdown: propertyBreakdown,
            }),
          ],
        );

        usageEventRecorded = true;
      }

      // 5. Emit analytics event for operator dashboard (fire-and-forget).
      await pool.query(
        `INSERT INTO analytics_events (id, name, user_id, properties, occurred_at)
         VALUES ($1::uuid, 'tenantthread.unit_rollup_completed', NULL, $2::jsonb, now())`,
        [
          randomUUID(),
          JSON.stringify({
            org_id: orgId,
            total_units: totalUnits,
            tier_status: tierStatus,
            pricing_tier: pricingTier,
            price_per_unit: pricePerUnit,
            monthly_estimate_usd: monthlyEstimateUsd,
            has_subscription: subResult.rows.length > 0,
            property_count: propertyBreakdown.length,
          }),
        ],
      );

      results.push({
        orgId,
        totalUnits,
        tierStatus,
        pricingTier,
        pricePerUnit,
        monthlyEstimateUsd,
        hasSubscription: subResult.rows.length > 0,
        propertyCount: propertyBreakdown.length,
        usageEventRecorded,
      });
    }

    return NextResponse.json({
      ok: true,
      rolledUpAt: rolledUpAt.toISOString(),
      orgsProcessed: results.length,
      results,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  } finally {
    await pool.end();
  }
}
