# 🔍 Auditoria Completa do Sistema Agendra

**Data:** 2026-06-09
**Escopo:** Motor de IA, agendamento, mensageria/webhooks, banco de dados, segurança, billing, cron jobs, integrações (WhatsApp/Instagram/Google Calendar/Stripe).
**Método:** Leitura integral do código (`lib/ai`, `lib/calendar`, `lib/channels`, `lib/billing`, `app/api`, 77 migrations SQL), simulação mental de centenas de cenários de cliente, verificação cruzada de cada achado contra o código real (vários achados de primeira passada foram **descartados como falsos positivos** após verificação — ver seção própria).

> ⚙️ **Correções aplicadas nesta auditoria:** os problemas marcados como ✅ CORRIGIDO foram consertados neste mesmo branch (`claude/agendra-complete-audit-daws0w`), com testes novos (`lib/calendar/__tests__/availability.test.ts`) e duas migrations novas (077 e 078). Suite completa: **100 testes passando, typecheck limpo**.

---

## 📊 Notas Gerais

| Dimensão | Nota (0–10) | Justificativa |
|---|---|---|
| **Nota geral do sistema** | **6,5 → 7,5*** | Arquitetura madura (debounce atômico, dedup, circuit breaker, handoff humano), mas com bugs de produto que um cliente real encontraria na 1ª semana (dias "lotados" falsos, reagendamento com corrida). *Após as correções deste branch. |
| **Motor de IA** | **7,0** | Prompt com grounding em serviços/horários reais, sanitização de saída, fallback multi-provider com handoff humano. Pontos fracos: janela de histórico curta (10/15 msgs), RAG injetado sem demarcação anti-injection, sanitizer de chaves `{}` pode descartar resposta inteira. |
| **Sistema de agendamento** | **5,5 → 8,0*** | `book_appointment_atomic` é excelente (lock por tenant + colisão com buffer + limite de 3 futuros + dedup mesmo-dia). Porém: disponibilidade truncada em 30 slots (dias livres reportados como LOTADOS), reagendamento não-atômico e sem validações, buffer ignorado na oferta de slots. *Corrigidos. |
| **Confiabilidade** | **7,0 → 8,0*** | Múltiplas camadas de fallback (Redis→DB buffer→pg_cron 1min), dedup por PK, locks com reaper de stale. Falha grave corrigida: resposta "enviada" que nunca chegou ao lead era invisível. |
| **Experiência do usuário (lead)** | **6,0 → 7,5*** | Debounce adaptativo e typing indicator são ótimos. Mas o lead podia: ouvir "sexta está lotada" com agenda vazia; ter reagendamento conflitante; ficar sem resposta sem ninguém saber. |
| **Escalabilidade** | **7,5** | Serverless + QStash + Redis bem desenhados. Riscos: `listUsers()` unbounded no signup; lock pessimista na linha da company serializa TODOS os bookings do tenant (ok para PMEs, gargalo para alto volume); rate-limit local por instância quando Redis cai. |

---

## 🐛 PROBLEMAS ENCONTRADOS (verificados no código)

### ✅ CORRIGIDOS NESTE BRANCH

---

#### 1. Dias com agenda vazia reportados como "LOTADO" para a IA
- **Severidade:** CRÍTICO (produto)
- **Impacto real:** Com expediente 9h–18h e passos de 30min (≈18 slots/dia), o cálculo era interrompido em **30 slots** — tudo a partir do 3º dia ficava sem slot na lista, e o `day_breakdown` marcava esses dias como `LOTADO (Todos os horários preenchidos)`. A IA dizia ao lead, com convicção, que sexta estava lotada **com a agenda vazia**. Perda direta de agendamentos/receita.
- **Reprodução:** Empresa nova sem nenhum evento → lead pergunta "tem horário sexta?" (hoje = segunda) → `checkAvailability(days_ahead=7)` → sexta = LOTADO.
- **Causa raiz:** `while (... && availableSlots.length < 30)` em `lib/calendar/availability.ts:85` + `hasSlot` derivado dessa lista truncada em `lib/ai/tools.ts:348`.
- **Arquivos:** `lib/calendar/availability.ts`, `lib/ai/tools.ts`.
- **Correção aplicada:** cap parametrizado (`maxSlots`, default `daysAhead × 40`) cobre a janela inteira; o volume enviado ao LLM é controlado por amostragem de **até 8 slots/dia** (`capSlotsPerDay`), mantendo `day_breakdown` e `availability_summary` calculados sobre a lista completa. Teste de regressão incluído.

