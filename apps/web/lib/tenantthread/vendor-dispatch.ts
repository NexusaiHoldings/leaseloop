import { Pool } from 'pg';

let _pool: Pool | null = null;

function getPool(): Pool {
  if (!_pool) {
    _pool = new Pool({ connectionString: process.env.DATABASE_URL });
  }
  return _pool;
}

// ── Types ──────────────────────────────────────────────────────────────────

export type VendorStatus = 'available' | 'on_call' | 'unavailable';

export type Vendor = {
  id: string;
  name: string;
  service_category: string;
  coverage_area: string;
  contact_name: string | null;
  contact_phone: string;
  contact_email: string | null;
  availability_hours: string | null;
  availability_status: VendorStatus;
  last_dispatched_at: Date | null;
  notes: string | null;
  org_id: string | null;
  created_at: Date;
  updated_at: Date;
};

export type CreateVendorInput = {
  name: string;
  service_category: string;
  coverage_area: string;
  contact_name?: string;
  contact_phone: string;
  contact_email?: string;
  availability_hours?: string;
  availability_status?: VendorStatus;
  notes?: string;
  org_id?: string;
};

export type UpdateVendorInput = {
  name?: string;
  service_category?: string;
  coverage_area?: string;
  contact_name?: string;
  contact_phone?: string;
  contact_email?: string;
  availability_hours?: string;
  availability_status?: VendorStatus;
  notes?: string;
  last_dispatched_at?: Date;
};

// ── Vendor CRUD ────────────────────────────────────────────────────────────

export async function listVendors(): Promise<Vendor[]> {
  const pool = getPool();
  const result = await pool.query<Vendor>(
    'SELECT * FROM vendors ORDER BY service_category, name'
  );
  return result.rows;
}

export async function getVendor(id: string): Promise<Vendor | null> {
  const pool = getPool();
  const result = await pool.query<Vendor>(
    'SELECT * FROM vendors WHERE id = $1',
    [id]
  );
  return result.rows[0] ?? null;
}

export async function createVendor(data: CreateVendorInput): Promise<Vendor> {
  const pool = getPool();
  const result = await pool.query<Vendor>(
    `INSERT INTO vendors
       (name, service_category, coverage_area, contact_name, contact_phone,
        contact_email, availability_hours, availability_status, notes, org_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING *`,
    [
      data.name,
      data.service_category,
      data.coverage_area,
      data.contact_name ?? null,
      data.contact_phone,
      data.contact_email ?? null,
      data.availability_hours ?? null,
      data.availability_status ?? 'available',
      data.notes ?? null,
      data.org_id ?? null,
    ]
  );
  const vendor = result.rows[0];
  // Re-embed vendor context for RAG after creation (non-blocking; ignore errors)
  embedVendorContext(vendor.id).catch(() => undefined);
  return vendor;
}

export async function updateVendor(
  id: string,
  data: UpdateVendorInput
): Promise<Vendor | null> {
  const pool = getPool();
  const setClauses: string[] = [];
  const values: unknown[] = [];
  let paramIdx = 1;

  if (data.name !== undefined) {
    setClauses.push(`name = $${paramIdx++}`);
    values.push(data.name);
  }
  if (data.service_category !== undefined) {
    setClauses.push(`service_category = $${paramIdx++}`);
    values.push(data.service_category);
  }
  if (data.coverage_area !== undefined) {
    setClauses.push(`coverage_area = $${paramIdx++}`);
    values.push(data.coverage_area);
  }
  if (data.contact_name !== undefined) {
    setClauses.push(`contact_name = $${paramIdx++}`);
    values.push(data.contact_name);
  }
  if (data.contact_phone !== undefined) {
    setClauses.push(`contact_phone = $${paramIdx++}`);
    values.push(data.contact_phone);
  }
  if (data.contact_email !== undefined) {
    setClauses.push(`contact_email = $${paramIdx++}`);
    values.push(data.contact_email);
  }
  if (data.availability_hours !== undefined) {
    setClauses.push(`availability_hours = $${paramIdx++}`);
    values.push(data.availability_hours);
  }
  if (data.availability_status !== undefined) {
    setClauses.push(`availability_status = $${paramIdx++}`);
    values.push(data.availability_status);
  }
  if (data.notes !== undefined) {
    setClauses.push(`notes = $${paramIdx++}`);
    values.push(data.notes);
  }
  if (data.last_dispatched_at !== undefined) {
    setClauses.push(`last_dispatched_at = $${paramIdx++}`);
    values.push(data.last_dispatched_at);
  }

  if (setClauses.length === 0) return getVendor(id);

  setClauses.push('updated_at = now()');
  values.push(id);

  const result = await pool.query<Vendor>(
    `UPDATE vendors SET ${setClauses.join(', ')} WHERE id = $${paramIdx} RETURNING *`,
    values
  );
  const vendor = result.rows[0] ?? null;
  if (vendor) {
    embedVendorContext(vendor.id).catch(() => undefined);
  }
  return vendor;
}

export async function deleteVendor(id: string): Promise<void> {
  const pool = getPool();
  await pool.query('DELETE FROM vendors WHERE id = $1', [id]);
}

// ── RAG — pgvector embedding ───────────────────────────────────────────────

async function generateEmbedding(text: string): Promise<number[]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
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

/**
 * Re-embeds a vendor's context summary into pgvector.
 * Called after create/update so RAG context stays current.
 */
export async function embedVendorContext(vendorId: string): Promise<void> {
  const pool = getPool();
  const vendor = await getVendor(vendorId);
  if (!vendor) return;

  const contextText = [
    `Vendor: ${vendor.name}`,
    `Service category: ${vendor.service_category}`,
    `Coverage area: ${vendor.coverage_area}`,
    vendor.contact_name ? `Contact: ${vendor.contact_name}` : null,
    `Phone: ${vendor.contact_phone}`,
    vendor.contact_email ? `Email: ${vendor.contact_email}` : null,
    vendor.availability_hours ? `Hours: ${vendor.availability_hours}` : null,
    `Status: ${vendor.availability_status}`,
    vendor.notes ? `Notes: ${vendor.notes}` : null,
  ]
    .filter(Boolean)
    .join('\n');

  const embedding = await generateEmbedding(contextText);
  const embeddingStr = `[${embedding.join(',')}]`;

  // Replace existing chunks for this vendor, then insert fresh
  await pool.query('DELETE FROM vendor_context_chunks WHERE vendor_id = $1', [vendorId]);
  await pool.query(
    `INSERT INTO vendor_context_chunks (vendor_id, chunk_text, embedding, chunk_index)
     VALUES ($1, $2, $3::vector, 0)`,
    [vendorId, contextText, embeddingStr]
  );
}

export async function searchVendorContext(
  query: string,
  limit = 5
): Promise<Array<{ vendor_id: string; chunk_text: string; similarity: number }>> {
  const pool = getPool();
  const queryEmbedding = await generateEmbedding(query);
  const embeddingStr = `[${queryEmbedding.join(',')}]`;
  const result = await pool.query<{
    vendor_id: string;
    chunk_text: string;
    similarity: number;
  }>(
    `SELECT vendor_id, chunk_text, 1 - (embedding <=> $1::vector) AS similarity
     FROM vendor_context_chunks
     ORDER BY embedding <=> $1::vector
     LIMIT $2`,
    [embeddingStr, limit]
  );
  return result.rows;
}
