/**
 * Fair Housing Act compliance guard for the TenantThread leasing chat agent.
 *
 * Wraps every LLM response to prevent protected-class reasoning.
 * Per Fair Housing Act (42 U.S.C. § 3604) and HUD regulations.
 * Protected classes: race, color, religion, sex, national origin, familial status, disability.
 */

export interface GuardResult {
  allowed: boolean;
  sanitized_response: string;
  flagged_reason?: string;
}

// Patterns that detect decision-making based on protected class (not mere mention)
const DISCRIMINATORY_DECISION_PATTERNS: Array<{ pattern: RegExp; category: string }> = [
  {
    pattern: /\b(we|i|the property|this community)\s+(prefer|require|only (accept|rent|lease) to|don['']t (rent|lease|accept)|won['']t (rent|lease|accept))\b/i,
    category: 'discriminatory preference/restriction',
  },
  {
    pattern: /\b(not|un)available (for|to)\s+(families|children|pregnant|disabled|immigrants|foreigners)\b/i,
    category: 'availability restriction by protected class',
  },
  {
    pattern: /\bno\s+(children|kids|families with children|disabled (persons?|tenants?|applicants?)|minorities|immigrants)\b/i,
    category: 'explicit protected-class exclusion',
  },
  {
    pattern: /\b(approved|denied|rejected|declined|disqualified)\s+because\s+(of|you are|they are|due to)\s+(your|their)?\s*(race|color|religion|sex|gender|national origin|disability|handicap|familial status|children|pregnancy)\b/i,
    category: 'decision stated as based on protected class',
  },
  {
    pattern: /\bmust (be|identify as|belong to)\s+(a|an)?\s*(christian|muslim|jewish|american|white|black|male|female|able-bodied|childless)\b/i,
    category: 'protected-class requirement',
  },
  {
    pattern: /\bwe (do|don['']t) (rent|lease|accept|show|advertise) to\s+(single (mothers?|fathers?|parents?)|same-sex|gay|lesbian|transgender|non-binary)\b/i,
    category: 'sex/familial status discrimination',
  },
];

// Keywords that, combined with a decision context, indicate a potential violation
const PROTECTED_CLASS_KEYWORDS: Array<{ pattern: RegExp; category: string }> = [
  { pattern: /\b(race|racial|ethnic|ethnicity)\b/i, category: 'race' },
  { pattern: /\b(skin color|complexion)\b/i, category: 'color' },
  { pattern: /\b(religion|church|mosque|synagogue|temple|denomination)\b/i, category: 'religion' },
  { pattern: /\b(sex|gender|male|female|woman|man|transgender|non-?binary)\b/i, category: 'sex' },
  { pattern: /\b(national origin|immigrant|immigration|citizenship|foreign.born)\b/i, category: 'national origin' },
  { pattern: /\b(familial status|pregnant|pregnancy|children|kids|nursing|lactating)\b/i, category: 'familial status' },
  { pattern: /\b(disability|disabled|handicap(ped)?|wheelchair|mental illness|chronic illness|impairment)\b/i, category: 'disability' },
];

const DECISION_WORDS = [
  'cannot', 'can not', "won't", 'will not', "don't allow", 'do not allow',
  'prefer', 'required', 'must be', 'not suitable', 'not available for',
  'not accepting', 'not approved', 'denied', 'rejected', 'excluded', 'prohibited',
  'restricted to', 'only accept', 'only rent', 'only lease',
];

const HUMAN_ESCALATION_SUFFIX =
  '\n\nA human leasing agent is always available to assist you — just reply HUMAN or click "Connect to agent" at any time.';

const REDIRECT_RESPONSE =
  "I'm here to help you find a home based on your needs, preferences, and financial qualifications. " +
  "We evaluate all applications based on income, credit history, and rental history — we do not consider personal characteristics. " +
  HUMAN_ESCALATION_SUFFIX;

export function checkUserMessage(message: string): { flagged: boolean; reason?: string } {
  const lower = message.toLowerCase();

  for (const { pattern, category } of PROTECTED_CLASS_KEYWORDS) {
    if (pattern.test(message)) {
      // Only flag if combined with language suggesting a policy question about discrimination
      const policyPhrases = [
        'do you accept', 'can i live', 'will you rent', 'do you allow',
        'are you ok with', 'policy on', 'rules about', 'restrictions on',
        'do you discriminate', 'allowed to', 'permitted to',
      ];
      if (policyPhrases.some(p => lower.includes(p))) {
        return {
          flagged: true,
          reason: `Protected class policy inquiry: ${category}`,
        };
      }
    }
  }

  return { flagged: false };
}

export function guardResponse(response: string): GuardResult {
  // Check for explicit discriminatory decision patterns first
  for (const { pattern, category } of DISCRIMINATORY_DECISION_PATTERNS) {
    if (pattern.test(response)) {
      console.warn(`[fair-housing-guard] Blocked response — ${category}`);
      return {
        allowed: false,
        sanitized_response: REDIRECT_RESPONSE,
        flagged_reason: `Discriminatory decision pattern detected: ${category}`,
      };
    }
  }

  // Check for protected-class keywords combined with decision language
  const lowerResponse = response.toLowerCase();
  for (const { pattern, category } of PROTECTED_CLASS_KEYWORDS) {
    if (pattern.test(response)) {
      const hasDecisionWord = DECISION_WORDS.some(w => lowerResponse.includes(w));
      if (hasDecisionWord) {
        console.warn(`[fair-housing-guard] Blocked response — protected class + decision word: ${category}`);
        return {
          allowed: false,
          sanitized_response: REDIRECT_RESPONSE,
          flagged_reason: `Protected class decision language detected: ${category}`,
        };
      }
    }
  }

  return { allowed: true, sanitized_response: response };
}

export function appendHumanEscalationNote(response: string): string {
  if (response.includes('HUMAN') || response.includes('human leasing agent')) {
    return response;
  }
  return response + HUMAN_ESCALATION_SUFFIX;
}

export function buildFairHousingDisclaimer(): string {
  return (
    'TenantThread is an equal opportunity housing provider. ' +
    'We do not discriminate on the basis of race, color, religion, sex, ' +
    'national origin, familial status, or disability, in compliance with ' +
    'the Fair Housing Act (42 U.S.C. § 3604).'
  );
}
