import { Pool } from 'pg';

// Module-level singleton pool — safe for Next.js serverless (recreated on cold start).
let _pool: Pool | null = null;

function getPool(): Pool {
  if (!_pool) {
    _pool = new Pool({ connectionString: process.env.DATABASE_URL });
  }
  return _pool;
}

// ── Types ──────────────────────────────────────────────────────────────────

export type PMSSyncStatus = 'synced' | 'pending' | 'error';

export type Property = {
  id: string;
  name: string;
  address: string;
  unit_count: number;
  pms_type: string;
  pms_sync_status: PMSSyncStatus;
  pms_last_synced_at: Date | null;
  org_id: string | null;
  created_at: Date;
  updated_at: Date;
};

export type Unit = {
  id: string;
  property_id: string;
  unit_number: string;
  floor_plan: string | null;
  tenant_name: string | null;
  tenant_email: string | null;
  lease_start: Date | null;
  lease_end: Date | null;
  created_at: Date;
  updated_at: Date;
};

export type LeaseDocument = {
  id: string;
  property_id: string;
  unit_id: string | null;
  file_id: string;
  file_name: string;
  category: string;
  chunk_count: number;
  created_at: Date;
};

// ── Property CRUD ──────────────────────────────────────────────────────────

export async function listProperties(): Promise<Property[]> {
  const pool = getPool();
  const result = await pool.query<Property>(
    'SELECT * FROM properties ORDER BY created_at DESC'
  );
  return result.rows;
}

export async function getProperty(id: string): Promise<Property | null> {
  const pool = getPool();
  const result = await pool.query<Property>(
    'SELECT * FROM properties WHERE id = $1',
    [id]
  );
  return result.rows[0] ?? null;
}

export async function createProperty(data: {
  name: string;
  address: string;
  unit_count: number;
  pms_type: string;
  org_id?: string;
}): Promise<Property> {
  const pool = getPool();
  const result = await pool.query<Property>(
    `INSERT INTO properties (name, address, unit_count, pms_type, org_id)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [data.name, data.address, data.unit_count, data.pms_type, data.org_id ?? null]
  );
  return result.rows[0];
}

export async function updateProperty(
  id: string,
  data: {
    name?: string;
    address?: string;
    unit_count?: number;
    pms_type?: string;
    pms_sync_status?: PMSSyncStatus;
    pms_last_synced_at?: Date;
  }
): Promise<Property | null> {
  const pool = getPool();
  const setClauses: string[] = [];
  const values: unknown[] = [];
  let paramIdx = 1;

  if (data.name !== undefined) {
    setClauses.push(`name = $${paramIdx++}`);
    values.push(data.name);
  }
  if (data.address !== undefined) {
    setClauses.push(`address = $${paramIdx++}`);
    values.push(data.address);
  }
  if (data.unit_count !== undefined) {
    setClauses.push(`unit_count = $${paramIdx++}`);
    values.push(data.unit_count);
  }
  if (data.pms_type !== undefined) {
    setClauses.push(`pms_type = $${paramIdx++}`);
    values.push(data.pms_type);
  }
  if (data.pms_sync_status !== undefined) {
    setClauses.push(`pms_sync_status = $${paramIdx++}`);
    values.push(data.pms_sync_status);
  }
  if (data.pms_last_synced_at !== undefined) {
    setClauses.push(`pms_last_synced_at = $${paramIdx++}`);
    values.push(data.pms_last_synced_at);
  }

  if (setClauses.length === 0) return getProperty(id);

  setClauses.push('updated_at = now()');
  values.push(id);

  const result = await pool.query<Property>(
    `UPDATE properties SET ${setClauses.join(', ')} WHERE id = $${paramIdx} RETURNING *`,
    values
  );
  return result.rows[0] ?? null;
}

export async function deleteProperty(id: string): Promise<void> {
  const pool = getPool();
  await pool.query('DELETE FROM properties WHERE id = $1', [id]);
}

// ── Unit CRUD ──────────────────────────────────────────────────────────────

export async function listUnits(propertyId: string): Promise<Unit[]> {
  const pool = getPool();
  const result = await pool.query<Unit>(
    'SELECT * FROM units WHERE property_id = $1 ORDER BY unit_number',
    [propertyId]
  );
  return result.rows;
}

export async function getUnit(id: string): Promise<Unit | null> {
  const pool = getPool();
  const result = await pool.query<Unit>(
    'SELECT * FROM units WHERE id = $1',
    [id]
  );
  return result.rows[0] ?? null;
}

export async function createUnit(data: {
  property_id: string;
  unit_number: string;
  floor_plan?: string;
  tenant_name?: string;
  tenant_email?: string;
  lease_start?: string;
  lease_end?: string;
}): Promise<Unit> {
  const pool = getPool();
  const result = await pool.query<Unit>(
    `INSERT INTO units
       (property_id, unit_number, floor_plan, tenant_name, tenant_email, lease_start, lease_end)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [
      data.property_id,
      data.unit_number,
      data.floor_plan ?? null,
      data.tenant_name ?? null,
      data.tenant_email ?? null,
      data.lease_start ?? null,
      data.lease_end ?? null,
    ]
  );
  return result.rows[0];
}

