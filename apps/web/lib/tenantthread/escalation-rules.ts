/**
 * Escalation rules for incoming maintenance calls.
 *
 * Classifies maintenance issues by urgency and determines the appropriate
 * response action (page on-call vs. create ticket vs. schedule).
 */

export type UrgencyLevel = 'emergency' | 'urgent' | 'routine' | 'deferred';

export type EscalationAction =
  | 'page_immediately'
  | 'notify_on_call'
  | 'create_ticket'
  | 'schedule_next_business_day';

export interface EscalationDecision {
  urgency: UrgencyLevel;
  action: EscalationAction;
  responseMessage: string;
  targetResolutionHours: number;
}

// Keywords that trigger emergency classification (life/property safety)
const EMERGENCY_KEYWORDS: string[] = [
  'gas leak', 'gas smell', 'smell gas', 'fire', 'flood', 'flooding',
  'smoke', 'no heat', 'heat not working', 'carbon monoxide', 'co detector',
  'sewage backup', 'sewer backup', 'electrical fire', 'sparks',
  'burst pipe', 'pipe burst', 'water pouring', 'ceiling collapse',
  'structural damage', 'break in', 'broken door lock', 'no hot water',
];

// Keywords that trigger urgent classification (major inconvenience, should respond same day)
const URGENT_KEYWORDS: string[] = [
  'no water', 'water not working', 'toilet overflow', 'toilet overflowing',
  'toilet not flushing', 'clogged drain', 'backed up drain',
  'refrigerator not working', 'fridge broken', 'refrigerator broken',
  'no electricity', 'power out', 'ac not working', 'air conditioning',
  'heater not working', 'broken window', 'window broken', 'door not closing',
  'door not locking', 'leak', 'water leak', 'water damage',
  'mold', 'pest', 'cockroach', 'rodent', 'mice', 'rats',
];

// Keywords suggesting routine maintenance (schedule within a week)
const ROUTINE_KEYWORDS: string[] = [
  'dripping faucet', 'faucet drip', 'slow drain', 'cabinet door',
  'light bulb', 'light fixture', 'outlet not working', 'switch not working',
  'patch', 'paint', 'caulk', 'weatherstrip', 'screen', 'blinds', 'curtain rod',
  'dishwasher', 'garbage disposal', 'oven', 'stove', 'washer', 'dryer',
  'ceiling fan', 'bathroom fan', 'exhaust fan', 'thermostat',
];

/**
 * Returns true when the current time is outside 8 AM–6 PM local time (Mon–Fri)
 * or on weekends.
 */
export function isAfterHours(): boolean {
  const now = new Date();
  const hour = now.getHours();
  const day = now.getDay(); // 0 = Sunday, 6 = Saturday
  if (day === 0 || day === 6) return true;
  return hour < 8 || hour >= 18;
}

function containsKeyword(text: string, keywords: string[]): boolean {
  const lower = text.toLowerCase();
  return keywords.some((kw) => lower.includes(kw));
}

/**
 * Classifies a maintenance issue description into an urgency level and
 * returns the full escalation decision including the caller-facing message.
 */
export function classifyIssue(
  description: string,
  afterHours: boolean,
): EscalationDecision {
  if (containsKeyword(description, EMERGENCY_KEYWORDS)) {
    return {
      urgency: 'emergency',
      action: 'page_immediately',
      responseMessage:
        'I have classified this as an emergency. Our on-call maintenance team will be paged right now and should contact you within 30 minutes. If this is a gas leak or fire, please evacuate and call 911 immediately.',
      targetResolutionHours: 1,
    };
  }

  if (containsKeyword(description, URGENT_KEYWORDS)) {
    if (afterHours) {
      return {
        urgency: 'urgent',
        action: 'notify_on_call',
        responseMessage:
          'I have classified this as an urgent issue. Because it is outside business hours, our on-call team has been notified and will contact you within 2 hours.',
        targetResolutionHours: 4,
      };
    }
    return {
      urgency: 'urgent',
      action: 'create_ticket',
      responseMessage:
        'I have classified this as an urgent issue. A work order has been created and our maintenance team will contact you today.',
      targetResolutionHours: 8,
    };
  }

  if (containsKeyword(description, ROUTINE_KEYWORDS)) {
    return {
      urgency: 'routine',
      action: afterHours ? 'create_ticket' : 'create_ticket',
      responseMessage:
        'I have created a routine maintenance work order. Our team will schedule a visit within the next 3 to 5 business days and will send you a confirmation.',
      targetResolutionHours: 72,
    };
  }

  // Default: defer to next business day scheduling
  return {
    urgency: 'deferred',
    action: 'schedule_next_business_day',
    responseMessage:
      'I have logged your maintenance request. Our team will review it and schedule a visit during the next available business day. You will receive a confirmation message.',
    targetResolutionHours: 48,
  };
}

/**
 * Returns a short urgency label suitable for work order display.
 */
export function urgencyLabel(level: UrgencyLevel): string {
  switch (level) {
    case 'emergency':
      return 'EMERGENCY';
    case 'urgent':
      return 'URGENT';
    case 'routine':
      return 'Routine';
    case 'deferred':
      return 'Deferred';
  }
}
