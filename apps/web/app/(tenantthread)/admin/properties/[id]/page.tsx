import { notFound, redirect } from 'next/navigation';
import {
  getProperty,
  updateProperty,
  listLeaseDocuments,
  indexLeaseDocument,
} from '@/lib/tenantthread/property-context';

type PageProps = { params: { id: string } };

export async function generateMetadata({ params }: PageProps) {
  const property = await getProperty(params.id);
  return { title: property ? `${property.name} — TenantThread` : 'Property — TenantThread' };
}

export default async function PropertyDetailPage({ params }: PageProps) {
  const property = await getProperty(params.id);
  if (!property) notFound();

  const documents = await listLeaseDocuments(property.id);

  async function handleEditProperty(formData: FormData) {
    'use server';
    const name = (formData.get('name') as string | null)?.trim() ?? '';
    const address = (formData.get('address') as string | null)?.trim() ?? '';
    const unitCount = parseInt((formData.get('unit_count') as string | null) ?? '0', 10);
    const pmsType = (formData.get('pms_type') as string | null) ?? 'manual';

    if (!name || !address || isNaN(unitCount) || unitCount < 1) return;

    await updateProperty(params.id, {
      name,
      address,
      unit_count: unitCount,
      pms_type: pmsType,
    });
    redirect(`/admin/properties/${params.id}`);
  }

  async function handleUploadDocument(formData: FormData) {
    'use server';
    const file = formData.get('file') as File | null;
    const unitId = (formData.get('unit_id') as string | null) ?? '';
    const category = (formData.get('category') as string | null) ?? 'lease_agreement';

    if (!file || file.size === 0) return;

    const bytes = await file.arrayBuffer();
    // Decode as UTF-8 text; binary PDFs will yield partial text — a full
    // PDF parser (pdf-parse) can be layered in a background job later.
    const content = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
    const fileId = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;

    await indexLeaseDocument({
      propertyId: params.id,
      unitId: unitId || undefined,
      fileId,
      fileName: file.name,
      content: content || `[binary content — ${file.name}]`,
      category,
    });
    redirect(`/admin/properties/${params.id}`);
  }

  const syncBg =
    property.pms_sync_status === 'synced'
      ? '#dcfce7'
      : property.pms_sync_status === 'error'
      ? '#fee2e2'
      : '#fef9c3';
  const syncColor =
    property.pms_sync_status === 'synced'
      ? '#15803d'
      : property.pms_sync_status === 'error'
      ? '#b91c1c'
      : '#854d0e';

  return (
    <main>
      <p className="muted">
        <a href="/admin/properties">← Properties</a>
      </p>

      <div
        style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}
      >
        <h1 style={{ margin: 0 }}>{property.name}</h1>
        <span
          style={{
            background: syncBg,
            color: syncColor,
            padding: '0.2rem 0.65rem',
            borderRadius: '999px',
            fontSize: '0.82rem',
            fontWeight: 600,
          }}
        >
          {property.pms_sync_status === 'synced'
            ? '● synced'
            : property.pms_sync_status === 'error'
            ? '● error'
            : '● pending'}
        </span>
      </div>
      <p className="muted">{property.address}</p>

      <p>
        <a href={`/admin/properties/${property.id}/units`} className="btn">
          Configure Units ({property.unit_count})
        </a>
      </p>

      {/* ── Edit Property ─────────────────────────────────────────────── */}
      <section>
        <h2>Property Details</h2>
        <form action={handleEditProperty}>
          <div style={{ display: 'grid', gap: '1rem', maxWidth: '480px' }}>
            <label>
              Property Name
              <input
                name="name"
                type="text"
                required
                defaultValue={property.name}
              />
            </label>
            <label>
              Address
              <input
                name="address"
                type="text"
                required
                defaultValue={property.address}
              />
            </label>
            <label>
              Unit Count
              <input
                name="unit_count"
                type="number"
                required
                min="1"
                defaultValue={property.unit_count}
              />
            </label>
            <label>
              PMS System
              <select name="pms_type" defaultValue={property.pms_type}>
                <option value="manual">Manual (no PMS)</option>
                <option value="yardi">Yardi Voyager</option>
                <option value="appfolio">AppFolio</option>
              </select>
            </label>
            <button type="submit">Save Changes</button>
          </div>
        </form>
      </section>

      {/* ── Lease Documents ───────────────────────────────────────────── */}
      <section style={{ marginTop: '2.5rem' }}>
        <h2>Lease Documents</h2>
        <p className="muted">
          Upload lease agreements, addenda, and house rules. Documents are chunked and
          embedded into the property knowledge base for AI-powered tenant support.
        </p>

        {documents.length === 0 ? (
          <div className="empty">
            <p>
              No documents uploaded yet. Upload a lease agreement to activate
              RAG-powered AI responses for this property.
            </p>
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>File Name</th>
                <th>Category</th>
                <th>Chunks</th>
                <th>Uploaded</th>
              </tr>
            </thead>
            <tbody>
              {documents.map((doc) => (
                <tr key={doc.id}>
                  <td>{doc.file_name}</td>
                  <td style={{ textTransform: 'capitalize' }}>
                    {doc.category.replace(/_/g, ' ')}
                  </td>
                  <td>{doc.chunk_count}</td>
                  <td>{new Date(doc.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <form
          action={handleUploadDocument}
          encType="multipart/form-data"
          style={{ marginTop: '1.25rem' }}
        >
          <div style={{ display: 'grid', gap: '1rem', maxWidth: '480px' }}>
            <label>
              Document File (PDF or TXT)
              <input name="file" type="file" required accept=".pdf,.txt,.md" />
            </label>
            <label>
              Category
              <select name="category">
                <option value="lease_agreement">Lease Agreement</option>
                <option value="addendum">Addendum</option>
                <option value="house_rules">House Rules</option>
                <option value="other">Other</option>
              </select>
            </label>
            <button type="submit">Upload &amp; Index Document</button>
          </div>
        </form>
      </section>
    </main>
  );
}
