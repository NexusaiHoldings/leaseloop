import { notFound, redirect } from 'next/navigation';
import { getVendor, updateVendor, deleteVendor } from '@/lib/tenantthread/vendor-dispatch';

type PageProps = { params: { id: string } };

export async function generateMetadata({ params }: PageProps) {
  const vendor = await getVendor(params.id);
  return { title: vendor ? `${vendor.name} — TenantThread` : 'Vendor — TenantThread' };
}

const STATUS_STYLES: Record<string, { bg: string; color: string; label: string }> = {
  available: { bg: '#dcfce7', color: '#15803d', label: '● available' },
  on_call: { bg: '#fef9c3', color: '#854d0e', label: '● on-call' },
  unavailable: { bg: '#fee2e2', color: '#b91c1c', label: '● unavailable' },
};

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

export default async function VendorDetailPage({ params }: PageProps) {
  const vendor = await getVendor(params.id);
  if (!vendor) notFound();

  const statusStyle = STATUS_STYLES[vendor.availability_status] ?? STATUS_STYLES.unavailable;
  const icon = CATEGORY_ICONS[vendor.service_category.toLowerCase()] ?? '🔧';

  async function handleEditVendor(formData: FormData) {
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

    await updateVendor(params.id, {
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
    redirect(`/admin/vendors/${params.id}`);
  }

  async function handleDeleteVendor(_formData: FormData) {
    'use server';
    await deleteVendor(params.id);
    redirect('/admin/vendors');
  }

  return (
    <main>
      <p className="muted">
        <a href="/admin/vendors">← Vendors</a>
      </p>

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.25rem' }}>
        <span style={{ fontSize: '2rem', lineHeight: 1 }}>{icon}</span>
        <h1 style={{ margin: 0 }}>{vendor.name}</h1>
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
      </div>

      <p className="muted">
        {vendor.service_category.replace(/_/g, ' ')} &middot; {vendor.coverage_area}
        {vendor.last_dispatched_at
          ? ` · Last dispatched: ${new Date(vendor.last_dispatched_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
          : ' · Never dispatched'}
      </p>

      <section style={{ marginTop: '1.5rem' }}>
        <h2>Edit Vendor</h2>
        <form action={handleEditVendor}>
          <div style={{ display: 'grid', gap: '1rem', maxWidth: '520px' }}>
            <label>
              Business Name
              <input
                name="name"
                type="text"
                required
                defaultValue={vendor.name}
              />
            </label>
            <label>
              Service Category
              <select name="service_category" required defaultValue={vendor.service_category}>
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
                defaultValue={vendor.coverage_area}
              />
            </label>
            <label>
              Contact Name
              <input
                name="contact_name"
                type="text"
                defaultValue={vendor.contact_name ?? ''}
              />
            </label>
            <label>
              Contact Phone
              <input
                name="contact_phone"
                type="tel"
                required
                defaultValue={vendor.contact_phone}
              />
            </label>
            <label>
              Contact Email
              <input
                name="contact_email"
                type="email"
                defaultValue={vendor.contact_email ?? ''}
              />
            </label>
            <label>
              Availability Hours
              <input
                name="availability_hours"
                type="text"
                defaultValue={vendor.availability_hours ?? ''}
                placeholder="e.g. Mon–Fri 7am–5pm, 24/7 on-call"
              />
            </label>
            <label>
              Availability Status
              <select name="availability_status" defaultValue={vendor.availability_status}>
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
                defaultValue={vendor.notes ?? ''}
                placeholder="Additional notes about this vendor…"
              />
            </label>
            <button type="submit">Save Changes</button>
          </div>
        </form>
      </section>

      <section style={{ marginTop: '2.5rem', paddingTop: '1.5rem', borderTop: '1px solid var(--substrate-border)' }}>
        <h2 style={{ color: 'var(--substrate-danger)' }}>Remove Vendor</h2>
        <p className="muted">
          Permanently removes this vendor from the dispatch roster. This cannot be undone.
        </p>
        <form action={handleDeleteVendor}>
          <button
            type="submit"
            style={{
              background: 'var(--substrate-danger)',
              color: '#fff',
              border: 'none',
              padding: '0.5rem 1.25rem',
              borderRadius: 'var(--substrate-radius)',
              cursor: 'pointer',
              fontWeight: 600,
            }}
          >
            Remove Vendor
          </button>
        </form>
      </section>
    </main>
  );
}
