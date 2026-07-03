import { redirect } from 'next/navigation';
import { Pool } from 'pg';
import { yardiHealthCheck, buildYardiConfig } from '@/lib/tenantthread/yardi-adapter';
import { appfolioHealthCheck, buildAppFolioConfig } from '@/lib/tenantthread/appfolio-adapter';
import { ManualAdapter } from '@/lib/tenantthread/pms-adapter';

export const metadata = { title: 'PMS Integration — TenantThread' };

let _pool: Pool | null = null;
function getPool(): Pool {
  if (!_pool) _pool = new Pool({ connectionString: process.env.DATABASE_URL });
  return _pool;
}

type ActiveConfig = {
  id: string;
  pms_type: string;
  api_key: string | null;
  base_url: string | null;
  client_id: string | null;
  client_secret: string | null;
  username: string | null;
  password: string | null;
  environment: string | null;
  updated_at: Date;
};

type SyncLog = {
  id: string;
  pms_type: string;
  synced_at: Date;
  units_imported: number;
  success: boolean;
  error_message: string | null;
};

async function getActiveConfig(): Promise<ActiveConfig | null> {
  const pool = getPool();
  const result = await pool.query<ActiveConfig>(
    `SELECT id, pms_type, api_key, base_url, client_id, client_secret,
            username, password, environment, updated_at
     FROM pms_configurations
     WHERE is_active = true
     ORDER BY updated_at DESC
     LIMIT 1`
  );
  return result.rows[0] ?? null;
}

async function getRecentSyncLogs(): Promise<SyncLog[]> {
  const pool = getPool();
  const result = await pool.query<SyncLog>(
    `SELECT id, pms_type, synced_at, units_imported, success, error_message
     FROM pms_sync_log
     ORDER BY synced_at DESC
     LIMIT 10`
  );
  return result.rows;
}