---

#### 2. Reagendamento permitia double-booking (TOCTOU) e horários inválidos
- **Severidade:** ALTO
- **Impacto real:** Dois clientes podiam terminar no mesmo horário; lead podia reagendar para o **passado**, para **3h da manhã** ou colado em outro evento (buffer ignorado). `new Date(args.new_start_time)` inválido estourava erro críptico.
- **Reprodução:** (a) Lead A reagenda para 15h enquanto Lead B agenda 15h — o `SELECT` de colisão de A passa antes do `INSERT` de B, e o `UPDATE` de A conclui → conflito. (b) IA chama `rescheduleAppointment(new_start_time="2025-01-01T03:00:00Z")` → aceito.
- **Causa raiz:** `handleRescheduleAppointment` usava SELECT-depois-UPDATE sem lock, sem buffer, sem validação de passado/expediente — diferente de `bookAppointment`, que usa a procedure atômica.
- **Arquivos:** `lib/ai/tools.ts:623+`, nova `supabase/migrations/077_reschedule_appointment_atomic.sql`.
- **Correção aplicada:** nova procedure `reschedule_appointment_atomic` (lock pessimista na company — serializa com `book_appointment_atomic` —, colisão com buffer, UPDATE na mesma transação, lockdown service_role) + validações de ISO/passado/expediente no handler. Fallback para o caminho legado com warning enquanto a migration 077 não for aplicada.

---

#### 3. Agendamento fora do horário de funcionamento era aceito
- **Severidade:** ALTO
- **Impacto real:** O prompt instrui o modelo a usar apenas o `start` retornado por `checkAvailability`, mas **não havia guarda no servidor**: se o LLM fabricasse um `start_time` (alucinação, mensagem ambígua), o cliente era agendado para domingo ou madrugada. A procedure atômica só valida colisão, não expediente.
- **Reprodução:** chamada direta `bookAppointment(start_time=<segunda 03:00 local>)` → evento criado e sincronizado no GCal.
- **Causa raiz:** ausência de validação de `working_hours` em `handleBookAppointment` e em `book_appointment_atomic`.
- **Arquivos:** `lib/ai/tools.ts`, `lib/calendar/availability.ts`.
- **Correção aplicada:** novo helper exportado `isWithinWorkingHours(start, duração, working_hours, timezone)` (timezone-aware via `Intl`, valida que início **e fim** cabem no expediente, dia fechado = rejeita) aplicado em `bookAppointment` e `rescheduleAppointment`, com mensagem de erro que reorienta o modelo a usar `checkAvailability`. 5 testes incluídos.

---

#### 4. IA oferecia slots que a procedure de booking depois recusava (buffer inconsistente)
- **Severidade:** ALTO
- **Impacto real:** Com `buffer_minutes` configurado (ex.: 30min entre atendimentos), `checkAvailability` oferecia slot colado em evento existente; o lead escolhia; `book_appointment_atomic` (que **aplica** o buffer) recusava com "Este horário acabou de ser ocupado". Ciclo de frustração: a IA oferece → o sistema nega → a IA oferece de novo.
- **Causa raiz:** o overlap-check de `calculateAvailableSlots` usava apenas a duração (`busy.start < slotEnd && busy.end > cursor`), sem expandir pelos `bufferMinutes` — o buffer só era usado contra o fim do expediente.
- **Arquivos:** `lib/calendar/availability.ts:118`.
- **Correção aplicada:** intervalo ocupado expandido pelo buffer nos dois lados, igual à procedure. Teste de regressão incluído.

---

#### 5. Leads duplicados por corrida na criação (conversa dividida)
- **Severidade:** ALTO
- **Impacto real:** Lead novo manda 2 mensagens rápidas; o flush via Redis e o drain do `message_buffer` (pg_cron 1min) correm em paralelo; ambos fazem SELECT (não acham) e INSERT → **2 registros de lead com o mesmo telefone**, histórico dividido, IA sem contexto, contagem de billing inflada. Pior: se o INSERT falhasse, `created` era `null` e o turno estourava `TypeError` adiante.
- **Causa raiz:** SELECT-then-INSERT sem constraint UNIQUE em `(company_id, phone)` (`lib/ai/engine.ts:797`); nenhuma migration criava o índice.
- **Arquivos:** `lib/ai/engine.ts`, nova `supabase/migrations/078_leads_unique_phone_per_company.sql`.
- **Correção aplicada:** migration que **funde duplicatas existentes** (mantém o lead mais antigo, reaponta dinamicamente todas as FKs que referenciam `leads(id)`, apaga as cópias) e cria índice único parcial `(company_id, phone) WHERE phone IS NOT NULL`; engine agora trata falha do INSERT re-selecionando o vencedor da corrida em vez de quebrar.

