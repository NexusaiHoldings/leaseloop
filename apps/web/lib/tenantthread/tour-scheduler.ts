/**
 * Tour scheduling via Calendly for TenantThread leasing agent.
 *
 * Checks availability, books tours, and handles cancellations.
 * Also provides the Calendly webhook event handler.
 */

import { Pool } from 'pg';

let _pool: Pool | null = null;

function getPool(): Pool {
  if (!_pool) {
    _pool = new Pool({ connectionString: process.env.DATABASE_URL });
  }
  return _pool;
}

export interface AvailabilitySlot {
  start_time: string;
  end_time: string;
  scheduling_url: string;
  event_type_uri: string;
  invitees_remaining: number;
}

export interface TourBooking {
  id: string;
  lead_id: string;
  calendly_event_uri: string | null;
  calendly_invitee_uri: string | null;
  scheduled_at: Date | null;
  status: string;
  property_id: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface CalendlyWebhookEvent {
  event: string;
  payload: {
    event?: { uri?: string };
    invitee?: { uri?: string; name?: string; email?: string };
    event_type?: { uri?: string };
    scheduled_event?: { start_time?: string; uri?: string };
    cancellation?: { reason?: string };
  };
}

export async function getCalendlyAvailability(
  startTime: string,
  endTime: string,
  eventTypeUri?: string,
): Promise<AvailabilitySlot[]> {
  const apiKey = process.env.CALENDLY_API_KEY;
  const resolvedEventTypeUri = eventTypeUri ?? process.env.CALENDLY_EVENT_TYPE_URI;
  if (!apiKey || !resolvedEventTypeUri) {
    return [];
  }

  try {
    const params = new URLSearchParams({
      event_type: resolvedEventTypeUri,
      start_time: startTime,
      end_time: endTime,
    });
    const response = await fetch(
      `https://api.calendly.com/event_type_available_times?${params.toString()}`,
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
      },
    );
    if (!response.ok) {
      console.error('[tour-scheduler] Calendly availability fetch failed:', response.status);
      return [];
    }
    const data = (await response.json()) as {
      collection: Array<{
        start_time: string;
        end_time: string;
        scheduling_url: string;
        invitees_remaining: number;
      }>;
    };
    return data.collection
      .filter(slot => slot.invitees_remaining > 0)
      .map(slot => ({
        start_time: slot.start_time,
        end_time: slot.end_time,
        scheduling_url: slot.scheduling_url,
        event_type_uri: resolvedEventTypeUri,
        invitees_remaining: slot.invitees_remaining,
      }));
  } catch (err) {
    console.error('[tour-scheduler] getCalendlyAvailability error:', err);
    return [];
  }
}

export async function bookTour(params: {
  leadId: string;
  propertyId?: string;
  startTime: string;
  name: string;
  email: string;
  phone?: string;
  eventTypeUri?: string;
}): Promise<TourBooking> {
  const pool = getPool();
  const apiKey = process.env.CALENDLY_API_KEY;
  const eventTypeUri = params.eventTypeUri ?? process.env.CALENDLY_EVENT_TYPE_URI ?? '';

  let calendlyEventUri: string | null = null;
  let calendlyInviteeUri: string | null = null;

  if (apiKey && eventTypeUri) {
    try {
      const response = await fetch('https://api.calendly.com/one_off_event_types', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: `Property Tour — ${params.name}`,
          host: process.env.CALENDLY_USER_URI ?? '',
          duration: 30,
          timezone: 'America/New_York',
          date_setting: { type: 'date_range', start_date: params.startTime.split('T')[0], end_date: params.startTime.split('T')[0] },
          location: { kind: 'physical', location: 'Property Address — confirmed by leasing agent' },
        }),
      });
      if (response.ok) {
        const data = (await response.json()) as { resource?: { scheduling_url?: string; uri?: string } };
        calendlyEventUri = data.resource?.uri ?? null;
      }
    } catch (err) {
      console.error('[tour-scheduler] Calendly bookTour error:', err);
    }
  }

  const result = await pool.query<TourBooking>(
    `INSERT INTO tt_tour_bookings
       (lead_id, calendly_event_uri, calendly_invitee_uri, scheduled_at, status, property_id)
     VALUES ($1, $2, $3, $4, 'confirmed', $5)
     RETURNING *`,
    [
      params.leadId,
      calendlyEventUri,
      calendlyInviteeUri,
      params.startTime ? new Date(params.startTime) : null,
      params.propertyId ?? null,
    ],
  );

  const booking = result.rows[0];

  await pool.query(
    `UPDATE tt_leasing_leads
     SET tour_booking_id = $1, tour_status = 'booked', updated_at = now()
     WHERE id = $2`,
    [booking.id, params.leadId],
  );

  return booking;
}