export async function updateUnit(
  id: string,
  data: {
    unit_number?: string;
    floor_plan?: string;
    tenant_name?: string;
    tenant_email?: string;
    lease_start?: string;
    lease_end?: string;
  }
): Promise<Unit | null> {
  const pool = getPool();
  const setClauses: string[] = [];
  const values: unknown[] = [];
  let paramIdx = 1;

  if (data.unit_number !== undefined) {
    setClauses.push(`unit_number = $${paramIdx++}`);
    values.push(data.unit_number);
  }
  if (data.floor_plan !== undefined) {
    setClauses.push(`floor_plan = $${paramIdx++}`);
    values.push(data.floor_plan);
  }
  if (data.tenant_name !== undefined) {
    setClauses.push(`tenant_name = $${paramIdx++}`);
    values.push(data.tenant_name);
  }
  if (data.tenant_email !== undefined) {
    setClauses.push(`tenant_email = $${paramIdx++}`);
    values.push(data.tenant_email);
  }
  if (data.lease_start !== undefined) {
    setClauses.push(`lease_start = $${paramIdx++}`);
    values.push(data.lease_start);
  }
  if (data.lease_end !== undefined) {
    setClauses.push(`lease_end = $${paramIdx++}`);
    values.push(data.lease_end);
  }

  if (setClauses.length === 0) return getUnit(id);

  setClauses.push('updated_at = now()');
  values.push(id);

  const result = await pool.query<Unit>(
    `UPDATE units SET ${setClauses.join(', ')} WHERE id = $${paramIdx} RETURNING *`,
    values
  );
  return result.rows[0] ?? null;
}

export async function deleteUnit(id: string): Promise<void> {
  const pool = getPool();
  await pool.query('DELETE FROM units WHERE id = $1', [id]);
}

// ── Lease Documents ────────────────────────────────────────────────────────

export async function listLeaseDocuments(propertyId: string): Promise<LeaseDocument[]> {
  const pool = getPool();
  const result = await pool.query<LeaseDocument>(
    'SELECT * FROM lease_documents WHERE property_id = $1 ORDER BY created_at DESC',
    [propertyId]
  );
  return result.rows;
}

// ── pgvector RAG helpers ───────────────────────────────────────────────────

async function generateEmbedding(text: string): Promise<number[]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    // Return zero vector when API key is absent (dev/test environments).
    return new Array(1536).fill(0) as number[];
  }
  try {
    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model: 'text-embedding-3-small', input: text }),
    });
    if (!response.ok) {
      return new Array(1536).fill(0) as number[];
    }
    const data = (await response.json()) as {
      data: Array<{ embedding: number[] }>;
    };
    return data.data[0]?.embedding ?? (new Array(1536).fill(0) as number[]);
  } catch {
    return new Array(1536).fill(0) as number[];
  }
}

function chunkText(text: string, maxChunkSize = 500): string[] {
  const paragraphs = text.split(/\n\n+/);
  const chunks: string[] = [];
  let current = '';

  for (const para of paragraphs) {
    if (current.length + para.length > maxChunkSize && current.length > 0) {
      chunks.push(current.trim());
      current = para;
    } else {
      current = current ? `${current}\n\n${para}` : para;
    }
  }
  if (current.trim()) chunks.push(current.trim());

  return chunks.length > 0 ? chunks : [text.slice(0, maxChunkSize)];
}

export async function indexLeaseDocument(params: {
  propertyId: string;
  unitId?: string;
  fileId: string;
  fileName: string;
  content: string;
  category?: string;
}): Promise<LeaseDocument> {
  const pool = getPool();
  const category = params.category ?? 'lease_agreement';
  const chunks = chunkText(params.content);

  const docResult = await pool.query<LeaseDocument>(
    `INSERT INTO lease_documents
       (property_id, unit_id, file_id, file_name, category, chunk_count)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [
      params.propertyId,
      params.unitId ?? null,
      params.fileId,
      params.fileName,
      category,
      chunks.length,
    ]
  );
  const doc = docResult.rows[0];

  for (let idx = 0; idx < chunks.length; idx++) {
    const embedding = await generateEmbedding(chunks[idx]);
    const embeddingStr = `[${embedding.join(',')}]`;
    await pool.query(
      `INSERT INTO property_document_chunks
         (lease_document_id, property_id, chunk_text, embedding, chunk_index)
       VALUES ($1, $2, $3, $4::vector, $5)`,
      [doc.id, params.propertyId, chunks[idx], embeddingStr, idx]
    );
  }

  return doc;
}

export async function searchPropertyContext(
  propertyId: string,
  query: string,
  limit = 5
): Promise<Array<{ chunk_text: string; similarity: number }>> {
  const pool = getPool();
  const queryEmbedding = await generateEmbedding(query);
  const embeddingStr = `[${queryEmbedding.join(',')}]`;
  const result = await pool.query<{ chunk_text: string; similarity: number }>(
    `SELECT chunk_text, 1 - (embedding <=> $1::vector) AS similarity
     FROM property_document_chunks
     WHERE property_id = $2
     ORDER BY embedding <=> $1::vector
     LIMIT $3`,
    [embeddingStr, propertyId, limit]
  );
  return result.rows;
}
