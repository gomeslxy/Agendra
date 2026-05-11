# 📝 Backlog & Dívida Técnica

## 🎯 Prioridades (Próxima Sprint)
- [x] **AI Observability**: Criar tabela `ai_traces` e implementar log estruturado de tool calls no engine.
- [x] **Human Handoff (Core)**: Implementar flag `is_paused` na tabela `leads` e lógica no engine para respeitar o silêncio da IA.
- [x] **Stripe Checkout**: Finalizar integração do front-end com sessões de checkout do Stripe.

## 🛠️ Dívida Técnica
- [ ] **Refatorar `resolveCompanyId`**: Desacoplar lógica de identificação de empresa do canal WhatsApp para permitir multi-canal.
- [ ] **Bundle Optimization**: Remover pacotes Shadcn/Radix não utilizados para reduzir o peso do client.
- [ ] **GCal Fallback**: Melhorar tratamento de erro quando o Google Refresh Token expira ou é revogado.

## 💡 Ideias & Futuro
- [ ] Suporte a Instagram DM e Messenger.
- [ ] Análise de sentimento avançada para priorização automática.
- [ ] PWA: Notificações nativas para intervenção humana.