---

#### 6. Resposta da IA "enviada" que o lead nunca recebeu — invisível para todos
- **Severidade:** ALTO
- **Impacto real:** Se `sendChannelMessage` retornasse `ok:false` (janela de 24h da Meta fechada, token expirado, erro 131047), a mensagem do assistente **já estava persistida** como mensagem normal, o turno era marcado `completed`, o inbox mostrava a resposta como enviada — e o lead ficava no vácuo. Nenhum log acionável, nenhum alerta.
- **Reprodução:** lead responde 25h depois (fora da janela 24h) → Meta recusa o envio → inbox mostra resposta "enviada".
- **Causa raiz:** `message1Success` só era usado para liberar a parte 2; o caminho `ok:false` não tinha nenhum efeito colateral (`lib/ai/engine.ts:1079-1094`).
- **Arquivos:** `lib/ai/engine.ts`.
- **Correção aplicada:** em falha de entrega, a mensagem recebe `metadata.send_failed=true` + `send_error`, e um `automation_events` tipo `reply_delivery_failed` é emitido (com `trace_id`) para dashboard/operador. Log de erro explícito `🚨 reply NOT delivered`.

---

#### 7. Sem filtro de echo no WhatsApp — risco de loop da IA com ela mesma
- **Severidade:** MÉDIO (probabilidade baixa, dano alto)
- **Impacto real:** O adapter do Instagram filtra `is_echo`, o do WhatsApp não filtrava nada. Em setups de coexistência (app WhatsApp Business + Cloud API com `smb_message_echoes`), a própria resposta da empresa volta como mensagem — a IA responderia a si mesma em loop até o rate-limit (custo de tokens + spam ao lead).
- **Causa raiz:** `parseWebhookPayload` em `lib/channels/adapters/whatsapp-adapter.ts:296` processava qualquer item de `value.messages`.
- **Correção aplicada:** mensagens com `is_echo === true` ou `from` igual ao `display_phone_number` do canal são descartadas com log.

---

#### 8. Offset de timezone reutilizado no salto de dia (DST)
- **Severidade:** BAIXO (Brasil sem DST desde 2019; MÉDIO para tenants em timezones com DST)
- **Impacto real:** No pulo para a meia-noite do dia seguinte, o offset do dia **atual** era reutilizado; numa transição de horário de verão o cursor caía 1h deslocado (slots 1h errados naquele dia).
- **Causa raiz:** `cursor = nextLocalMidnight - offsetMs` com `offsetMs` velho (`lib/calendar/availability.ts:144,150`).
- **Correção aplicada:** offset recalculado no instante de destino antes do salto.

---

### ⚠️ PENDENTES (documentados, não corrigidos neste branch)

---

#### 9. Status de entrega (delivered/read/**failed**) do WhatsApp é descartado
- **Severidade:** MÉDIO
- **Impacto:** `parsed.statusUpdates` chega ao webhook e é apenas logado (`app/api/meta/webhook/route.ts:185-187`). Falhas de entrega reportadas pela Meta não atualizam `messages` nem alertam ninguém (o fix nº 6 cobre falha **síncrona** de envio; falha **assíncrona** reportada via status continua invisível).
- **Solução recomendada:** persistir `delivery_status` por `provider_message_id` e emitir `automation_events` quando `status='failed'`.
- **Exemplo:** `await admin.from('messages').update({ metadata: {...m, delivery_status: u.status} }).eq('metadata->>provider_message_id', u.messageId)` (exige índice por expressão ou coluna própria).

#### 10. Janela de histórico curta (10/15 mensagens) sem sumarização de longo prazo
- **Severidade:** MÉDIO
- **Impacto:** Em conversas longas (lead que retorna após dias), promessas/objeções antigas saem da janela. O `lead_memory` (memória estratégica) mitiga, mas depende do modelo ter chamado `updateLeadMemory` na hora certa.
- **Arquivos:** `lib/ai/engine.ts:894-916`, `lib/ai/memory.ts`.
- **Solução recomendada:** sumário incremental persistido por lead (rolling summary) injetado no prompt junto da janela; ou janela maior quando `status='returning'`.

