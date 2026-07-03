// PMS adapter pattern for Yardi Voyager and AppFolio.
// Addresses feasibility_analysis.key_technical_risks: "PMS API fragmentation".

export type PMSType = 'yardi' | 'appfolio' | 'manual';

export type PMSConfig = {
  apiKey?: string;
  baseUrl?: string;
  clientId?: string;
  clientSecret?: string;
  username?: string;
  password?: string;
};

export type SyncResult = {
  success: boolean;
  syncedAt: Date;
  propertyId: string;
  unitsImported: number;
  error?: string;
};

export type PMSUnit = {
  unitNumber: string;
  floorPlan: string | null;
  tenantName: string | null;
  tenantEmail: string | null;
  leaseStart: string | null;
  leaseEnd: string | null;
};

export type HealthCheckResult = {
  ok: boolean;
  message: string;
  latencyMs: number;
};

export interface PMSAdapter {
  pmsType: PMSType;
  fetchUnits(propertyExternalId: string): Promise<PMSUnit[]>;
  testConnection(): Promise<boolean>;
  healthCheck(): Promise<HealthCheckResult>;
}

// ── Yardi Voyager ──────────────────────────────────────────────────────────

export class YardiAdapter implements PMSAdapter {
  readonly pmsType: PMSType = 'yardi';
  private config: PMSConfig;

  constructor(config: PMSConfig) {
    this.config = config;
  }

