/**
 * Agent tool: triage_maintenance_call
 *
 * Registered in DOMAIN_DISPATCH (lib/agent-tools/_dispatch.ts). The portfolio
 * runtime calls this tool when it has gathered enough information from a
 * maintenance call to create a work order and apply escalation rules.
 *
 * Expected args:
 *   call_sid          – Twilio CallSid (string)
 *   from_number       – Caller's E.164 phone number (string)
 *   property_id       – Property UUID (string | null)
 *   unit_number       – Unit identifier as provided by caller (string)
 *   issue_description – Free-text description of the issue (string)
 *   after_hours       – Whether the call came in after business hours (boolean, optional)
 */

import type { HandlerContext, HandlerResult } from "@nexus/identity-and-access";
import { classifyIssue, isAfterHours } from "@/lib/tenantthread/escalation-rules";
import { createWorkOrder } from "@/lib/tenantthread/work-order-creator";
import { updateCallRecord } from "@/lib/tenantthread/voice-agent";

function stringArg(args: Record<string, unknown>, key: string): string {
  const val = args[key];
  return typeof val === 'string' ? val.trim() : '';
}

function boolArg(args: Record<string, unknown>, key: string): boolean {
  const val = args[key];
  if (typeof val === 'boolean') return val;
  if (typeof val === 'string') return val.toLowerCase() === 'true';
  return false;
}

export async function handleTriageMaintenanceCall(
  _ctx: HandlerContext,
  args: Record<string, unknown>,
): Promise<HandlerResult> {
  const callSid = stringArg(args, 'call_sid');
  const fromNumber = stringArg(args, 'from_number');
  const propertyId = stringArg(args, 'property_id') || null;
  const unitNumber = stringArg(args, 'unit_number');
  const issueDescription = stringArg(args, 'issue_description');

  if (!issueDescription) {
    return {
      status: 400,
      body: 'issue_description is required to triage a maintenance call',
    };
  }

  if (!fromNumber) {
    return {
      status: 400,
      body: 'from_number is required to triage a maintenance call',
    };
  }

  const afterHours = args.after_hours !== undefined
    ? boolArg(args, 'after_hours')
    : isAfterHours();

  const decision = classifyIssue(issueDescription, afterHours);

  let workOrder;
  try {
    workOrder = await createWorkOrder({
      propertyId,
      unitNumber: unitNumber || null,
      reporterPhone: fromNumber,
      issueDescription,
      priority: decision.urgency,
      callSid: callSid || null,
      notes: `Triaged via voice call. Action: ${decision.action}. Target resolution: ${decision.targetResolutionHours}h.`,
    });
  } catch (err) {
    return {
      status: 500,
      body: `Failed to create work order: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  // Update the voice call record with the work order reference
  if (callSid) {
    await updateCallRecord(callSid, {
      stage: 'completed',
      work_order_id: workOrder.id,
    });
  }

  return {
    status: 200,
    body: {
      work_order_id: workOrder.id,
      work_order_number: workOrder.work_order_number,
      urgency: decision.urgency,
      action: decision.action,
      response_message: decision.responseMessage,
      target_resolution_hours: decision.targetResolutionHours,
    },
  };
}
