/**
 * POST /api/webhooks/calendly — Calendly webhook receiver.
 *
 * Handles tour booking lifecycle events: invitee.created (tour confirmed),
 * invitee.canceled (tour cancelled), invitee_no_show.created (no-show).
 *
 * Security: validates X-Calendly-Webhook-Signature when CALENDLY_WEBHOOK_SECRET is set.
 */

import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { handleCalendlyWebhook, type CalendlyWebhookEvent } from '@/lib/tenantthread/tour-scheduler';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function validateCalendlySignature(
  secret: string,
  signature: string,
  rawBody: string,
): boolean {
  try {
    const expected = crypto
      .createHmac('sha256', secret)
      .update(rawBody, 'utf-8')
      .digest('hex');
    const sigHex = signature.replace(/^sha256=/, '');
    return crypto.timingSafeEqual(
      Buffer.from(expected, 'hex'),
      Buffer.from(sigHex, 'hex'),
    );
  } catch {
    return false;
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  const rawBody = await request.text();

  const webhookSecret = process.env.CALENDLY_WEBHOOK_SECRET;
  if (webhookSecret) {
    const signature = request.headers.get('x-calendly-webhook-signature') ?? '';
    if (!validateCalendlySignature(webhookSecret, signature, rawBody)) {
      console.warn('[calendly] Webhook signature validation failed');
      return new NextResponse('Forbidden', { status: 403 });
    }
  }

  let event: CalendlyWebhookEvent;
  try {
    event = JSON.parse(rawBody) as CalendlyWebhookEvent;
  } catch {
    return new NextResponse('Bad Request: invalid JSON', { status: 400 });
  }

  const supportedEvents = ['invitee.created', 'invitee.canceled', 'invitee_no_show.created'];
  if (!supportedEvents.includes(event.event)) {
    return NextResponse.json({ ok: true, ignored: true });
  }

  try {
    await handleCalendlyWebhook(event);
  } catch (err) {
    console.error('[calendly] handleCalendlyWebhook error:', err);
    return new NextResponse('Internal Server Error', { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
