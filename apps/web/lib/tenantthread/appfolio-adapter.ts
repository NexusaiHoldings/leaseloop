// AppFolio adapter utilities.
// Wraps the base AppFolioAdapter with DB-backed config loading and structured health reporting.

import { Pool } from 'pg';
import { AppFolioAdapter, type PMSConfig, type HealthCheckResult } from './pms-adapter';

let _pool: Pool | null = null;
function getPool(): Pool {
  if (!_pool) _pool = new Pool({ connectionString: process.env.DATABASE_URL });
  return _pool;
}

export type AppFolioConfig = {
  id: string;
  baseUrl: string;
  clientId: string;
  clientSecret: string;
  environment: string;
};

// Load the active AppFolio configuration from the database.
export async function loadAppFolioConfig(): Promise<AppFolioConfig | null> {
  const pool = getPool();
  const result = await pool.query<{
    id: string;
    base_url: string | null;
    client_id: string | null;
    client_secret: string | null;
    environment: string | null;
  }>(
    `SELECT id, base_url, client_id, client_secret, environment
     FROM pms_configurations
     WHERE pms_type = 'appfolio' AND is_active = true
     ORDER BY updated_at DESC
     LIMIT 1`
  );
  const row = result.rows[0];
  if (!row || !row.base_url || !row.client_id || !row.client_secret) return null;
  return {
    id: row.id,
    baseUrl: row.base_url,
    clientId: row.client_id,
    clientSecret: row.client_secret,
    environment: row.environment ?? 'production',
  };
}

// Persist or update an AppFolio configuration, deactivating any prior active config.
export async function saveAppFolioConfig(data: {
  baseUrl: string;
  clientId: string;
  clientSecret: string;
  environment?: string;
}): Promise<string> {
  const pool = getPool();
  await pool.query(
    `UPDATE pms_configurations SET is_active = false WHERE pms_type = 'appfolio' AND is_active = true`
  );
  const result = await pool.query<{ id: string }>(
    `INSERT INTO pms_configurations
       (pms_type, base_url, client_id, client_secret, environment, is_active)
     VALUES ('appfolio', $1, $2, $3, $4, true)
     RETURNING id`,
    [data.baseUrl, data.clientId, data.clientSecret, data.environment ?? 'production']
  );
  return result.rows[0].id;
}

// Run a structured health check against AppFolio using the supplied credentials.
export async function appfolioHealthCheck(config: PMSConfig): Promise<HealthCheckResult> {
  const adapter = new AppFolioAdapter(config);
  return adapter.healthCheck();
}

// Build a PMSConfig object from raw form/env values for AppFolio.
export function buildAppFolioConfig(fields: {
  baseUrl?: string | null;
  clientId?: string | null;
  clientSecret?: string | null;
}): PMSConfig {
  return {
    baseUrl: fields.baseUrl ?? undefined,
    clientId: fields.clientId ?? undefined,
    clientSecret: fields.clientSecret ?? undefined,
  };
}
