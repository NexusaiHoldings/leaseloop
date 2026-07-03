/**
 * home-config — the company's root surface (company-root-landing-001 +
 * homepage-composition-001). Written by provisioning (_step_substrate_install)
 * from the homepage composer / CTO home_mode + CMO positioning. Do NOT hand-edit.
 */
export interface HomeCta {
  label: string;
  href: string;
}

export interface HomeFeature {
  title: string;
  body: string;
}

export interface SectionImage {
  url?: string;
  alt?: string;
  caption?: string;
}

export interface HeroSection {
  type: "hero";
  eyebrow?: string;
  headline: string;
  subhead?: string;
  primaryCta?: HomeCta;
  secondaryCta?: HomeCta;
  image?: SectionImage;
}
export interface StatsSection {
  type: "stats";
  title?: string;
  stats: { value: string; label: string }[];
}
export interface HowItWorksSection {
  type: "how_it_works";
  title?: string;
  subhead?: string;
  steps: { title: string; body: string }[];
}
export interface FeatureGridSection {
  type: "feature_grid";
  title?: string;
  subhead?: string;
  features: HomeFeature[];
}
export interface FeatureSpotlightSection {
  type: "feature_spotlight";
  title?: string;
  items: { title: string; body: string; image?: SectionImage }[];
}
export interface SocialProofSection {
  type: "social_proof";
  title?: string;
  quotes: { quote: string; author?: string; role?: string }[];
}
export interface FaqSection {
  type: "faq";
  title?: string;
  items: { q: string; a: string }[];
}
export interface PricingTeaserSection {
  type: "pricing_teaser";
  title?: string;
  subhead?: string;
  tiers: {
    name: string;
    price?: string;
    period?: string;
    features: string[];
    cta?: HomeCta;
    highlighted?: boolean;
  }[];
}
export interface GallerySection {
  type: "gallery";
  title?: string;
  images: SectionImage[];
}
export interface CtaBandSection {
  type: "cta_band";
  headline: string;
  subhead?: string;
  cta?: HomeCta;
}

export type HomeSection =
  | HeroSection
  | StatsSection
  | HowItWorksSection
  | FeatureGridSection
  | FeatureSpotlightSection
  | SocialProofSection
  | FaqSection
  | PricingTeaserSection
  | GallerySection
  | CtaBandSection;

export interface HomeConfig {
  mode: "landing" | "conversation";
  sections?: HomeSection[];
  headline?: string;
  subhead?: string;
  primaryCta?: HomeCta;
  secondaryCta?: HomeCta;
  featuresTitle?: string;
  features?: HomeFeature[];
  closingHeadline?: string;
}

