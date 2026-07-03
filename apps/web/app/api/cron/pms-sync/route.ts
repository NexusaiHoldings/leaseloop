// PMS sync cron handler — runs every 15 minutes via Vercel Cron.
// Pulls unit and tenant updates from the configured PMS (Yardi / AppFolio)
// and upserts the result into the units table.

import { NextRequest, NextResponse } from 'next/server';
import { Pool } from 'pg';
import { createPMSAdapter } from '@/lib/tenantthread/pms-adapter';

export const dynamic = 'force-dynamic';

type PMSConfigRow = {
  id: string;
  pms_type: string;
  api_key: string | null;
  base_url: string | null;
  client_id: string | null;
  client_secret: string | null;
  username: string | null;
  password: string | null;
  environment: string | null;
};

type PropertyRow = {
  id: string;
  name: string;
  pms_type: string;
};

export async function GET(req: NextRequest): Promise<NextResponse> {
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const syncedAt = new Date();
  const results: Array<{ propertyId: string; pmsType: string; unitsImported: number; error?: string }> = [];

  try {
    // Fetch the active PMS configuration.
    const configResult = await pool.query<PMSConfigRow>(
      `SELECT id, pms_type, api_key, base_url, client_id, client_secret, username, password, environment
       FROM pms_configurations
       WHERE is_active = true
       ORDER BY updated_at DESC
       LIMIT 1`
    );

    const pmsConfig = configResult.rows[0];
    if (!pmsConfig || pmsConfig.pms_type === 'manual') {
      return NextResponse.json({
        ok: true,
        message: 'No active PMS configuration — skipping sync',
        syncedAt,
        properties: 0,
      });
    }

    const adapterConfig = {
      apiKey: pmsConfig.api_key ?? undefined,
      baseUrl: pmsConfig.base_url ?? undefined,
      clientId: pmsConfig.client_id ?? undefined,
      clientSecret: pmsConfig.client_secret ?? undefined,
      username: pmsConfig.username ?? undefined,
      password: pmsConfig.password ?? undefined,
    };

    // Fetch all properties that use this PMS type.
    const propertiesResult = await pool.query<PropertyRow>(
      `SELECT id, name, pms_type FROM properties WHERE pms_type = $1 ORDER BY created_at`,
      [pmsConfig.pms_type]
    );

    for (const property of propertiesResult.rows) {
      const adapter = createPMSAdapter(property.pms_type, adapterConfig);
      let unitsImported = 0;
      let syncSuccess = false;
      let syncError: string | undefined;

      try {
        const units = await adapter.fetchUnits(property.id);
        unitsImported = units.length;

        for (const unit of units) {
          await pool.query(
            `INSERT INTO units
               (property_id, unit_number, floor_plan, tenant_name, tenant_email, lease_start, lease_end, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6::date, $7::date, now())
             ON CONFLICT (property_id, unit_number) DO UPDATE SET
               floor_plan   = EXCLUDED.floor_plan,
               tenant_name  = EXCLUDED.tenant_name,
               tenant_email = EXCLUDED.tenant_email,
               lease_start  = EXCLUDED.lease_start,
               lease_end    = EXCLUDED.lease_end,
               updated_at   = now()`,
            [
              property.id,
              unit.unitNumber,
              unit.floorPlan,
              unit.tenantName,
              unit.tenantEmail,
              unit.leaseStart,
              unit.leaseEnd,
            ]
          );
        }

        await pool.query(
          `UPDATE properties
           SET pms_sync_status = 'synced', pms_last_synced_at = now(), updated_at = now()
           WHERE id = $1`,
          [property.id]
        );

        syncSuccess = true;
      } catch (err) {
        syncError = err instanceof Error ? err.message : 'Sync failed';
        await pool.query(
          `UPDATE properties
           SET pms_sync_status = 'error', updated_at = now()
           WHERE id = $1`,
          [property.id]
        );
      }

      await pool.query(
        `INSERT INTO pms_sync_log (pms_type, synced_at, units_imported, success, error_message)
         VALUES ($1, $2, $3, $4, $5)`,
        [pmsConfig.pms_type, syncedAt, unitsImported, syncSuccess, syncError ?? null]
      );

      results.push({
        propertyId: property.id,
        pmsType: pmsConfig.pms_type,
        unitsImported,
        error: syncError,
      });
    }

    return NextResponse.json({
      ok: true,
      syncedAt,
      properties: results.length,
      results,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    // Log a failed sync attempt so the status panel reflects the error.
    try {
      await pool.query(
        `INSERT INTO pms_sync_log (pms_type, synced_at, units_imported, success, error_message)
         VALUES ('unknown', $1, 0, false, $2)`,
        [syncedAt, message]
      );
    } catch {
      // Best-effort log — do not mask the original error.
    }
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  } finally {
    await pool.end();
  }
}