export default async function PMSIntegrationPage({
  searchParams,
}: {
  searchParams: { pms_type?: string; status?: string; msg?: string };
}) {
  const config = await getActiveConfig();
  const syncLogs = await getRecentSyncLogs();

  const selectedPms = searchParams.pms_type ?? config?.pms_type ?? 'manual';
  const status = searchParams.status;
  const msg = searchParams.msg ? decodeURIComponent(searchParams.msg) : null;

  async function saveConfig(formData: FormData): Promise<void> {
    'use server';
    const pmsType = (formData.get('pms_type') as string) ?? 'manual';
    const baseUrl = (formData.get('base_url') as string | null)?.trim() || null;
    const apiKey = (formData.get('api_key') as string | null)?.trim() || null;
    const clientId = (formData.get('client_id') as string | null)?.trim() || null;
    const clientSecret = (formData.get('client_secret') as string | null)?.trim() || null;
    const username = (formData.get('username') as string | null)?.trim() || null;
    const password = (formData.get('password') as string | null)?.trim() || null;
    const environment = (formData.get('environment') as string | null)?.trim() || 'production';

    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    try {
      await pool.query(
        `UPDATE pms_configurations SET is_active = false WHERE is_active = true`
      );
      await pool.query(
        `INSERT INTO pms_configurations
           (pms_type, api_key, base_url, client_id, client_secret, username, password, environment, is_active)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true)`,
        [pmsType, apiKey, baseUrl, clientId, clientSecret, username, password, environment]
      );
    } finally {
      await pool.end();
    }
    redirect(`/admin/pms?pms_type=${encodeURIComponent(pmsType)}&status=saved`);
  }

  async function testConnection(formData: FormData): Promise<void> {
    'use server';
    const pmsType = (formData.get('pms_type') as string) ?? 'manual';
    const baseUrl = (formData.get('base_url') as string | null)?.trim() || null;
    const clientId = (formData.get('client_id') as string | null)?.trim() || null;
    const clientSecret = (formData.get('client_secret') as string | null)?.trim() || null;
    const username = (formData.get('username') as string | null)?.trim() || null;
    const password = (formData.get('password') as string | null)?.trim() || null;

    let resultOk = false;
    let resultMsg = '';

    if (pmsType === 'yardi') {
      const result = await yardiHealthCheck(buildYardiConfig({ baseUrl, username, password }));
      resultOk = result.ok;
      resultMsg = result.message;
    } else if (pmsType === 'appfolio') {
      const result = await appfolioHealthCheck(buildAppFolioConfig({ baseUrl, clientId, clientSecret }));
      resultOk = result.ok;
      resultMsg = result.message;
    } else {
      const adapter = new ManualAdapter();
      const result = await adapter.healthCheck();
      resultOk = result.ok;
      resultMsg = result.message;
    }

    redirect(
      `/admin/pms?pms_type=${encodeURIComponent(pmsType)}&status=${resultOk ? 'ok' : 'error'}&msg=${encodeURIComponent(resultMsg)}`
    );
  }

  const lastSync = syncLogs[0] ?? null;
  const totalUnits = syncLogs.reduce((sum, log) => (log.success ? log.units_imported : sum), 0);

  return (
    <main>
      <h1>PMS Integration</h1>
      <p>
        Connect Yardi Voyager, AppFolio, or use Manual CSV import to enable your AI agent to read
        unit and lease data and write work orders natively.
      </p>

      {status === 'saved' && (
        <div
          style={{
            background: '#dcfce7',
            color: '#15803d',
            border: '1px solid #86efac',
            borderRadius: '6px',
            padding: '0.75rem 1rem',
            marginBottom: '1.5rem',
          }}
        >
          Configuration saved successfully.
        </div>
      )}

      {status === 'ok' && msg && (
        <div
          style={{
            background: '#dcfce7',
            color: '#15803d',
            border: '1px solid #86efac',
            borderRadius: '6px',
            padding: '0.75rem 1rem',
            marginBottom: '1.5rem',
          }}
        >
          Connection test passed: {msg}
        </div>
      )}

      {status === 'error' && msg && (
        <div
          style={{
            background: '#fee2e2',
            color: '#b91c1c',
            border: '1px solid #fca5a5',
            borderRadius: '6px',
            padding: '0.75rem 1rem',
            marginBottom: '1.5rem',
          }}
        >
          Connection test failed: {msg}
        </div>
      )}

      {/* PMS type selector (GET form to update URL param) */}
      <section style={{ marginBottom: '2rem' }}>
        <h2>Select PMS System</h2>
        <form method="get" action="/admin/pms" style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <select name="pms_type" defaultValue={selectedPms} style={{ minWidth: '200px' }}>
            <option value="manual">Manual CSV Import</option>
            <option value="yardi">Yardi Voyager</option>
            <option value="appfolio">AppFolio</option>
          </select>
          <button type="submit">Select</button>
        </form>
      </section>

      {/* Credential configuration form */}
      <section style={{ marginBottom: '2rem' }}>
        <h2>
          {selectedPms === 'yardi'
            ? 'Yardi Voyager Credentials'
            : selectedPms === 'appfolio'
            ? 'AppFolio Credentials'
            : 'Manual CSV Import'}
        </h2>

        {selectedPms === 'manual' ? (
          <div className="card">
            <p>
              In Manual mode, upload a CSV file from your PMS export on the{' '}
              <a href="/admin/properties">Properties</a> page. Each row should contain unit number,
              tenant name, tenant email, lease start, and lease end date.
            </p>
            <p className="muted">
              Manual CSV is the recommended fallback during the pre-credential period while Yardi or
              AppFolio API access is being provisioned.
            </p>
            <form action={saveConfig}>
              <input type="hidden" name="pms_type" value="manual" />
              <button type="submit">Save Manual Mode</button>
            </form>
          </div>
        ) : selectedPms === 'yardi' ? (
          <form action={saveConfig}>
            <input type="hidden" name="pms_type" value="yardi" />
            <div style={{ display: 'grid', gap: '1rem', maxWidth: '520px' }}>
              <label>
                Yardi Base URL
                <input
                  name="base_url"
                  type="url"
                  placeholder="https://your-company.yardi.com"
                  defaultValue={config?.pms_type === 'yardi' ? (config.base_url ?? '') : ''}
                  required
                />
              </label>
              <label>
                Username
                <input
                  name="username"
                  type="text"
                  placeholder="api_user"
                  defaultValue={config?.pms_type === 'yardi' ? (config.username ?? '') : ''}
                  required
                />
              </label>
              <label>
                Password
                <input
                  name="password"
                  type="password"
                  placeholder="••••••••"
                  defaultValue={config?.pms_type === 'yardi' ? (config.password ?? '') : ''}
                  required
                />
              </label>
              <label>
                Environment
                <select
                  name="environment"
                  defaultValue={config?.pms_type === 'yardi' ? (config.environment ?? 'production') : 'production'}
                >
                  <option value="production">Production</option>
                  <option value="sandbox">Sandbox</option>
                </select>
              </label>
              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                <button type="submit">Save Configuration</button>
                <button type="submit" formAction={testConnection}>
                  Test Connection
                </button>
              </div>
            </div>
          </form>
        ) : (
          <form action={saveConfig}>
            <input type="hidden" name="pms_type" value="appfolio" />
            <div style={{ display: 'grid', gap: '1rem', maxWidth: '520px' }}>
              <label>
                AppFolio Base URL
                <input
                  name="base_url"
                  type="url"
                  placeholder="https://your-company.appfolio.com"
                  defaultValue={config?.pms_type === 'appfolio' ? (config.base_url ?? '') : ''}
                  required
                />
              </label>
              <label>
                Client ID
                <input
                  name="client_id"
                  type="text"
                  placeholder="your_client_id"
                  defaultValue={config?.pms_type === 'appfolio' ? (config.client_id ?? '') : ''}
                  required
                />
              </label>
              <label>
                Client Secret
                <input
                  name="client_secret"
                  type="password"
                  placeholder="••••••••"
                  defaultValue={config?.pms_type === 'appfolio' ? (config.client_secret ?? '') : ''}
                  required
                />
              </label>
              <label>
                Environment
                <select
                  name="environment"
                  defaultValue={config?.pms_type === 'appfolio' ? (config.environment ?? 'production') : 'production'}
                >
                  <option value="production">Production</option>
                  <option value="sandbox">Sandbox</option>
                </select>
              </label>
              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                <button type="submit">Save Configuration</button>
                <button type="submit" formAction={testConnection}>
                  Test Connection
                </button>
              </div>
            </div>
          </form>
        )}
      </section>

      {/* Sync status panel */}
      <section>
        <h2>Sync Status</h2>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
          <div className="card">
            <p className="muted" style={{ margin: '0 0 0.25rem' }}>Last Sync</p>
            <strong>
              {lastSync
                ? new Date(lastSync.synced_at).toLocaleString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })
                : 'Never'}
            </strong>
          </div>
          <div className="card">
            <p className="muted" style={{ margin: '0 0 0.25rem' }}>Units Synced</p>
            <strong>{totalUnits.toLocaleString()}</strong>
          </div>
          <div className="card">
            <p className="muted" style={{ margin: '0 0 0.25rem' }}>Last Result</p>
            <strong
              style={{
                color: lastSync
                  ? lastSync.success
                    ? '#15803d'
                    : '#b91c1c'
                  : '#64748b',
              }}
            >
              {lastSync ? (lastSync.success ? 'Success' : 'Error') : '—'}
            </strong>
          </div>
          <div className="card">
            <p className="muted" style={{ margin: '0 0 0.25rem' }}>Active PMS</p>
            <strong>
              {config
                ? config.pms_type === 'yardi'
                  ? 'Yardi Voyager'
                  : config.pms_type === 'appfolio'
                  ? 'AppFolio'
                  : 'Manual CSV'
                : 'Not configured'}
            </strong>
          </div>
        </div>

        {syncLogs.length === 0 ? (
          <div className="empty">
            <strong>No sync history yet</strong>
            <p>Sync runs automatically every 15 minutes once a PMS is configured and connected.</p>
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Time</th>
                <th>PMS</th>
                <th>Units Imported</th>
                <th>Status</th>
                <th>Error</th>
              </tr>
            </thead>
            <tbody>
              {syncLogs.map((log) => (
                <tr key={log.id}>
                  <td>
                    {new Date(log.synced_at).toLocaleString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </td>
                  <td>
                    {log.pms_type === 'yardi'
                      ? 'Yardi'
                      : log.pms_type === 'appfolio'
                      ? 'AppFolio'
                      : 'Manual'}
                  </td>
                  <td>{log.units_imported}</td>
                  <td>
                    <span
                      style={{
                        color: log.success ? '#15803d' : '#b91c1c',
                        fontWeight: 600,
                      }}
                    >
                      {log.success ? 'Success' : 'Error'}
                    </span>
                  </td>
                  <td className="muted" style={{ fontSize: '0.82rem' }}>
                    {log.error_message ?? '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}
