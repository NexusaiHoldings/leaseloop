/**
 * Tenantthread access predicates — per-unit volume discount enforcement.
 *
 * The 500-unit floor triggers the Portfolio pricing tier ($11/unit vs $15/unit
 * Growth tier). Predicates here are consumed by the billing metering cron and
 * the billing portal summary view.
 */

import { Pool } from 'pg';

// ── Constants ────────────────────────────────────────────────────────────────

export const VOLUME_DISCOUNT_THRESHOLD = 500; // units — Portfolio tier floor
export const PRODUCTION_TIER_THRESHOLD = 100; // units — pilot → production cutover

// Per-unit monthly pricing aligned with ceo_briefing.icp.deal_size_monthly_usd
const PRICE_REGIONAL = 8;    // 1 000+ units
const PRICE_PORTFOLIO = 11;  // 500–999 units (volume discount)
const PRICE_GROWTH = 15;     // 1–499 units

// ── Types ────────────────────────────────────────────────────────────────────

export type TierStatus = 'pilot' | 'production';

export type PricingTier = 'growth' | 'portfolio' | 'regional';

export interface PropertyUsage {
  propertyId: string;
  propertyName: string;
  unitCount: number;
}

export interface OrgAccessInfo {
  orgId: string;
  unitCount: number;
  tierStatus: TierStatus;
  pricingTier: PricingTier;
  pricePerUnit: number;
  hasVolumeDiscount: boolean;
  monthlyEstimateUsd: number;
  propertyBreakdown: PropertyUsage[];
}

// ── Helpers ──────────────────────────────────────────────────────────────────

export function getPricePerUnit(unitCount: number): number {
  if (unitCount >= 1000) return PRICE_REGIONAL;
  if (unitCount >= VOLUME_DISCOUNT_THRESHOLD) return PRICE_PORTFOLIO;
  return PRICE_GROWTH;
}

export function getPricingTier(unitCount: number): PricingTier {
  if (unitCount >= 1000) return 'regional';
  if (unitCount >= VOLUME_DISCOUNT_THRESHOLD) return 'portfolio';
  return 'growth';
}

export function getTierStatus(unitCount: number): TierStatus {
  return unitCount >= PRODUCTION_TIER_THRESHOLD ? 'production' : 'pilot';
}

// ── Queries ──────────────────────────────────────────────────────────────────

export async function getOrgUnitCount(
  orgId: string,
  pool: Pool,
): Promise<number> {
  const result = await pool.query<{ total: string }>(
    `SELECT COUNT(u.id)::text AS total
     FROM units u
     JOIN properties p ON p.id = u.property_id
     WHERE p.org_id = $1`,
    [orgId],
  );
  return parseInt(result.rows[0]?.total ?? '0', 10);
}

export async function getUnitCountByProperty(
  orgId: string,
  pool: Pool,
): Promise<PropertyUsage[]> {
  const result = await pool.query<{
    property_id: string;
    property_name: string;
    unit_count: string;
  }>(
    `SELECT p.id AS property_id, p.name AS property_name,
            COUNT(u.id)::text AS unit_count
     FROM properties p
     LEFT JOIN units u ON u.property_id = p.id
     WHERE p.org_id = $1
     GROUP BY p.id, p.name
     ORDER BY p.name`,
    [orgId],
  );
  return result.rows.map((r) => ({
    propertyId: r.property_id,
    propertyName: r.property_name,
    unitCount: parseInt(r.unit_count, 10),
  }));
}

/**
 * Returns true when the org meets the 500-unit volume discount floor and
 * therefore qualifies for Portfolio pricing ($11/unit vs $15/unit Growth).
 */
export async function meetsVolumeDiscountThreshold(
  orgId: string,
  pool: Pool,
): Promise<boolean> {
  const count = await getOrgUnitCount(orgId, pool);
  return count >= VOLUME_DISCOUNT_THRESHOLD;
}

/**
 * Full access-info bundle used by the billing portal summary view.
 * Includes per-property breakdown, current tier, and monthly cost estimate.
 */
export async function getOrgAccessInfo(
  orgId: string,
  pool: Pool,
): Promise<OrgAccessInfo> {
  const [unitCount, propertyBreakdown] = await Promise.all([
    getOrgUnitCount(orgId, pool),
    getUnitCountByProperty(orgId, pool),
  ]);

  const pricePerUnit = getPricePerUnit(unitCount);
  const pricingTier = getPricingTier(unitCount);
  const tierStatus = getTierStatus(unitCount);
  const hasVolumeDiscount = unitCount >= VOLUME_DISCOUNT_THRESHOLD;
  const monthlyEstimateUsd = unitCount * pricePerUnit;

  return {
    orgId,
    unitCount,
    tierStatus,
    pricingTier,
    pricePerUnit,
    hasVolumeDiscount,
    monthlyEstimateUsd,
    propertyBreakdown,
  };
}