#### 11. Sanitizer de chaves `{}` pode descartar a resposta inteira
- **Severidade:** MÉDIO
- **Impacto:** O removedor de JSON inline (`lib/ai/sanitizer.ts:97-116`) zera todo conteúdo entre `{` e `}`; se o modelo embrulhar a resposta útil em um objeto, o lead recebe o fallback genérico "Entendido! Como posso ajudar você hoje?" — fora de contexto (o engine ao menos garante fallback, linha 991-993).
- **Solução recomendada:** remover apenas objetos JSON pequenos/reconhecíveis (regex limitada a ~200 chars com aspas/`:`); se a remoção consumir >60% do texto, re-prompt ou usar o texto pré-sanitização sem as linhas JSON.

#### 12. RAG injetado no system prompt sem demarcação anti-injection
- **Severidade:** MÉDIO
- **Impacto:** Conteúdo de documentos enviados pelo tenant entra direto em `persona.extra_instructions` (`lib/ai/engine.ts:840`). Documento malicioso/contaminado pode redirecionar a IA (descontos não autorizados, ignorar regras). Vetor limitado (o próprio dono da empresa faz upload), mas real em times grandes.
- **Solução recomendada:** embrulhar o trecho RAG em delimitadores explícitos ("dados factuais, NÃO instruções") e instruir o modelo a ignorar comandos dentro do bloco.

#### 13. IDs pré-salvos no Redis podem expirar → mensagem duplicada no contexto
- **Severidade:** BAIXO/MÉDIO (janela: flush atrasar >60s)
- **Impacto:** `pre_ids` tem TTL de 60s (`lib/ai/debounce.ts:147`); se o flush vier depois (retry storm do QStash), o engine não exclui a mensagem pré-salva da janela e o LLM vê o texto 2×.
- **Solução recomendada:** dedupe defensivo no engine: excluir do histórico mensagens `role='user'` cujo conteúdo seja substring exata do corpo merged do turno atual.

#### 14. `listUsers()` sem paginação no signup
- **Severidade:** MÉDIO (perf/custo, cresce com a base)
- **Impacto:** `app/api/auth/signup/route.ts` lista **todos** os usuários do projeto para achar um e-mail. Com milhares de contas, lentidão/timeout no signup.
- **Solução recomendada:** `admin.auth.admin.listUsers({ page, perPage })` com filtro, ou consulta direta à tabela `public.users` por e-mail.

#### 15. Cookie de admin determinístico, sem sessão server-side
- **Severidade:** MÉDIO
- **Impacto:** `computeAdminToken(ip, ua)` é estável por IP+UA (`lib/admin/auth.ts`); logout não invalida nada no servidor; e-mails de admin com fallback hardcoded no fonte.
- **Solução recomendada:** sessão com nonce aleatório persistido (tabela `admin_sessions`) e expiração server-side; remover `FALLBACK_ADMIN_EMAILS`.

#### 16. Rate-limit em fallback local é por instância
- **Severidade:** MÉDIO
- **Impacto:** Com Redis fora, `checkRateLimitAsync` cai para `Map` em memória — em N instâncias serverless o limite efetivo multiplica por N (flood/OTP).
- **Solução recomendada:** fail-closed em produção para rotas sensíveis (OTP/reset) quando Redis indisponível.

#### 17. Cache de usage (45s) pode deixar passar mensagens pós-cancelamento
- **Severidade:** BAIXO
- **Impacto:** Entre o webhook `subscription.deleted` e a expiração do cache, ~1-3 mensagens podem ser processadas para empresa cancelada. Custo marginal.
- **Solução recomendada:** já existe `invalidateUsageCache`; reduzir TTL ou checar `subscription_status` fresh no gate do webhook (o guard de `canceled` em `meta/webhook/route.ts:228` já cobre a maioria dos casos).

#### 18. Dedup do Stripe continua processando se o INSERT de dedup falhar por motivo ≠ 23505
- **Severidade:** BAIXO
- **Impacto:** `app/api/stripe/webhook/route.ts:56-61` — em erro de dedup não-unique (timeout), o evento é processado mesmo assim (trade-off deliberado: prefere reprocessar a perder). Handlers são majoritariamente idempotentes (updates absolutos), risco residual baixo.
- **Solução recomendada:** retornar 500 nesses casos para o Stripe re-entregar com dedup funcional.

