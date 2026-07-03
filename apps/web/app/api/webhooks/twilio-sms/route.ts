/**
 * POST /api/webhooks/twilio-sms — Twilio Programmable SMS inbound webhook.
 *
 * Receives an incoming SMS, runs it through the TenantThread leasing chat
 * agent, and returns a TwiML <Message> response so Twilio delivers the reply.
 *
 * Security: validates X-Twilio-Signature with TWILIO_AUTH_TOKEN when set.
 * Body is form-encoded (application/x-www-form-urlencoded), not JSON.
 */

import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { processIncomingSMS } from '@/lib/tenantthread/chat-agent';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function validateTwilioSignature(
  authToken: string,
  signature: string,
  url: string,
  params: Record<string, string>,
): boolean {
  const sortedKeys = Object.keys(params).sort();
  let toSign = url;
  for (const key of sortedKeys) {
    toSign += key + (params[key] ?? '');
  }
  const expected = crypto
    .createHmac('sha1', authToken)
    .update(Buffer.from(toSign, 'utf-8'))
    .digest('base64');
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}

function resolveBaseUrl(request: Request): string {
  const explicit = process.env.APP_BASE_URL;
  if (explicit) return explicit.replace(/\/+$/, '');
  const host = request.headers.get('host') ?? '';
  const proto = request.headers.get('x-forwarded-proto') ?? 'https';
  return `${proto}://${host}`;
}

function smsResponse(body: string): NextResponse {
  const escaped = body
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  const twiml = `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escaped}</Message></Response>`;
  return new NextResponse(twiml, {
    status: 200,
    headers: { 'Content-Type': 'text/xml; charset=utf-8' },
  });
}

export async function POST(request: Request): Promise<NextResponse> {
  const rawBody = await request.text();

  const params: Record<string, string> = {};
  for (const [key, val] of new URLSearchParams(rawBody)) {
    params[key] = val;
  }

  const from = params['From'] ?? '';
  const to = params['To'] ?? '';
  const body = (params['Body'] ?? '').trim();
  const messageSid = params['MessageSid'] ?? '';

  if (!from || !body) {
    return new NextResponse('Bad Request', { status: 400 });
  }

  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (authToken) {
    const signature = request.headers.get('x-twilio-signature') ?? '';
    const canonicalUrl = `${resolveBaseUrl(request)}/api/webhooks/twilio-sms`;
    if (!validateTwilioSignature(authToken, signature, canonicalUrl, params)) {
      console.warn('[twilio-sms] Signature validation failed', { messageSid });
      return new NextResponse('Forbidden', { status: 403 });
    }
  }

  // Resolve property by inbound Twilio number (best-effort)
  let propertyId: string | undefined;
  if (to) {
    try {
      const { Pool } = await import('pg');
      const pool = new Pool({ connectionString: process.env.DATABASE_URL });
      const result = await pool.query<{ id: string }>(
        'SELECT id FROM properties WHERE maintenance_phone = $1 LIMIT 1',
        [to],
      );
      propertyId = result.rows[0]?.id;
      await pool.end();
    } catch {
      // Property lookup is best-effort; continue without it
    }
  }

  let reply: string;
  try {
    reply = await processIncomingSMS(from, body, propertyId);
  } catch (err) {
    console.error('[twilio-sms] processIncomingSMS error:', err);
    reply =
      "I'm sorry, I encountered a technical issue. Please try again or reply HUMAN to connect with our leasing team.";
  }

  return smsResponse(reply);
}
