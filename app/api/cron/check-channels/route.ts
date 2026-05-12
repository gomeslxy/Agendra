import { createAdminClient } from "@/lib/supabase/admin";
import { validateWhatsAppToken } from "@/lib/whatsapp/validate";
import { NextResponse } from "next/server";

/**
 * CRON: Verificação de Saúde dos Canais
 * Frequência sugerida: A cada 1 hora
 * 
 * Este worker:
 * 1. Busca canais que não são vistos há mais de 1 hora ou estão em erro.
 * 2. Tenta re-validar o token com a Meta.
 * 3. Atualiza o status e last_error no banco.
 */
export async function GET(req: Request) {
  // 1. Proteção via Secret (Configurar CRON_SECRET nas envs)
  const { searchParams } = new URL(req.url);
  const secret = searchParams.get("secret");

  if (process.env.NODE_ENV === "production" && secret !== process.env.CRON_SECRET) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const supabase = createAdminClient();
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  try {
    // 2. Buscar canais "suspeitos" (em erro ou silenciosos)
    const { data: channels, error: fetchError } = await supabase
      .from("channels")
      .select("*")
      .or(`status.eq.error,last_seen_at.lt.${oneHourAgo}`);

    if (fetchError) throw fetchError;
    if (!channels || channels.length === 0) {
      return NextResponse.json({ message: "Nenhum canal precisando de checkup." });
    }

    const results = [];

    for (const channel of channels) {
      console.log(`[Cron] 🩺 Checando saúde do canal: ${channel.name} (${channel.provider_id})`);
      
      const validation = await validateWhatsAppToken(channel.provider_id, channel.access_token);
      
      if (!validation.ok) {
        // Marcar como erro
        await supabase
          .from("channels")
          .update({ 
            status: "error", 
            last_error: validation.error || "Falha na verificação automática" 
          })
          .eq("id", channel.id);
        
        results.push({ id: channel.id, status: "error", error: validation.error });
      } else {
        // Restaurar se estava em erro ou apenas atualizar telemetria
        await supabase
          .from("channels")
          .update({ 
            status: "active", 
            last_error: null,
            last_seen_at: new Date().toISOString()
          })
          .eq("id", channel.id);
        
        results.push({ id: channel.id, status: "active" });
      }
    }

    return NextResponse.json({ 
      message: "Checkup concluído", 
      processed: channels.length,
      results 
    });

  } catch (error: any) {
    console.error("[Cron] 💥 Erro no worker de saúde:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
