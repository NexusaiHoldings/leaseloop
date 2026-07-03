/**
 * AUTO-RECOVERED table DDL (table-ref-autorecover-001).
 *
 * The integration table-ref gate found these tables queried by apps/web
 * with no creating DDL. Columns are inferred from the SQL the build agents
 * wrote (best-effort, loosely typed) so migrate.ts creates them at deploy
 * and the runtime queries don't 500. Reviewable + replaceable: if a feature
 * later adds a richer hand-written DDL for one of these tables, delete its
 * block here (CREATE TABLE IF NOT EXISTS would otherwise no-op the richer one).
 */

export const RECOVERED_LEASE_DOCUMENTS_DDL = `
CREATE TABLE IF NOT EXISTS lease_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "category" text,
  "chunk_count" numeric,
  "file_id" uuid,
  "file_name" text,
  "property_id" uuid,
  "unit_id" uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
`;

export const RECOVERED_PMS_CONFIGURATIONS_DDL = `
CREATE TABLE IF NOT EXISTS pms_configurations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "api_key" text,
  "appfolio" text,
  "base_url" text,
  "client_id" uuid,
  "client_secret" text,
  "environment" text,
  "is_active" boolean,
  "password" text,
  "pms_type" text,
  "username" text,
  "yardi" text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
`;

export const RECOVERED_PMS_SYNC_LOG_DDL = `
CREATE TABLE IF NOT EXISTS pms_sync_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "error_message" text,
  "pms_type" text,
  "success" text,
  "synced_at" timestamptz,
  "units_imported" text,
  "unknown" text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
`;

export const RECOVERED_PROPERTIES_DDL = `
CREATE TABLE IF NOT EXISTS properties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "address" text,
  "error" text,
  "maintenance_phone" text,
  "name" text,
  "org_id" uuid,
  "pms_last_synced_at" timestamptz,
  "pms_sync_status" text,
  "pms_type" text,
  "synced" text,
  "unit_count" numeric,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
`;

export const RECOVERED_PROPERTY_DOCUMENT_CHUNKS_DDL = `
CREATE TABLE IF NOT EXISTS property_document_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "chunk_index" text,
  "chunk_text" text,
  "embedding" jsonb,
  "lease_document_id" uuid,
  "property_id" uuid,
  "similarity" text,
  "vector" text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
`;

export const RECOVERED_TT_CHAT_MESSAGES_DDL = `
CREATE TABLE IF NOT EXISTS tt_chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "content" text,
  "lead_id" uuid,
  "role" text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
`;

export const RECOVERED_TT_LEASING_LEADS_DDL = `
CREATE TABLE IF NOT EXISTS tt_leasing_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "booked" text,
  "budget_max" text,
  "budget_min" text,
  "cancelled" text,
  "channel" text,
  "conversation_summary" text,
  "desired_move_in" text,
  "desired_unit_type" text,
  "email" text,
  "full_name" text,
  "idx" text,
  "phone_number" text,
  "property_id" uuid,
  "qualification_score" text,
  "tour_booking_id" uuid,
  "tour_status" text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
`;

export const RECOVERED_TT_TOUR_BOOKINGS_DDL = `
CREATE TABLE IF NOT EXISTS tt_tour_bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "calendly_event_uri" text,
  "calendly_invitee_uri" text,
  "cancelled" text,
  "confirmed" text,
  "lead_id" uuid,
  "no_show" text,
  "property_id" uuid,
  "scheduled_at" timestamptz,
  "status" text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
`;

export const RECOVERED_UNITS_DDL = `
CREATE TABLE IF NOT EXISTS units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "floor_plan" text,
  "lease_end" text,
  "lease_start" text,
  "property_id" uuid,
  "tenant_email" text,
  "tenant_name" text,
  "unit_number" text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
`;

export const RECOVERED_VENDOR_CONTEXT_CHUNKS_DDL = `
CREATE TABLE IF NOT EXISTS vendor_context_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "async" text,
  "await" text,
  "chunk_index" text,
  "chunk_text" text,
  "const" text,
  "embedding" jsonb,
  "export" text,
  "function" text,
  "number" text,
  "pool" text,
  "query" text,
  "similarity" text,
  "string" text,
  "vector" text,
  "vendor_id" uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
`;

export const RECOVERED_VENDORS_DDL = `
CREATE TABLE IF NOT EXISTS vendors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "availability_hours" text,
  "availability_status" text,
  "contact_email" text,
  "contact_name" text,
  "contact_phone" text,
  "coverage_area" text,
  "name" text,
  "notes" text,
  "org_id" uuid,
  "service_category" text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
`;

export const RECOVERED_VOICE_CALLS_DDL = `
CREATE TABLE IF NOT EXISTS voice_calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "call_sid" text,
  "clauses" text,
  "completed" text,
  "days" text,
  "deflected" text,
  "from_number" text,
  "idx" text,
  "issue_description" text,
  "property_id" uuid,
  "property_name" text,
  "stage" text,
  "to_number" text,
  "total" numeric,
  "unit_number" text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
`;

export const RECOVERED_WORK_ORDERS_DDL = `
CREATE TABLE IF NOT EXISTS work_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "call_sid" text,
  "cancelled" text,
  "completed" text,
  "issue_description" text,
  "notes" text,
  "open" text,
  "priority" numeric,
  "property_id" uuid,
  "reporter_phone" text,
  "status" text,
  "unit_number" text,
  "work_order_number" text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
`;
