"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireTenantContext } from "@/lib/tenant/context";
import { revalidatePath } from "next/cache";
import { assertSafeWebhookUrl } from "@/lib/security/url-guard";
import { logAuditAction } from "@/lib/security/audit";

const SaveWebhookSchema = z.object({
  url: z.string().url("URL de webhook inválida"),
  event_types: z.array(z.string().min(1)).min(1, "Selecione ao menos um tipo de evento."),
  label: z.string().max(120).optional(),
  id: z.string().uuid().optional(),
});

const WebhookIdSchema = z.string().uuid("ID de webhook inválido");

export async function saveWebhookConfig(data: {
  url: string;
  event_types: string[];
  label?: string;
  id?: string;
}): Promise<{ secret?: string }> {
  const { companyId } = await requireTenantContext({ requireAdmin: true });

  const parsed = SaveWebhookSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Dados de webhook inválidos");
  }

  assertSafeWebhookUrl(parsed.data.url);

  const supabase = await createClient();
  let createdSecret: string | undefined;

  if (parsed.data.id) {
    const { error } = await supabase
      .from("webhook_subscriptions")
      .update({
        url: parsed.data.url,
        event_types: parsed.data.event_types,
        label: parsed.data.label ?? null,
      })
      .eq("id", parsed.data.id)
      .eq("company_id", companyId);

    if (error) throw new Error(error.message);
  } else {
    const crypto = (await import("crypto")).default;
    const secret = crypto.randomBytes(32).toString("hex");
    createdSecret = secret;

    const { error } = await supabase.from("webhook_subscriptions").insert({
      company_id: companyId,
      url: parsed.data.url,
      event_types: parsed.data.event_types,
      label: parsed.data.label ?? null,
      secret,
    });

    if (error) throw new Error(error.message);
  }

  await logAuditAction({
    action: "webhook.save",
    companyId,
    payload: {
      url: parsed.data.url,
      event_types: parsed.data.event_types,
      webhook_id: parsed.data.id || "new",
    },
  });

  revalidatePath("/settings");
  return createdSecret ? { secret: createdSecret } : {};
}

export async function deleteWebhook(webhookId: string) {
  const { companyId } = await requireTenantContext({ requireAdmin: true });

  const validId = WebhookIdSchema.parse(webhookId);
  const supabase = await createClient();
  const { error } = await supabase
    .from("webhook_subscriptions")
    .delete()
    .eq("id", validId)
    .eq("company_id", companyId);

  if (error) throw new Error(error.message);

  await logAuditAction({
    action: "webhook.delete",
    companyId,
    payload: { webhook_id: validId },
  });

  revalidatePath("/settings");
}