export async function cancelTour(bookingId: string): Promise<void> {
  const pool = getPool();
  const apiKey = process.env.CALENDLY_API_KEY;

  const bookingResult = await pool.query<{ calendly_event_uri: string | null; lead_id: string }>(
    'SELECT calendly_event_uri, lead_id FROM tt_tour_bookings WHERE id = $1',
    [bookingId],
  );
  const booking = bookingResult.rows[0];
  if (!booking) return;

  if (apiKey && booking.calendly_event_uri) {
    try {
      await fetch(`${booking.calendly_event_uri}/cancellation`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ reason: 'Cancelled via TenantThread leasing portal' }),
      });
    } catch (err) {
      console.error('[tour-scheduler] cancelTour Calendly error:', err);
    }
  }

  await pool.query(
    `UPDATE tt_tour_bookings SET status = 'cancelled', updated_at = now() WHERE id = $1`,
    [bookingId],
  );
  await pool.query(
    `UPDATE tt_leasing_leads SET tour_status = 'cancelled', updated_at = now() WHERE id = $1`,
    [booking.lead_id],
  );
}

export async function getTourBooking(bookingId: string): Promise<TourBooking | null> {
  const pool = getPool();
  try {
    const result = await pool.query<TourBooking>(
      'SELECT * FROM tt_tour_bookings WHERE id = $1',
      [bookingId],
    );
    return result.rows[0] ?? null;
  } catch {
    return null;
  }
}

export async function handleCalendlyWebhook(event: CalendlyWebhookEvent): Promise<void> {
  const pool = getPool();

  const eventUri =
    event.payload.scheduled_event?.uri ?? event.payload.event?.uri ?? null;

  if (!eventUri) return;

  if (event.event === 'invitee.created') {
    const startTime = event.payload.scheduled_event?.start_time;
    await pool.query(
      `UPDATE tt_tour_bookings
       SET status = 'confirmed', scheduled_at = $1, updated_at = now()
       WHERE calendly_event_uri = $2`,
      [startTime ? new Date(startTime) : null, eventUri],
    );

    const bookingResult = await pool.query<{ lead_id: string }>(
      'SELECT lead_id FROM tt_tour_bookings WHERE calendly_event_uri = $1 LIMIT 1',
      [eventUri],
    );
    if (bookingResult.rows[0]) {
      await pool.query(
        `UPDATE tt_leasing_leads SET tour_status = 'booked', updated_at = now() WHERE id = $1`,
        [bookingResult.rows[0].lead_id],
      );
    }
  } else if (event.event === 'invitee.canceled') {
    await pool.query(
      `UPDATE tt_tour_bookings SET status = 'cancelled', updated_at = now()
       WHERE calendly_event_uri = $1`,
      [eventUri],
    );

    const bookingResult = await pool.query<{ lead_id: string }>(
      'SELECT lead_id FROM tt_tour_bookings WHERE calendly_event_uri = $1 LIMIT 1',
      [eventUri],
    );
    if (bookingResult.rows[0]) {
      await pool.query(
        `UPDATE tt_leasing_leads SET tour_status = 'cancelled', updated_at = now() WHERE id = $1`,
        [bookingResult.rows[0].lead_id],
      );
    }
  } else if (event.event === 'invitee_no_show.created') {
    await pool.query(
      `UPDATE tt_tour_bookings SET status = 'no_show', updated_at = now()
       WHERE calendly_event_uri = $1`,
      [eventUri],
    );
  }
}
