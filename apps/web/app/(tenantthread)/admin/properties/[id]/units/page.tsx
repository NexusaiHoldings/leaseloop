import { notFound, redirect } from 'next/navigation';
import {
  getProperty,
  listUnits,
  createUnit,
  deleteUnit,
} from '@/lib/tenantthread/property-context';

type PageProps = { params: { id: string } };

export async function generateMetadata({ params }: PageProps) {
  const property = await getProperty(params.id);
  return {
    title: property
      ? `Units — ${property.name} — TenantThread`
      : 'Units — TenantThread',
  };
}

export default async function UnitsPage({ params }: PageProps) {
  const property = await getProperty(params.id);
  if (!property) notFound();

  const units = await listUnits(property.id);

  async function handleAddUnit(formData: FormData) {
    'use server';
    const unitNumber = (formData.get('unit_number') as string | null)?.trim() ?? '';
    const floorPlan = (formData.get('floor_plan') as string | null)?.trim() ?? '';
    const tenantName = (formData.get('tenant_name') as string | null)?.trim() ?? '';
    const tenantEmail = (formData.get('tenant_email') as string | null)?.trim() ?? '';
    const leaseStart = (formData.get('lease_start') as string | null) ?? '';
    const leaseEnd = (formData.get('lease_end') as string | null) ?? '';

    if (!unitNumber) return;

    await createUnit({
      property_id: params.id,
      unit_number: unitNumber,
      floor_plan: floorPlan || undefined,
      tenant_name: tenantName || undefined,
      tenant_email: tenantEmail || undefined,
      lease_start: leaseStart || undefined,
      lease_end: leaseEnd || undefined,
    });
    redirect(`/admin/properties/${params.id}/units`);
  }

  async function handleRemoveUnit(formData: FormData) {
    'use server';
    const unitId = (formData.get('unit_id') as string | null) ?? '';
    if (!unitId) return;
    await deleteUnit(unitId);
    redirect(`/admin/properties/${params.id}/units`);
  }

  return (
    <main>
      <p className="muted">
        <a href={`/admin/properties/${params.id}`}>← {property.name}</a>
      </p>

      <h1>Units — {property.name}</h1>
      <p>
        Configure individual units, assign tenants, and manage lease dates. The AI agent
        uses this data to answer tenant inquiries accurately.
      </p>

      {units.length === 0 ? (
        <div className="empty">
          <p>No units configured yet. Add your first unit below.</p>
        </div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Unit #</th>
              <th>Floor Plan</th>
              <th>Tenant</th>
              <th>Lease Start</th>
              <th>Lease End</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {units.map((unit) => (
              <tr key={unit.id}>
                <td>
                  <strong>{unit.unit_number}</strong>
                </td>
                <td>{unit.floor_plan ?? <span className="muted">—</span>}</td>
                <td>
                  {unit.tenant_name ? (
                    unit.tenant_name
                  ) : (
                    <span className="muted">Vacant</span>
                  )}
                </td>
                <td>
                  {unit.lease_start
                    ? new Date(unit.lease_start).toLocaleDateString()
                    : <span className="muted">—</span>}
                </td>
                <td>
                  {unit.lease_end
                    ? new Date(unit.lease_end).toLocaleDateString()
                    : <span className="muted">—</span>}
                </td>
                <td>
                  <form action={handleRemoveUnit} style={{ display: 'inline' }}>
                    <input type="hidden" name="unit_id" value={unit.id} />
                    <button type="submit" className="btn secondary">
                      Remove
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* ── Add Unit ───────────────────────────────────────────────────── */}
      <section style={{ marginTop: '2.5rem' }}>
        <h2>Add Unit</h2>
        <form action={handleAddUnit}>
          <div style={{ display: 'grid', gap: '1rem', maxWidth: '480px' }}>
            <label>
              Unit Number <span style={{ color: 'red' }}>*</span>
              <input
                name="unit_number"
                type="text"
                required
                placeholder="101"
              />
            </label>
            <label>
              Floor Plan
              <input name="floor_plan" type="text" placeholder="1BR/1BA" />
            </label>
            <label>
              Tenant Name
              <input name="tenant_name" type="text" placeholder="Jane Smith" />
            </label>
            <label>
              Tenant Email
              <input
                name="tenant_email"
                type="email"
                placeholder="jane@example.com"
              />
            </label>
            <label>
              Lease Start
              <input name="lease_start" type="date" />
            </label>
            <label>
              Lease End
              <input name="lease_end" type="date" />
            </label>
            <button type="submit">Add Unit</button>
          </div>
        </form>
      </section>
    </main>
  );
}
