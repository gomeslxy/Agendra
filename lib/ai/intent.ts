/**
 * Agendra — Intent Classifier (heurístico, 0ms)
 *
 * Classificação barata (regex puro) da mensagem de entrada do lead ANTES de
 * tocar no LLM/RAG. Usado para:
 *   - Gatear o RAG bloqueante (saudação/agendamento puro NÃO embeda — corta ~4s).
 *   - Escolher a chain de providers (conv = mais rápida quando não precisa de tools).
 *   - Sinalizar intenção de agendamento (dia/período) para pré-carga proativa.
 *
 * Heurística complementa (não substitui) a análise comportamental profunda do
 * `processBackgroundAnalytics`, que roda em background pós-resposta.
 */

export type IntentType = 'greeting' | 'scheduling' | 'info' | 'complaint' | 'purchase';

export interface Intent {
  type: IntentType;
  /** Lead demonstrou pressa/urgência → resposta deve ser ainda mais concisa. */
  urgent: boolean;
  /** Mencionou dia/período/agendamento → candidato a pré-carga de slots. */
  schedulingSignal: boolean;
  /** Turn provavelmente precisa de ferramentas (agenda/pagamento/escalação). */
  needsTools: boolean;
  /** Turn se beneficia da base de conhecimento (RAG). Saudação/agendamento = false. */
  needsRAG: boolean;
}

const RE = {
  // Saudação isolada (linha inteira) — nada além do cumprimento.
  greetingOnly: /^\s*(oi+|ol[áa]+|bom dia|boa tarde|boa noite|e a[íi]|suave|opa+|hey|tudo bem\??|tudo bom\??|de boa|voltei|cheguei)[\s!.,]*$/i,
  // Inclui pedidos de cancelamento/não-comparecimento em linguagem natural
  // NOTA: padrões de não-comparecimento ficam fora do \b pois 'ã' em 'não' pode quebrar word boundary em alguns engines
  scheduling: /(\b(agend|hor[áa]rio|marcar|marca[rç]|dispon[íi]v|vaga|hoje|amanh[ãa]|depois de amanh[ãa]|segunda|ter[çc]a|quarta|quinta|sexta|s[áa]bado|domingo|de manh[ãa]|[àa] tarde|[àa] noite|que dia|que horas|reagend|remarc|desmarc|cancel|n[ãa]o vou conseguir|n[ãa]o consigo ir|precisei? desmarc|quero desmarc|meu hor[áa]rio|minha consulta|meu agendamento|meu corte|minha barba)|n[ãa]o (vou|vai|consigo|posso|pode|consegue|poder)\s+(?:conseguir\s+|poder\s+)?(ir|comparecer|aparecer))/i,
  complaint: /\b(reclama|p[ée]ssimo|horr[íi]vel|p[ée]ssima|ruim|odiei|n[ãa]o funcion|n[ãa]o gostei|problema|errad|enganad|absurdo|inaceit|processar|procon|reembols|estorno|me engan)/i,
  purchase: /\b(quero|fechar|fechado|comprar|contratar|pagar|quanto fica|quanto custa|bora|vamos marcar|topo|aceito|pode marcar|me v[êe])/i,
  info: /\b(pre[çc]o|valor|quanto|onde fica|endere[çc]o|localiza|funciona|hor[áa]rio de func|como|qual|quais|tem|voc[êe]s fazem|d[úu]vida)/i,
  urgent: /\b(urgente|agora|r[áa]pid|press|com pressa|j[áa]|imediat|hoje mesmo|o quanto antes|sem tempo)/i,
};

export function classifyIntent(msg: string): Intent {
  const t = (msg ?? '').toLowerCase().trim();
  const schedulingSignal = RE.scheduling.test(t);
  const isComplaint = RE.complaint.test(t);

  let type: IntentType;
  if (RE.greetingOnly.test(t)) type = 'greeting';
  else if (isComplaint) type = 'complaint';
  else if (schedulingSignal) type = 'scheduling';
  else if (RE.purchase.test(t)) type = 'purchase';
  else if (RE.info.test(t)) type = 'info';
  else type = 'info'; // default seguro: mensagens ambíguas tratadas como informativas

  return {
    type,
    urgent: RE.urgent.test(t),
    schedulingSignal,
    // Agendamento, compra e reclamação podem precisar de tools (agenda/escalação).
    needsTools: type === 'scheduling' || type === 'purchase' || type === 'complaint',
    // Saudação e agendamento puro não precisam da base de conhecimento.
    needsRAG: type === 'info' || type === 'complaint' || type === 'purchase',
  };
}