#### 19. Reagendamento não recria lembrete já enviado/cancelado
- **Severidade:** BAIXO
- **Impacto:** `rescheduleAppointment` só faz UPDATE de lembretes `pending`; se o lembrete já disparou e o cliente reagenda para semana seguinte, o novo horário fica **sem lembrete**.
- **Solução recomendada:** upsert: se nenhum `pending` foi atualizado e `newRemindAt > now`, inserir novo lembrete.

#### 20. Código morto / higiene
- **Severidade:** BAIXO
- **Itens:** 73 warnings de lint (imports/vars não usados, ex. `lib/whatsapp/meta-api.ts:1`, `lib/constants.ts:6-9`); arquivo `0` vazio e `agendra-backup-.bundle` (4MB) versionados na raiz; `handleBookMeeting` alias legado.
- **Solução:** limpeza nas instruções já existentes em `CLEANUP_INSTRUCTIONS.md`.

---

## ❎ FALSOS POSITIVOS DESCARTADOS (alegados em 1ª passada, desmentidos no código)

Estes pontos foram levantados durante a varredura e **verificados como NÃO-bugs** — registrados para evitar retrabalho futuro:

1. **"Bypass de assinatura no webhook Meta"** — o ternário em `app/api/meta/webhook/route.ts:54-57` existe só para `timingSafeEqual` não lançar com buffers de tamanhos diferentes; a linha 59 também compara `actualSignature.length !== expectedSignature.length` e rejeita. Sem bypass.
2. **"checkAvailability calcula o dia errado por usar `new Date()` (UTC)"** — `new Date()` é um instante absoluto; toda conversão de dia/hora usa `Intl` com o timezone da persona. Correto.
3. **"Label do slot mostra hora UTC"** — `endLocal` soma `offsetMs` antes do `getUTCHours()` (`availability.ts:124`), logo exibe hora local. Correto.
4. **"Booking duplicado se a tool for chamada 2×"** — `book_appointment_atomic` rejeita o 2º via colisão consigo mesmo + regra "mesmo serviço no mesmo dia". Protegido.
5. **"Followup cron duplica envios em execução concorrente"** — claim atômico via `followup_in_progress` condicional (`engine.ts:1555-1558`) + endpoint protegido por `CRON_SECRET`. Protegido.
6. **"claimMessage tem corrida no fallback PG"** — o INSERT em `dedup_keys` é atômico; 23505 = duplicata. O `return true` em falha total é trade-off deliberado (preferir duplicar a perder mensagem).
7. **"Double-booking no fluxo principal de agendamento"** — o lock pessimista `FOR UPDATE` na linha da company serializa todas as transações de booking do tenant. Protegido (atenção apenas ao throughput em volume muito alto).

---

## ☠️ TOP 20 RISCOS MAIS PERIGOSOS (pós-correções, ordenado)

1. **Migrations 077/078 não aplicadas em produção** → reagendamento continua em fallback não-atômico e leads seguem duplicáveis. Aplicar imediatamente.
2. Status `failed` da Meta descartado (nº 9) — entregas falhando em lote passam despercebidas.
3. Janela de 24h do WhatsApp sem estratégia de template message — follow-ups de cron para leads >24h silenciosos podem ser todos recusados pela Meta.
4. Janela de histórico curta (nº 10) — IA "esquece" contexto em conversas longas.
5. Sanitizer agressivo (nº 11) — resposta genérica fora de contexto em pleno fluxo de agendamento.
6. Cookie de admin sem sessão server-side (nº 15).
7. Rate-limit local por instância com Redis fora (nº 16).
8. RAG injection (nº 12).
9. `listUsers()` unbounded no signup (nº 14).
10. Token OAuth do Google revogado → `gcalFailed=true` silencioso: bookings só locais, agenda externa diverge (observabilidade existe via `gcal_sync_status`, mas sem alerta ativo ao tenant).
11. `getOffsetMinutes` com fallback `-180` fixo em erro — tenant fora do Brasil com timezone inválido gera slots errados.
12. Lock pessimista por company serializa bookings — sob alto volume, contention/timeout.
13. Pre-ids expirando no Redis (nº 13) — contexto duplicado.
14. Dedup Stripe processa em falha não-unique (nº 18).
15. Cache de usage 45s pós-cancelamento (nº 17).
16. Lembrete não recriado em reagendamento tardio (nº 19).
17. pg_cron jobs sem monitoramento de execução (falha silenciosa de limpeza/reaper).
18. `processed_messages` órfãs em `processing` quando flush é superado pós-claim (janela estreita; reaper cobre parcialmente).
19. Pix "fintech" gera chave copia-e-cola **sintética** (`tools.ts:784`) — se `ENABLE_FINTECH` for ligado sem PSP real, leads receberão cobranças inválidas. Manter desligado até integração real.
20. Hardcoded fallback de e-mails admin no fonte.

