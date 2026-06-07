# 🔒 Política de Segurança

## Reportando Vulnerabilidades

Se você descobrir uma vulnerabilidade de segurança, **não abra uma issue pública**. Em vez disso:

1. **Email**: Envie um email para [seu-email@example.com] com detalhes da vulnerabilidade
2. **Incluir**: Descrição do problema, passos para reproduzir, impacto potencial
3. **Aguardar**: Responderemos em até 48 horas

## Informações de Segurança

### Dados Sensíveis
- Nunca commite `.env` ou arquivos com credenciais
- Todas as chaves de API devem ser variáveis de ambiente
- Senhas são hasheadas com bcrypt (12 rounds)
- Tokens são rotacionados automaticamente

### Dependências
- `pnpm audit` é rodado em CI/CD
- Dependências vulneráveis são bloqueadas automaticamente
- Atualizações de segurança são prioritárias

### Autenticação
- Supabase Auth (JWT baseado)
- Session tokens são HttpOnly e Secure
- CSRF protection em todas as mudanças de estado
- Rate limiting em endpoints de auth

### Dados em Trânsito
- HTTPS obrigatório (hsts-max-age: 31536000)
- TLS 1.2+
- CSP headers configurado

### Dados em Repouso
- PostgreSQL encryption at rest (Supabase)
- Backups automatizados e criptografados
- Compliance com GDPR pronto

## Best Practices

Para contribuidores:

- ✅ Use TypeScript (evita muitos bugs)
- ✅ Valide inputs sempre em Server Actions
- ✅ Escape outputs no frontend
- ✅ Use variáveis de ambiente para secrets
- ✅ Teste com dados sensíveis em local
- ❌ Não commite logs com PII
- ❌ Não confie em validação apenas de frontend
- ❌ Não use `eval()` ou `dangerouslySetInnerHTML`

## Disclosure Timeline

Se você reportar uma vulnerabilidade:

1. **T+0**: Recebimento e confirmação
2. **T+48h**: Investigação inicial
3. **T+5d**: Plano de mitigação (ou CWE se não for aplicável)
4. **T+14d**: Release de patch (ou justificativa de não-fix)
5. **T+30d**: Disclosure público (CVE se qualificável)

---

**Obrigado por ajudar a manter o Agendra seguro!** 🙏
