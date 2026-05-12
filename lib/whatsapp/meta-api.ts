import { createAdminClient } from "@/lib/supabase/admin";

const META_API_BASE = "https://graph.facebook.com/v19.0";

/**
 * Utilitários para o fluxo de Embedded Signup da Meta.
 */
export async function exchangeForLongLivedToken(shortLivedToken: string) {
  const appId = process.env.NEXT_PUBLIC_META_APP_ID;
  const appSecret = process.env.WHATSAPP_APP_SECRET;

  if (!appId || !appSecret) {
    throw new Error("Meta App configuration missing (App ID or Secret)");
  }

  const url = `${META_API_BASE}/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${shortLivedToken}`;

  const res = await fetch(url);
  const data = await res.json();

  if (!res.ok) {
    throw new Error(`Meta Token Exchange Error: ${data.error?.message || "Unknown error"}`);
  }

  return data.access_token as string;
}

/**
 * Busca os detalhes do número de telefone (Phone ID e Número formatado)
 * usando um token de acesso.
 */
export async function getWhatsAppNumberDetails(accessToken: string) {
  // 1. Buscar as contas de WhatsApp Business (WABA) vinculadas ao token
  const wabaUrl = `${META_API_BASE}/me/whatsapp_business_accounts`;
  const wabaRes = await fetch(wabaUrl, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  const wabaData = await wabaRes.json();

  if (!wabaRes.ok || !wabaData.data?.[0]) {
    throw new Error("Nenhuma conta de WhatsApp Business encontrada.");
  }

  const wabaId = wabaData.data[0].id;

  // 2. Buscar os números de telefone daquela WABA
  const numbersUrl = `${META_API_BASE}/${wabaId}/phone_numbers`;
  const numRes = await fetch(numbersUrl, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  const numData = await numRes.json();

  if (!numRes.ok || !numData.data?.[0]) {
    throw new Error("Nenhum número de telefone encontrado na conta.");
  }

  // Retorna o primeiro número encontrado (comum para SMBs)
  const primaryNumber = numData.data[0];
  
  return {
    phone_number_id: primaryNumber.id as string,
    display_phone_number: primaryNumber.display_phone_number as string,
    waba_id: wabaId as string
  };
}

/**
 * Valida um token e um Phone ID diretamente com a API da Meta.
 */
export async function validateWhatsAppToken(phoneId: string, accessToken: string) {
  try {
    const url = `${META_API_BASE}/${phoneId}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    const data = await res.json();

    if (!res.ok) {
      return { ok: false, error: data.error?.message || "Token ou Phone ID inválido" };
    }

    return { 
      ok: true, 
      displayPhone: data.display_phone_number as string 
    };
  } catch (err: any) {
    return { ok: false, error: err.message };
  }
}