  async testConnection(): Promise<boolean> {
    if (!this.config.baseUrl || !this.config.username || !this.config.password) {
      return false;
    }
    try {
      const response = await fetch(`${this.config.baseUrl}/api/v1/ping`, {
        method: 'GET',
        headers: {
          Authorization: `Basic ${Buffer.from(
            `${this.config.username}:${this.config.password}`
          ).toString('base64')}`,
          'Content-Type': 'application/json',
        },
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  async fetchUnits(propertyExternalId: string): Promise<PMSUnit[]> {
    if (!this.config.baseUrl || !this.config.username || !this.config.password) {
      return [];
    }
    try {
      const authHeader = `Basic ${Buffer.from(
        `${this.config.username}:${this.config.password}`
      ).toString('base64')}`;
      const url = `${this.config.baseUrl}/api/v1/properties/${encodeURIComponent(
        propertyExternalId
      )}/units`;
      const response = await fetch(url, {
        headers: {
          Authorization: authHeader,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
      });
      if (!response.ok) return [];
      const data = (await response.json()) as {
        units?: Array<Record<string, unknown>>;
      };
      return (data.units ?? []).map((unit) => ({
        unitNumber: String(unit.unit_number ?? unit.unitNumber ?? ''),
        floorPlan: unit.floor_plan ? String(unit.floor_plan) : null,
        tenantName: unit.tenant_name ? String(unit.tenant_name) : null,
        tenantEmail: unit.tenant_email ? String(unit.tenant_email) : null,
        leaseStart: unit.lease_start ? String(unit.lease_start) : null,
        leaseEnd: unit.lease_end ? String(unit.lease_end) : null,
      }));
    } catch {
      return [];
    }
  }

  async healthCheck(): Promise<HealthCheckResult> {
    const start = Date.now();
    if (!this.config.baseUrl || !this.config.username || !this.config.password) {
      return { ok: false, message: 'Missing Yardi credentials — provide base URL, username, and password', latencyMs: 0 };
    }
    try {
      const ok = await this.testConnection();
      return {
        ok,
        message: ok
          ? 'Connected to Yardi Voyager successfully'
          : 'Invalid Yardi API key — update credentials',
        latencyMs: Date.now() - start,
      };
    } catch (err) {
      return {
        ok: false,
        message: err instanceof Error ? err.message : 'Yardi connection failed',
        latencyMs: Date.now() - start,
      };
    }
  }
}

// ── AppFolio ───────────────────────────────────────────────────────────────

export class AppFolioAdapter implements PMSAdapter {
  readonly pmsType: PMSType = 'appfolio';
  private config: PMSConfig;

  constructor(config: PMSConfig) {
    this.config = config;
  }

  async testConnection(): Promise<boolean> {
    if (!this.config.clientId || !this.config.clientSecret || !this.config.baseUrl) {
      return false;
    }
    try {
      const response = await fetch(`${this.config.baseUrl}/api/v1/listings`, {
        headers: {
          Authorization: `Basic ${Buffer.from(
            `${this.config.clientId}:${this.config.clientSecret}`
          ).toString('base64')}`,
          Accept: 'application/json',
        },
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  async fetchUnits(propertyExternalId: string): Promise<PMSUnit[]> {
    if (!this.config.clientId || !this.config.clientSecret || !this.config.baseUrl) {
      return [];
    }
    try {
      const authHeader = `Basic ${Buffer.from(
        `${this.config.clientId}:${this.config.clientSecret}`
      ).toString('base64')}`;
      const url = `${this.config.baseUrl}/api/v1/properties/${encodeURIComponent(
        propertyExternalId
      )}/units`;
      const response = await fetch(url, {
        headers: { Authorization: authHeader, Accept: 'application/json' },
      });
      if (!response.ok) return [];
      const data = (await response.json()) as {
        results?: Array<Record<string, unknown>>;
      };
      return (data.results ?? []).map((unit) => ({
        unitNumber: String(unit.unit_number ?? ''),
        floorPlan: unit.floor_plan_name ? String(unit.floor_plan_name) : null,
        tenantName: unit.current_tenant ? String(unit.current_tenant) : null,
        tenantEmail: unit.tenant_email ? String(unit.tenant_email) : null,
        leaseStart: unit.lease_from ? String(unit.lease_from) : null,
        leaseEnd: unit.lease_to ? String(unit.lease_to) : null,
      }));
    } catch {
      return [];
    }
  }

  async healthCheck(): Promise<HealthCheckResult> {
    const start = Date.now();
    if (!this.config.clientId || !this.config.clientSecret || !this.config.baseUrl) {
      return { ok: false, message: 'Missing AppFolio credentials — provide base URL, client ID, and client secret', latencyMs: 0 };
    }
    try {
      const ok = await this.testConnection();
      return {
        ok,
        message: ok
          ? 'Connected to AppFolio successfully'
          : 'Invalid AppFolio API key — update client ID or secret',
        latencyMs: Date.now() - start,
      };
    } catch (err) {
      return {
        ok: false,
        message: err instanceof Error ? err.message : 'AppFolio connection failed',
        latencyMs: Date.now() - start,
      };
    }
  }
}

// ── Manual (no PMS) ────────────────────────────────────────────────────────

export class ManualAdapter implements PMSAdapter {
  readonly pmsType: PMSType = 'manual';

  async testConnection(): Promise<boolean> {
    return true;
  }

  async fetchUnits(_propertyExternalId: string): Promise<PMSUnit[]> {
    return [];
  }

  async healthCheck(): Promise<HealthCheckResult> {
    return { ok: true, message: 'Manual CSV mode — no external connection required', latencyMs: 0 };
  }
}

// ── Factory ────────────────────────────────────────────────────────────────

export function createPMSAdapter(pmsType: string, config: PMSConfig): PMSAdapter {
  switch (pmsType) {
    case 'yardi':
      return new YardiAdapter(config);
    case 'appfolio':
      return new AppFolioAdapter(config);
    default:
      return new ManualAdapter();
  }
}

export async function syncPropertyWithPMS(
  propertyId: string,
  adapter: PMSAdapter
): Promise<SyncResult> {
  const syncedAt = new Date();
  try {
    const units = await adapter.fetchUnits(propertyId);
    return {
      success: true,
      syncedAt,
      propertyId,
      unitsImported: units.length,
    };
  } catch (err) {
    return {
      success: false,
      syncedAt,
      propertyId,
      unitsImported: 0,
      error: err instanceof Error ? err.message : 'Unknown sync error',
    };
  }
}