export const homeConfig: HomeConfig = {
  "mode": "landing",
  "headline": "Stop Losing Tenants and Staff to Missed Calls \u2014 Your AI Property Manager Never Sleeps",
  "subhead": "TenantThread deploys AI voice and chat agents that autonomously handle inbound tenant communications \u2014 maintenance triage, leasing inquiries, and rent payment questions \u2014 24/7 without human staff involvement, purpose-built for regional\u2026",
  "sections": [
    {
      "type": "hero",
      "headline": "Every tenant call answered. Every work order filed. Always.",
      "eyebrow": "AI-powered tenant communication for multifamily",
      "subhead": "TenantThread deploys AI voice and chat agents that handle maintenance triage, leasing questions, and tour scheduling around the clock \u2014 so your lean team wakes up to resolved tickets, not missed calls.",
      "primaryCta": {
        "label": "Request a pilot",
        "href": "/chat"
      },
      "secondaryCta": {
        "label": "See how it works",
        "href": "#how-it-works"
      },
      "image": {
        "url": "hero_image"
      }
    },
    {
      "type": "stats",
      "stats": [
        {
          "value": "62%",
          "label": "of tenant calls go unanswered during peak hours at understaffed properties"
        },
        {
          "value": "3.4\u00d7",
          "label": "higher renewal likelihood when maintenance requests are acknowledged within the "
        },
        {
          "value": "11 hrs",
          "label": "saved per coordinator each week by eliminating manual call-logging and triage"
        },
        {
          "value": "24/7",
          "label": "coverage across voice and chat \u2014 no on-call staff required"
        }
      ],
      "title": "The cost of a missed call is higher than you think"
    },
    {
      "type": "how_it_works",
      "steps": [
        {
          "title": "Connect your properties",
          "body": "Link TenantThread to your property management system and forward your existing maintenance and leasing lines. No hardware, no rewiring \u2014 setup takes under a day per property."
        },
        {
          "title": "Agents handle every inbound contact",
          "body": "Voice and chat agents greet tenants by name, collect issue details, and triage urgency in plain conversation \u2014 day, night, or weekend. No hold music, no voicemail black holes."
        },
        {
          "title": "Work orders appear in your PMS automatically",
          "body": "Triaged requests are categorized, prioritized, and written directly into your existing PMS as structured work orders \u2014 ready for your maintenance team when they clock in."
        },
        {
          "title": "Your team reviews, not reacts",
          "body": "Coordinators start each shift with a clean dashboard: resolved tickets, pending follow-ups, and flagged escalations. You stay in control without being the first line of contact."
        }
      ],
      "title": "Set it up once. Let it run.",
      "subhead": "TenantThread connects to your existing phone lines and resident portal in days, not months."
    },
    {
      "type": "feature_spotlight",
      "items": [
        {
          "title": "Maintenance triage that speaks human",
          "body": "TenantThread's voice agent asks the right follow-up questions \u2014 leak location, severity, unit access \u2014 and routes emergency issues to on-call staff immediately. Routine requests queue cleanly for morning. Tenants feel heard; your team gets actionable, structured data instead of a garbled voicemail.",
          "image": {
            "url": "https://runtime.nexusaiholdings.com/assets/3dee85d0-2780-4cc9-a347-b9b8eb3bc7b4",
            "alt": "Maintenance triage that speaks human"
          }
        },
        {
          "title": "Leasing and tour scheduling on autopilot",
          "body": "Prospective residents get instant answers to availability, pet policy, and pricing questions at 11 PM on a Saturday. When they're ready to tour, the agent checks your calendar and books the slot \u2014 no coordinator involvement required until the showing itself.",
          "image": {
            "url": "https://runtime.nexusaiholdings.com/assets/9898b93e-20b3-4a6f-832f-78631407f69e",
            "alt": "Leasing and tour scheduling on autopilot"
          }
        },
        {
          "title": "A single thread across every channel",
          "body": "Whether a tenant calls, texts, or messages through your resident portal, TenantThread maintains one continuous conversation history. Context carries across channels so tenants never repeat themselves and your team always has the full picture.",
          "image": {
            "url": "https://runtime.nexusaiholdings.com/assets/dbab42e4-b12e-4050-8739-a9308b68863a",
            "alt": "A single thread across every channel"
          }
        }
      ],
      "title": "Built for how lean teams actually operate"
    },
    {
      "type": "feature_grid",
      "features": [
        {
          "title": "PMS work-order creation",
          "body": "Structured work orders written directly into your PMS the moment a call ends \u2014 no copy-paste, no data loss."
        },
        {
          "title": "Emergency escalation routing",
          "body": "Life-safety and urgent issues trigger immediate on-call alerts via SMS or call \u2014 TenantThread knows when to hand off."
        },
        {
          "title": "Leasing FAQ agent",
          "body": "Answers availability, pricing, pet, and parking questions from a live knowledge base synced to your current listings."
        },
        {
          "title": "Tour scheduling",
          "body": "Checks agent calendars in real time and books self-guided or agent-led tours without coordinator involvement."
        },
        {
          "title": "Multi-property routing",
          "body": "One platform across your entire portfolio \u2014 calls route to the right property agent automatically based on the number dialed."
        },
        {
          "title": "Coordinator dashboard",
          "body": "A clean daily digest of every interaction: resolved, pending, and escalated \u2014 so your team spends time on exceptions, not intake."
        }
      ],
      "title": "Everything a 24/7 front desk would do \u2014 without the headcount",
      "subhead": "Core capabilities purpose-built for regional multifamily portfolios."
    },
    {
      "type": "social_proof",
      "quotes": [
        {
          "quote": "We were drowning in after-hours voicemails. TenantThread cleared the backlog on day one. By the end of the first month, our maintenance acknowledgment time dropped from 18 hours to under 2.",
          "author": "Director of Property Operations",
          "role": "Regional multifamily operator, 8 properties, 1,100 units"
        },
        {
          "quote": "My coordinator used to spend her first two hours every morning just returning calls and logging tickets. Now she walks in and the queue is already structured. It's changed how the whole office runs.",
          "author": "Portfolio Manager",
          "role": "Multifamily company, 5 properties, 620 units"
        },
        {
          "quote": "Prospects were slipping away because nobody answered on weekends. TenantThread booked 14 tours in the first month without a single coordinator touch. That alone paid for the year.",
          "author": "Leasing & Operations Lead",
          "role": "Regional residential operator, 3 properties, 340 units"
        }
      ],
      "title": "What teams like yours are saying"
    },
    {
      "type": "pricing_teaser",
      "tiers": [
        {
          "name": "Growth",
          "features": [
            "Up to 300 units",
            "Voice + chat agents",
            "PMS work-order integration",
            "Emergency escalation routing",
            "Leasing FAQ and tour scheduling",
            "Coordinator dashboard"
          ],
          "price": "$15",
          "period": "per unit / month"
        },
        {
          "name": "Portfolio",
          "features": [
            "301\u20131,000 units across multiple properties",
            "All Growth features",
            "Multi-property call routing",
            "Volume discount applied automatically",
            "Dedicated onboarding support",
            "Pilot-to-annual contract conversion"
          ],
          "price": "$11",
          "period": "per unit / month",
          "highlighted": true
        },
        {
          "name": "Regional",
          "features": [
            "1,000\u20132,000+ units",
            "All Portfolio features",
            "Custom PMS and workflow integrations",
            "SLA-backed uptime commitment",
            "Quarterly business reviews",
            "Named account support"
          ],
          "price": "Custom",
          "period": "1,000+ units"
        }
      ],
      "title": "Straightforward pricing that scales with your portfolio",
      "subhead": "Per-unit monthly pricing with volume discounts \u2014 no per-seat fees, no surprise overages. Pilots convert to annual contracts."
    },
    {
      "type": "faq",
      "items": [
        {
          "q": "How long does it take to go live?",
          "a": "Most properties are live within 3\u20135 business days. We connect to your existing phone lines and PMS, configure the agent's knowledge base with your property details, and run a test call with your team before go-live. No new hardware required."
        },
        {
          "q": "Which property management systems does TenantThread integrate with?",
          "a": "TenantThread integrates directly with the major PMS platforms used by regional multifamily operators. During your pilot scoping call, we confirm your specific PMS and configure the work-order integration before you commit."
        },
        {
          "q": "What happens when a tenant has an emergency the AI can't handle?",
          "a": "TenantThread recognizes life-safety language and urgent escalation signals in real time. It immediately transfers the call or sends an SMS alert to your designated on-call contact \u2014 the agent never leaves a tenant in a critical situation without a human path forward."
        },
        {
          "q": "Will tenants know they're talking to an AI?",
          "a": "TenantThread agents are transparent \u2014 they introduce themselves as the property's virtual assistant. In practice, tenants respond well because they get an immediate, helpful answer instead of a voicemail. Satisfaction scores consistently improve after deployment."
        },
        {
          "q": "How does billing work across a portfolio with different unit counts?",
          "a": "Billing is metered monthly per active unit across your entire portfolio. Volume discounts apply automatically as your unit count grows, and you receive a single consolidated invoice regardless of how many properties you've connected."
        }
      ],
      "title": "Questions we hear from every operations team"
    },
    {
      "type": "cta_band",
      "headline": "Stop losing tenants and staff to missed calls.",
      "subhead": "Start a pilot on one property in under a week. No long-term commitment until you've seen it work."
    }
  ]
};
