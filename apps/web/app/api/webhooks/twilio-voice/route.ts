/**
 * POST /api/webhooks/twilio-voice — Twilio Voice webhook receiver.
 *
 * Drives a stateful maintenance call triage conversation using TwiML.
 * Call flow:
 *   1. Initial call → greet caller, ask for unit number
 *   2. ?stage=unit  → confirm unit, ask for issue description
 *   3. ?stage=issue → classify urgency, create work order, confirm to caller
 *
 * Security: validates the X-Twilio-Signature header using TWILIO_AUTH_TOKEN.
 * In dev (no token set) validation is skipped. Request body is form-encoded
 * (application/x-www-form-urlencoded) — never JSON.
 */

import { NextResponse } from 'next/server';
import crypto from 'crypto';
import {
  getCallRecord,
  createCallRecord,
  updateCallRecord,
  lookupPropertyByPhone,
  buildGreetingTwiML,
  buildGatherIssueTwiML,
  buildCompletionTwiML,
  buildErrorTwiML,
  buildRetryTwiML,
} from '@/lib/tenantthread/voice-agent';
import { classifyIssue, isAfterHours } from '@/lib/tenantthread/escalation-rules';
import { createWorkOrder } from '@/lib/tenantthread/work-order-creator';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs'; // needs pg + crypto

// ── Twilio signature validation ───────────────────────────────────────────────

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
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

function twimlResponse(xml: string): NextResponse {
  return new NextResponse(xml, {
    status: 200,
    headers: { 'Content-Type': 'text/xml; charset=utf-8' },
  });
}

// ── Resolve the public URL for this request (needed for action URLs) ──────────

function resolveBaseUrl(request: Request): string {
  const explicit = process.env.APP_BASE_URL;
  if (explicit) return explicit.replace(/\/+$/, '');
  const host = request.headers.get('host') ?? '';
  const proto = request.headers.get('x-forwarded-proto') ?? 'https';
  return `${proto}://${host}`;
}

// ── Main handler ──────────────────────────────────────────────────────────────

export async function POST(request: Request): Promise<NextResponse> {
  const rawBody = await request.text();

  // Parse URL query for stage routing
  const requestUrl = new URL(request.url);
  const stage = requestUrl.searchParams.get('stage') ?? 'init';

  // Parse form-encoded Twilio payload
  const params: Record<string, string> = {};
  for (const [key, val] of new URLSearchParams(rawBody)) {
    params[key] = val;
  }

  const callSid = params['CallSid'] ?? '';
  const fromNumber = params['From'] ?? '';
  const toNumber = params['To'] ?? '';
  const speechResult = (params['SpeechResult'] ?? '').trim();
  const digits = (params['Digits'] ?? '').trim();
  const userInput = speechResult || digits;

  // Validate Twilio signature when auth token is configured
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (authToken) {
    const signature = request.headers.get('x-twilio-signature') ?? '';
    // Build the canonical URL (strip query string for signature validation)
    const canonicalUrl = `${resolveBaseUrl(request)}/api/webhooks/twilio-voice`;
    // Merge query params into the params map for signature validation
    const allParams: Record<string, string> = { ...params };
    for (const [key, val] of requestUrl.searchParams) {
      allParams[key] = val;
    }
    let valid = false;
    try {
      valid = validateTwilioSignature(authToken, signature, canonicalUrl, allParams);
    } catch {
      valid = false;
    }
    if (!valid) {
      return new NextResponse('Forbidden', { status: 403 });
    }
  }

  if (!callSid) {
    return twimlResponse(buildErrorTwiML());
  }

  const baseUrl = resolveBaseUrl(request);
  const webhookBase = `${baseUrl}/api/webhooks/twilio-voice`;

  try {
    // ── Stage: init — first call, greet + ask for unit number ────────────────
    if (stage === 'init') {
      const property = await lookupPropertyByPhone(toNumber);
      await createCallRecord(
        callSid,
        fromNumber,
        toNumber,
        property?.id ?? null,
        property?.name ?? null,
      );
      const actionUrl = `${webhookBase}?stage=unit&callSid=${encodeURIComponent(callSid)}`;
      return twimlResponse(buildGreetingTwiML(property?.name ?? null, actionUrl));
    }

    // ── Stage: unit — caller provided unit number ─────────────────────────────
    if (stage === 'unit') {
      if (!userInput) {
        const retryUrl = `${webhookBase}?stage=unit&callSid=${encodeURIComponent(callSid)}`;
        return twimlResponse(buildRetryTwiML(retryUrl));
      }

      const unitNumber = userInput.replace(/[^a-zA-Z0-9\-]/g, '').slice(0, 20) || userInput.slice(0, 20);
      await updateCallRecord(callSid, { unit_number: unitNumber, stage: 'gather_unit' });

      const actionUrl = `${webhookBase}?stage=issue&callSid=${encodeURIComponent(callSid)}`;
      return twimlResponse(buildGatherIssueTwiML(unitNumber, actionUrl));
    }

    // ── Stage: issue — caller described the maintenance issue ─────────────────
    if (stage === 'issue') {
      if (!userInput) {
        const retryUrl = `${webhookBase}?stage=issue&callSid=${encodeURIComponent(callSid)}`;
        return twimlResponse(buildRetryTwiML(retryUrl));
      }

      // Fetch call record for context
      const callRecord = await getCallRecord(callSid);
      const propertyId = callRecord?.property_id ?? null;
      const unitNumber = callRecord?.unit_number ?? null;

      const afterHours = isAfterHours();
      const decision = classifyIssue(userInput, afterHours);

      const workOrder = await createWorkOrder({
        propertyId,
        unitNumber,
        reporterPhone: fromNumber,
        issueDescription: userInput,
        priority: decision.urgency,
        callSid,
        notes: `Inbound voice call. After-hours: ${afterHours}. Action: ${decision.action}.`,
      });

      await updateCallRecord(callSid, {
        issue_description: userInput,
        stage: 'completed',
        work_order_id: workOrder.id,
      });

      return twimlResponse(buildCompletionTwiML(decision, workOrder.work_order_number));
    }

    // Unknown stage
    return twimlResponse(buildErrorTwiML());
  } catch (err) {
    console.error('[twilio-voice] unhandled error:', err);
    return twimlResponse(buildErrorTwiML());
  }
}
