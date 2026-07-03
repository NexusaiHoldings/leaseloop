'use server';

/**
 * TenantThread leasing chat agent — LLM loop with fair-housing guard.
 *
 * Marked 'use server' so Next.js 14 exposes these as Server Actions
 * callable from the 'use client' chat page. Also safe to import directly
 * from server-side route handlers (twilio-sms webhook).
 */

import { Pool } from 'pg';
import { cookies } from 'next/headers';
import { guardResponse, checkUserMessage, appendHumanEscalationNote } from './fair-housing-guard';
import { bookTour, getCalendlyAvailability } from './tour-scheduler';
import { qualifyProspect, upsertLead, updateLeadInfo } from '../agent-tools/qualify_leasing_prospect';
import { searchPropertyContext } from './property-context';

let _pool: Pool | null = null;

function getPool(): Pool {
  if (!_pool) {
    _pool = new Pool({ connectionString: process.env.DATABASE_URL });
  }
  return _pool;
}

export interface ChatMessage {
  id: string;
  lead_id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
}

export interface WebChatSession {
  leadId: string;
  messages: ChatMessage[];
}

const SYSTEM_PROMPT = `You are a professional, friendly leasing agent for TenantThread property management.

Your role:
- Answer questions about available units, lease terms, amenities, pet policies, parking, utilities, and the application process
- Qualify prospective tenants by naturally gathering: full name, email address, desired move-in date, preferred unit type (studio/1BR/2BR/3BR), and monthly budget
- Offer to schedule a property tour once you have gathered basic qualification information
- Provide honest, helpful information grounded in available property details

FAIR HOUSING — MANDATORY COMPLIANCE:
- NEVER make statements or decisions based on race, color, religion, sex, national origin, familial status, or disability
- NEVER indicate a preference for or against any protected class
- If asked about discriminatory criteria, redirect to financial qualifications (income, credit, rental history) only
- Always remind prospects that a human leasing agent is available

CONVERSATION STYLE:
- Keep SMS responses under 160 characters when possible; web responses can be 2-4 sentences
- Ask one qualifying question at a time — don't overwhelm
- When the prospect seems ready (has provided name, contact, budget, timeline), offer to schedule a tour
- End every message with a clear next step or question

When a prospect wants to schedule a tour, ask for their preferred date/time and email address so you can send a confirmation.
If you don't know a specific detail about the property, acknowledge it and offer to have a human agent follow up.`;

async function saveMessage(
  leadId: string,
  role: 'user' | 'assistant',
  content: string,
): Promise<void> {
  const pool = getPool();
  try {
    await pool.query(
      `INSERT INTO tt_chat_messages (lead_id, role, content) VALUES ($1, $2, $3)`,
      [leadId, role, content],
    );
  } catch (err) {
    console.error('[chat-agent] saveMessage error:', err);
  }
}

async function loadHistory(leadId: string, limit = 20): Promise<ChatMessage[]> {
  const pool = getPool();
  try {
    const result = await pool.query<ChatMessage>(
      `SELECT id, lead_id, role, content, created_at
       FROM tt_chat_messages WHERE lead_id = $1
       ORDER BY created_at DESC LIMIT $2`,
      [leadId, limit],
    );
    return result.rows.reverse();
  } catch {
    return [];
  }
}

async function callLLM(
  history: Array<{ role: string; content: string }>,
  contextSnippets: string[],
  propertyName?: string,
): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return (
      "Welcome! I'm your TenantThread leasing assistant. I'd love to help you find the right home. " +
      'Could you start by telling me a bit about what you\'re looking for?'
    );
  }

  const contextSection =
    contextSnippets.length > 0
      ? `\n\nPROPERTY CONTEXT (use this to answer questions accurately):\n${contextSnippets.slice(0, 3).join('\n---\n')}`
      : '';

  const propertySection = propertyName ? `\n\nPROPERTY NAME: ${propertyName}` : '';

  const systemWithContext = SYSTEM_PROMPT + propertySection + contextSection;

  const anthropicMessages = history
    .filter(m => m.role === 'user' || m.role === 'assistant')
    .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }));

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 512,
        system: systemWithContext,
        messages: anthropicMessages,
      }),
    });

    if (!response.ok) {
      console.error('[chat-agent] Anthropic API error:', response.status);
      return "I'm having a moment of trouble responding. Please try again, or reply HUMAN to speak with our leasing team.";
    }

    const data = (await response.json()) as {
      content: Array<{ type: string; text: string }>;
    };
    return data.content.find(b => b.type === 'text')?.text ?? 'How can I help you today?';
  } catch (err) {
    console.error('[chat-agent] callLLM error:', err);
    return "I'm temporarily unavailable. Please try again shortly or reply HUMAN to connect with our team.";
  }
}

