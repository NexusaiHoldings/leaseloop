import { redirect } from 'next/navigation';
import { listProperties, createProperty } from '@/lib/tenantthread/property-context';

export const metadata = { title: 'Properties — TenantThread' };

export default async function PropertiesPage() {
  const properties = await listProperties();

  async function handleAddProperty(formData: FormData) {
    'use server';
    const name = (formData.get('name') as string | null)?.trim() ?? '';
    const address = (formData.get('address') as string | null)?.trim() ?? '';
    const unitCount = parseInt((formData.get('unit_count') as string | null) ?? '0', 10);
    const pmsType = (formData.get('pms_type') as string | null) ?? 'manual';

    if (!name || !address || isNaN(unitCount) || unitCount < 1) return;

    await createProperty({ name, address, unit_count: unitCount, pms_type: pmsType });
    redirect('/admin/properties');
  }

  return (
    <main>
      <h1>Properties</h1>
      <p>
        Manage your property portfolio. Add properties, configure units, and upload lease
        documents to activate your AI agent.
      </p>

      {properties.length === 0 ? (
        <div className="empty">
          <div style={{ fontSize: '3rem', lineHeight: 1, marginBottom: '0.75rem' }}>🏢</div>
          <strong>No properties yet</strong>
          <p>Add your first property to activate your AI agent.</p>
        </div>
      ) : (
        <div>
          {properties.map((property) => (
            <div key={property.id} className="card">
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  gap: '1rem',
                  flexWrap: 'wrap',
                }}
              >
                <div>
                  <h3 style={{ margin: 0 }}>
                    <a href={`/admin/properties/${property.id}`}>{property.name}</a>
                  </h3>
                  <p className="muted" style={{ margin: '0.25rem 0 0' }}>
                    {property.address}
                  </p>
                  <p className="muted" style={{ margin: '0.25rem 0 0', fontSize: '0.82rem' }}>
                    PMS:{' '}
                    {property.pms_type === 'yardi'
                      ? 'Yardi Voyager'
                      : property.pms_type === 'appfolio'
                      ? 'AppFolio'
                      : 'Manual'}
                  </p>
                </div>

                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                  {/* Unit-count badge */}
                  <span
                    style={{
                      background: '#dbeafe',
                      color: '#1e40af',
                      padding: '0.2rem 0.65rem',
                      borderRadius: '999px',
                      fontSize: '0.82rem',
                      fontWeight: 600,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {property.unit_count} unit{property.unit_count !== 1 ? 's' : ''}
                  </span>

                  {/* PMS sync status pill */}
                  <span
                    style={{
                      padding: '0.2rem 0.65rem',
                      borderRadius: '999px',
                      fontSize: '0.82rem',
                      fontWeight: 600,
                      whiteSpace: 'nowrap',
                      background:
                        property.pms_sync_status === 'synced'
                          ? '#dcfce7'
                          : property.pms_sync_status === 'error'
                          ? '#fee2e2'
                          : '#fef9c3',
                      color:
                        property.pms_sync_status === 'synced'
                          ? '#15803d'
                          : property.pms_sync_status === 'error'
                          ? '#b91c1c'
                          : '#854d0e',
                    }}
                  >
                    {property.pms_sync_status === 'synced'
                      ? '● synced'
                      : property.pms_sync_status === 'error'
                      ? '● error'
                      : '● pending'}
                  </span>

                  <a
                    href={`/admin/properties/${property.id}/units`}
                    className="btn secondary"
                  >
                    Units
                  </a>
                  <a href={`/admin/properties/${property.id}`} className="btn secondary">
                    Edit
                  </a>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <section style={{ marginTop: '2.5rem' }}>
        <h2>Add Property</h2>
        <form action={handleAddProperty}>
          <div style={{ display: 'grid', gap: '1rem', maxWidth: '480px' }}>
            <label>
              Property Name
              <input
                name="name"
                type="text"
                required
                placeholder="Sunrise Apartments"
              />
            </label>
            <label>
              Address
              <input
                name="address"
                type="text"
                required
                placeholder="123 Main St, Springfield, IL 62701"
              />
            </label>
            <label>
              Unit Count
              <input name="unit_count" type="number" required min="1" defaultValue="1" />
            </label>
            <label>
              PMS System
              <select name="pms_type">
                <option value="manual">Manual (no PMS)</option>
                <option value="yardi">Yardi Voyager</option>
                <option value="appfolio">AppFolio</option>
              </select>
            </label>
            <button type="submit">Add Property</button>
          </div>
        </form>
      </section>
    </main>
  );
}
