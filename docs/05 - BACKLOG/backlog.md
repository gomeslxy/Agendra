# 📋 Backlog & Ideias

Lista de funcionalidades, melhorias e débitos técnicos para o futuro do Agendra.

## 🛠️ Débitos Técnicos & Refatoração
- [ ] **Billing Database Migration**: Adicionar colunas `current_period_start` e `current_period_end` na tabela `subscriptions` para suporte completo a ciclos de faturamento.
- [ ] **WhatsApp Media UI**: Implementar visualização real de mídias (imagens, áudios) no Inbox, substituindo os fallbacks de texto atuais.
- [ ] **Encrypted Tokens**: Criptografar `google_refresh_token` e `whatsapp_token` em repouso no banco de dados.
- [ ] **Branded Icons**: Substituir `lucide-react` por ícones SVG próprios para reforçar a identidade visual.
- [ ] **Centralized Types**: Unificar todos os tipos de banco de dados em um único pacote/arquivo compartilhado.
- [ ] **Error Handling**: Implementar um sistema de log centralizado para erros de IA e Webhook.

## ✨ Novas Funcionalidades (Ideias)
- [ ] **Instagram DM Integration**: Trazer o mesmo motor de IA para o Instagram.
- [ ] **Follow-up Automático**: Se o lead não responder após o agendamento sugerido, a IA manda um lembrete em 24h.
- [ ] **Multi-agente**: Possibilidade de ter diferentes personas para diferentes canais ou horários.
- [ ] **Voice qualification**: IA que processa áudios do WhatsApp (Transcreve -> Engine -> Responde em texto).
- [ ] **CRM Light**: Uma visão de pipeline mais detalhada com campos customizados por empresa.

## 📈 Analytics & Insights
- [ ] **ROI Calculator**: Mostrar quanto o dono da empresa economizou/ganhou com os agendamentos automáticos.
- [ ] **Heatmap de Horários**: Mostrar quais horários os leads mais procuram agendamento.
- [ ] **Funil de Conversão**: Taxa de Lead -> Qualificado -> Agendado.

## 🎨 UI/UX improvements
- [ ] **Dark/Light Mode sutil**: Refinar o suporte a temas sem perder a estética premium.
- [ ] **Tutorial Interativo**: Onboarding guiado para novos usuários conectarem WhatsApp e GCal.