## 🚀 TOP 20 MELHORIAS COM MAIOR IMPACTO

1. Aplicar migrations 077/078 + deploy deste branch (destrava 8 correções).
2. Persistir status de entrega da Meta + alerta de `failed` (nº 9).
3. Templates aprovados (HSM) para mensagens fora da janela de 24h (follow-ups e lembretes confiáveis).
4. Rolling summary por lead injetado no prompt (nº 10).
5. Painel de saúde do canal: token expirando, último envio falho, janela 24h — hoje o tenant só descobre quando o lead reclama.
6. Alerta ativo (e-mail/notificação) quando `gcal_sync_status='failed'` ou refresh token inválido.
7. Sanitizer menos destrutivo + telemetry de quantos turnos caem no fallback genérico (nº 11).
8. Sessões de admin server-side (nº 15).
9. Fail-closed de rate-limit em rotas de auth com Redis fora (nº 16).
10. Delimitação anti-injection no bloco RAG (nº 12).
11. Validação de expediente também dentro de `book_appointment_atomic` (defesa em profundidade no banco).
12. Recriar lembrete em reagendamento tardio (nº 19).
13. Testes E2E dos fluxos de tool-calling (booking/cancel/reschedule com mocks de GCal) — hoje a cobertura é majoritariamente unitária.
14. Monitoramento de pg_cron (tabela de heartbeat + alerta se job não roda em X min).
15. Suporte a feriados/datas bloqueadas no `working_hours` (hoje só dias da semana — cliente será agendado no Natal se cair numa quinta).
16. Intervalo de almoço por dia (`working_hours` aceita só um range por dia).
17. Paginação no `listUsers` do signup (nº 14).
18. Métrica de "lead sem resposta há > X min" (catch-all de mensagens órfãs, independente da causa).
19. Limpar código morto + os 73 warnings de lint; remover `agendra-backup-.bundle` e arquivo `0` do repo.
20. Documentar runbook de incidente (Redis fora, QStash fora, Meta fora) — os fallbacks existem mas não há doc operacional.

---

## ✅ CHECKLIST FINAL ANTES DE PRODUÇÃO COM CLIENTES REAIS

**Bloqueadores (fazer antes de qualquer cliente):**
- [x] Corrigir "dias lotados" falsos (cap de 30 slots) — *feito neste branch*
- [x] Reagendamento atômico + validações — *código feito*; [ ] **aplicar migration 077 no banco**
- [x] Guarda de expediente no booking — *feito*
- [x] Buffer consistente entre oferta e booking — *feito*
- [x] Unique de lead por telefone — *código feito*; [ ] **aplicar migration 078 no banco** (faz merge de duplicatas existentes — rodar em janela de baixo tráfego e validar backup)
- [x] Visibilidade de falha de entrega síncrona — *feito*
- [ ] Tratar status `failed` assíncrono da Meta (nº 9)
- [ ] Estratégia de janela 24h (templates) para follow-ups/lembretes
- [ ] Confirmar `WHATSAPP_APP_SECRET`, `CRON_SECRET`, `QSTASH_*`, `ADMIN_*` setados em produção (vários guards degradam silenciosamente sem eles)

**Alta prioridade (primeiras 2 semanas):**
- [ ] Alerta de canal/token GCal com problema
- [ ] Rolling summary de conversa longa
- [ ] Sessão de admin server-side + remover e-mails hardcoded
- [ ] Fail-closed de rate-limit em auth
- [ ] Monitoramento de pg_cron e de mensagens órfãs

**Qualidade contínua:**
- [ ] E2E de tool-calling
- [ ] Feriados e almoço no expediente
- [ ] Limpeza de código morto/lint
- [ ] Runbook de incidentes

---

## Veredito

O Agendra tem uma fundação de engenharia **acima da média** para o estágio (dedup em camadas, booking atômico, circuit breaker multi-provider, handoff humano em falha total, RLS com lockdown de RPCs). Os bugs encontrados não eram de arquitetura — eram exatamente do tipo que **só um cliente real encontraria**: a IA negando horários que existem, reagendamento com corrida, resposta que nunca chega. Com as 8 correções deste branch aplicadas (incluindo as 2 migrations) e os itens bloqueadores do checklist resolvidos, o sistema está em condição de operar com clientes reais sob monitoramento próximo.
