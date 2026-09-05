import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * Lead capture endpoint (plan: "lead capture form → serverless function").
 * Runs server-side only — the browser bundle never sees this code.
 *
 * Validates the payload, then either forwards it to the CRM/webhook
 * configured via LEAD_WEBHOOK_URL or logs it server-side. Wire
 * LEAD_WEBHOOK_URL to your booking backend when it exists.
 */
const LeadInput = z.object({
  projectSlug: z.string().min(1).max(80),
  name: z.string().trim().min(2).max(80),
  phone: z.string().trim().min(7).max(20),
  interest: z.string().trim().max(120).optional().default(""),
  sceneId: z.string().trim().max(40).optional().default(""),
  source: z.enum(["ar", "preview"]).default("ar"),
});

export type LeadResult = { ok: true; id: string } | { ok: false; error: string };

export const submitLead = createServerFn({ method: "POST" })
  .inputValidator(LeadInput)
  .handler(async ({ data }): Promise<LeadResult> => {
    const id = `lead_${Date.now().toString(36)}`;
    const webhook = process.env["LEAD_WEBHOOK_URL"];
    if (webhook) {
      try {
        const res = await fetch(webhook, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ id, ...data, at: new Date().toISOString() }),
        });
        if (!res.ok) return { ok: false, error: "booking-backend-unreachable" };
      } catch {
        return { ok: false, error: "booking-backend-unreachable" };
      }
    } else {
      // No backend wired yet — visible in server logs, never lost silently.
      console.info(`[lead:${id}]`, JSON.stringify(data));
    }
    return { ok: true, id };
  });