function extractLeadUpdates(
  message: string,
): Partial<Parameters<typeof updateLeadInfo>[1]> {
  const updates: Partial<Parameters<typeof updateLeadInfo>[1]> = {};

  const emailMatch = message.match(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/);
  if (emailMatch) updates.email = emailMatch[0].toLowerCase();

  const budgetMatch = message.match(/\$?\s*(\d{3,4})\s*(?:to|[-–])\s*\$?\s*(\d{3,4})/);
  if (budgetMatch) {
    updates.budget_min = parseInt(budgetMatch[1], 10);
    updates.budget_max = parseInt(budgetMatch[2], 10);
  } else {
    const singleBudget = message.match(/\$\s*(\d{3,4})\b/);
    if (singleBudget) {
      updates.budget_max = parseInt(singleBudget[1], 10);
    }
  }

  const unitMatch = message.match(
    /\b(studio|one|1|two|2|three|3|four|4)\s*[-\s]?(?:bedroom|bed|br|ba)\b/i,
  );
  if (unitMatch) updates.desired_unit_type = unitMatch[0].toLowerCase();

  const dateMatch = message.match(
    /\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})\b|\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2}(?:,?\s*\d{4})?\b/i,
  );
  if (dateMatch) {
    const parsed = new Date(dateMatch[0]);
    if (!isNaN(parsed.getTime())) {
      updates.desired_move_in = parsed.toISOString().split('T')[0];
    }
  }

  return updates;
}

async function checkTourIntent(message: string): Promise<boolean> {
  const tourKeywords = [
    'tour', 'visit', 'see the', 'show me', 'come by', 'schedule',
    'appointment', 'viewing', 'walk through', 'walkthrough',
  ];
  const lower = message.toLowerCase();
  return tourKeywords.some(kw => lower.includes(kw));
}

export async function processIncomingSMS(
  fromNumber: string,
  body: string,
  propertyId?: string,
): Promise<string> {
  // Human escalation bypass
  if (/^human\b/i.test(body.trim())) {
    return (
      'Connecting you to a leasing agent now. Our team will respond within one business day. ' +
      'You can also call us directly at the number on our website.'
    );
  }

  const leadId = await upsertLead({
    phoneNumber: fromNumber,
    propertyId,
    channel: 'sms',
  });

  const flaggedMsg = checkUserMessage(body);
  if (flaggedMsg.flagged) {
    const guardedReply =
      'We evaluate applicants based on financial qualifications — income, credit history, ' +
      'and rental history. We do not consider personal characteristics. A leasing agent is ' +
      'happy to answer your questions — reply HUMAN to connect.';
    await saveMessage(leadId, 'user', body);
    await saveMessage(leadId, 'assistant', guardedReply);
    return guardedReply;
  }

  const history = await loadHistory(leadId, 15);
  const extracted = extractLeadUpdates(body);
  if (Object.keys(extracted).length > 0) {
    await updateLeadInfo(leadId, extracted);
  }

  let contextSnippets: string[] = [];
  if (propertyId) {
    try {
      const chunks = await searchPropertyContext(propertyId, body, 3);
      contextSnippets = chunks.map(c => c.chunk_text);
    } catch {
      // RAG unavailable — continue without context
    }
  }

  const historyForLLM = [
    ...history.map(m => ({ role: m.role, content: m.content })),
    { role: 'user', content: body },
  ];

  const rawReply = await callLLM(historyForLLM, contextSnippets);
  const guardResult = guardResponse(rawReply);
  const finalReply = appendHumanEscalationNote(guardResult.sanitized_response);

  await saveMessage(leadId, 'user', body);
  await saveMessage(leadId, 'assistant', finalReply);

  const qualification = await qualifyProspect(leadId);
  if (qualification.score >= 65) {
    const wantsToTour = await checkTourIntent(body);
    if (wantsToTour && extracted.email) {
      const slots = await getCalendlyAvailability(
        new Date().toISOString(),
        new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
      );
      if (slots.length > 0) {
        await bookTour({
          leadId,
          propertyId,
          startTime: slots[0].start_time,
          name: 'SMS Prospect',
          email: extracted.email,
          phone: fromNumber,
        });
      }
    }
  }

  const pool = getPool();
  await pool.query(
    `UPDATE tt_leasing_leads SET conversation_summary = $1, updated_at = now() WHERE id = $2`,
    [qualification.summary, leadId],
  );

  return finalReply;
}

