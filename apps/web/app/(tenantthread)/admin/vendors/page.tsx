import { redirect } from 'next/navigation';
import { listVendors, createVendor } from '@/lib/tenantthread/vendor-dispatch';

export const metadata = { title: 'Vendors — TenantThread' };

const CATEGORY_ICONS: Record<string, string> = {
  plumber: '🚰',
  electrician: '⚡',
  hvac: '❄️',
  locksmith: '🔓',
  roofer: '🏚️',
  painter: '🎨',
  pest_control: '🐛',
  general: '🔧',
};

const STATUS_STYLES: Record<string, { bg: string; color: string; label: string }> = {
  available: { bg: '#dcfce7', color: '#15803d', label: '● available' },
  on_call: { bg: '#fef9c3', color: '#854d0e', label: '● on-call' },
  unavailable: { bg: '#fee2e2', color: '#b91c1c', label: '● unavailable' },
};

function categoryIcon(category: string): string {
  return CATEGORY_ICONS[category.toLowerCase()] ?? '🔧';
}

function formatLastDispatched(date: Date | null): string {
  if (!date) return 'Never';
  const d = new Date(date);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default async function VendorsPage() {
  const vendors = await listVendors();

  async function handleAddVendor(formData: FormData) {
    'use server';
    const name = (formData.get('name') as string | null)?.trim() ?? '';
    const service_category = (formData.get('service_category') as string | null)?.trim() ?? '';
    const coverage_area = (formData.get('coverage_area') as string | null)?.trim() ?? '';
    const contact_name = (formData.get('contact_name') as string | null)?.trim() ?? '';
    const contact_phone = (formData.get('contact_phone') as string | null)?.trim() ?? '';
    const contact_email = (formData.get('contact_email') as string | null)?.trim() ?? '';
    const availability_hours = (formData.get('availability_hours') as string | null)?.trim() ?? '';
    const availability_status = ((formData.get('availability_status') as string | null) ?? 'available') as
      | 'available'
      | 'on_call'
      | 'unavailable';
    const notes = (formData.get('notes') as string | null)?.trim() ?? '';

    if (!name || !service_category || !coverage_area || !contact_phone) return;

    await createVendor({
      name,
      service_category,
      coverage_area,
      contact_name: contact_name || undefined,
      contact_phone,
      contact_email: contact_email || undefined,
      availability_hours: availability_hours || undefined,
      availability_status,
      notes: notes || undefined,
    });
    redirect('/admin/vendors');
  }

  return (
    <main>
      <h1>Vendors</h1>
      <p>
        Manage the dispatch roster of contractors and service providers. Vendors in this list are
        referenced by the AI voice agent when creating work orders for maintenance requests.
      </p>

      <a href="/admin/vendors/new" className="btn" style={{ display: 'none' }} />

      {vendors.length === 0 ? (
        <div className="empty">
          <div style={{ fontSize: '3rem', lineHeight: 1, marginBottom: '0.75rem' }}>🔧</div>
          <strong>No vendors yet</strong>
          <p>Add your first vendor to enable automated dispatch.</p>
        </div>
      ) : (
        <div>
          {vendors.map((vendor) => {
            const statusStyle = STATUS_STYLES[vendor.availability_status] ?? STATUS_STYLES.unavailable;
            return (
              <div key={vendor.id} className="card">
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    gap: '1rem',
                    flexWrap: 'wrap',
                  }}
                >
                  <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
                    <span style={{ fontSize: '1.75rem', lineHeight: 1, flexShrink: 0 }}>
                      {categoryIcon(vendor.service_category)}
                    </span>
                    <div>
                      <h3 style={{ margin: 0 }}>
                        <a href={`/admin/vendors/${vendor.id}`}>{vendor.name}</a>
                      </h3>
                      <p className="muted" style={{ margin: '0.2rem 0 0', fontSize: '0.85rem' }}>
                        {vendor.service_category.replace(/_/g, ' ')} &middot; {vendor.coverage_area}
                      </p>
                      <p className="muted" style={{ margin: '0.2rem 0 0', fontSize: '0.85rem' }}>
                        {vendor.contact_phone}
                        {vendor.contact_email ? ` · ${vendor.contact_email}` : ''}
                      </p>
                      {vendor.availability_hours && (
                        <p className="muted" style={{ margin: '0.2rem 0 0', fontSize: '0.82rem' }}>
                          Hours: {vendor.availability_hours}
                        </p>
                      )}
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                    <span
                      style={{
                        background: statusStyle.bg,
                        color: statusStyle.color,
                        padding: '0.2rem 0.65rem',
                        borderRadius: '999px',
                        fontSize: '0.82rem',
                        fontWeight: 600,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {statusStyle.label}
                    </span>
                    <span
                      style={{
                        background: '#f4f4f4',
                        color: '#555',
                        padding: '0.2rem 0.65rem',
                        borderRadius: '999px',
                        fontSize: '0.82rem',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      Last dispatched: {formatLastDispatched(vendor.last_dispatched_at)}
                    </span>
                    <a href={`/admin/vendors/${vendor.id}`} className="btn secondary">
                      Edit
                    </a>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <section style={{ marginTop: '2.5rem' }}>
        <h2>Add Vendor</h2>
        <form action={handleAddVendor}>
          <div style={{ display: 'grid', gap: '1rem', maxWidth: '520px' }}>
            <label>
              Business Name
              <input
                name="name"
                type="text"
                required
                placeholder="e.g. City Plumbing Co."
              />
            </label>
            <label>
              Service Category
              <select name="service_category" required>
                <option value="">Select a category…</option>
                <option value="plumber">Plumber</option>
                <option value="electrician">Electrician</option>
                <option value="hvac">HVAC</option>
                <option value="locksmith">Locksmith</option>
                <option value="roofer">Roofer</option>
                <option value="painter">Painter</option>
                <option value="pest_control">Pest Control</option>
                <option value="general">General Maintenance</option>
              </select>
            </label>
            <label>
              Coverage Area
              <input
                name="coverage_area"
                type="text"
                required
                placeholder="e.g. Downtown, North Side"
              />
            </label>
            <label>
              Contact Name
              <input
                name="contact_name"
                type="text"
                placeholder="e.g. Mike Johnson"
              />
            </label>
            <label>
              Contact Phone
              <input
                name="contact_phone"
                type="tel"
                required
                placeholder="e.g. (555) 867-5309"
              />
            </label>
            <label>
              Contact Email
              <input
                name="contact_email"
                type="email"
                placeholder="e.g. dispatch@cityplumbing.com"
              />
            </label>
            <label>
              Availability Hours
              <input
                name="availability_hours"
                type="text"
                placeholder="e.g. Mon–Fri 7am–5pm, 24/7 on-call"
              />
            </label>
            <label>
              Availability Status
              <select name="availability_status">
                <option value="available">Available</option>
                <option value="on_call">On-Call</option>
                <option value="unavailable">Unavailable</option>
              </select>
            </label>
            <label>
              Notes
              <textarea
                name="notes"
                rows={3}
                placeholder="e.g. Preferred vendor for units 1–20. Requires 48hr notice for non-emergency."
              />
            </label>
            <button type="submit">Add Vendor</button>
          </div>
        </form>
      </section>
    </main>
  );
}
