// Yardi Voyager adapter utilities.
// Wraps the base YardiAdapter with DB-backed config loading and structured health reporting.

import { Pool } from 'pg';
import { YardiAdapter, type PMSConfig, type HealthCheckResult } from './pms-adapter';

let _pool: Pool | null = null;
function getPool(): Pool {
  if (!_pool) _pool = new Pool({ connectionString: process.env.DATABASE_URL });
  return _pool;
}

export type YardiConfig = {
  id: string;
  baseUrl: string;
  username: string;
  password: string;
  environment: string;
};

// Load the active Yardi configuration from the database.
export async function loadYardiConfig(): Promise<YardiConfig | null> {
  const pool = getPool();
  const result = await pool.query<{
    id: string;
    base_url: string | null;
    username: string | null;
    password: string | null;
    environment: string | null;
  }>(
    `SELECT id, base_url, username, password, environment
     FROM pms_configurations
     WHERE pms_type = 'yardi' AND is_active = true
     ORDER BY updated_at DESC
     LIMIT 1`
  );
  const row = result.rows[0];
  if (!row || !row.base_url || !row.username || !row.password) return null;
  return {
    id: row.id,
    baseUrl: row.base_url,
    username: row.username,
    password: row.password,
    environment: row.environment ?? 'production',
  };
}

// Persist or update a Yardi configuration, deactivating any prior active config.
export async function saveYardiConfig(data: {
  baseUrl: string;
  username: string;
  password: string;
  environment?: string;
}): Promise<string> {
  const pool = getPool();
  await pool.query(
    `UPDATE pms_configurations SET is_active = false WHERE pms_type = 'yardi' AND is_active = true`
  );
  const result = await pool.query<{ id: string }>(
    `INSERT INTO pms_configurations
       (pms_type, base_url, username, password, environment, is_active)
     VALUES ('yardi', $1, $2, $3, $4, true)
     RETURNING id`,
    [data.baseUrl, data.username, data.password, data.environment ?? 'production']
  );
  return result.rows[0].id;
}

// Run a structured health check against Yardi using the supplied credentials.
export async function yardiHealthCheck(config: PMSConfig): Promise<HealthCheckResult> {
  const adapter = new YardiAdapter(config);
  return adapter.healthCheck();
}

// Build a PMSConfig object from raw form/env values for Yardi.
export function buildYardiConfig(fields: {
  baseUrl?: string | null;
  username?: string | null;
  password?: string | null;
}): PMSConfig {
  return {
    baseUrl: fields.baseUrl ?? undefined,
    username: fields.username ?? undefined,
    password: fields.password ?? undefined,
  };
}