export async function initWebSession(): Promise<WebChatSession> {
  const cookieStore = cookies();
  const existingLeadId = cookieStore.get('tt_lead_id')?.value;

  if (existingLeadId) {
    const messages = await loadHistory(existingLeadId, 30);
    return { leadId: existingLeadId, messages };
  }

  const leadId = await upsertLead({ channel: 'web' });
  cookieStore.set('tt_lead_id', leadId, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 30,
    path: '/',
  });

  const greeting =
    "Hi! I'm your TenantThread leasing assistant. I'm here to help you find the perfect home " +
    "and answer any questions about our properties. What are you looking for?";

  await saveMessage(leadId, 'assistant', greeting);

  return {
    leadId,
    messages: [
      {
        id: 'init',
        lead_id: leadId,
        role: 'assistant',
        content: greeting,
        created_at: new Date().toISOString(),
      },
    ],
  };
}

export async function sendWebMessage(
  message: string,
): Promise<{ response: string; leadId: string }> {
  const cookieStore = cookies();
  let leadId = cookieStore.get('tt_lead_id')?.value;

  if (!leadId) {
    leadId = await upsertLead({ channel: 'web' });
    cookieStore.set('tt_lead_id', leadId, {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30,
      path: '/',
    });
  }

  if (/^human\b/i.test(message.trim())) {
    const reply =
      'Connecting you to a human leasing agent. Our team will follow up with you shortly. ' +
      'You can also visit our leasing office or give us a call — details are on the Contact page.';
    await saveMessage(leadId, 'user', message);
    await saveMessage(leadId, 'assistant', reply);
    return { response: reply, leadId };
  }

  const flaggedMsg = checkUserMessage(message);
  if (flaggedMsg.flagged) {
    const reply =
      'We evaluate all applications on financial qualifications (income, credit, rental history) ' +
      'and do not consider personal characteristics. A human leasing agent can walk you through ' +
      'the full application process — click "Connect to agent" below.';
    await saveMessage(leadId, 'user', message);
    await saveMessage(leadId, 'assistant', reply);
    return { response: reply, leadId };
  }

  const extracted = extractLeadUpdates(message);
  if (Object.keys(extracted).length > 0) {
    await updateLeadInfo(leadId, extracted);
  }

  const history = await loadHistory(leadId, 20);
  const historyForLLM = [
    ...history.map(m => ({ role: m.role, content: m.content })),
    { role: 'user', content: message },
  ];

  const rawReply = await callLLM(historyForLLM, []);
  const guardResult = guardResponse(rawReply);
  const finalReply = guardResult.sanitized_response;

  await saveMessage(leadId, 'user', message);
  await saveMessage(leadId, 'assistant', finalReply);

  await qualifyProspect(leadId);

  return { response: finalReply, leadId };
}

export async function loadWebHistory(): Promise<WebChatSession | null> {
  const cookieStore = cookies();
  const leadId = cookieStore.get('tt_lead_id')?.value;
  if (!leadId) return null;
  const messages = await loadHistory(leadId, 30);
  return { leadId, messages };
}
