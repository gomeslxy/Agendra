# 🤝 Contribuindo para Agendra

Agradecemos por considerar contribuir para o Agendra! Leia as instruções abaixo para garantir um processo suave.

## 📋 Pré-requisitos

- Node.js 22+
- PNPM 11+
- Familiaridade com Next.js, TypeScript e Supabase
- Leia a [documentação de arquitetura](../obsidian/02%20-%20ARQUITETURA/)

## 🚀 Como Começar

### 1. Fork & Clone
```bash
git clone https://github.com/seu-usuario/Agendra.git
cd Agendra
```

### 2. Crie uma Branch a partir de `main`
```bash
git checkout -b feature/minha-feature
```

### 3. Instale as Dependências
```bash
pnpm install
```

### 4. Configure Variáveis de Ambiente
```bash
cp .env.example .env.local
# Preencha com suas credenciais
```

### 5. Inicie o Servidor de Dev
```bash
pnpm dev
```

## ✅ Antes de Submeter

```bash
# Rodar linter
pnpm lint

# Type checking
pnpm typecheck

# Testes
pnpm test

# Build de produção
pnpm build
```

## 📤 Submetendo um PR

1. **Título descritivo**: `feat: adiciona nova integração` ou `fix: corrige bug no agendamento`
2. **Descrição clara**: O que foi mudado e por quê?
3. **Linked Issues**: Feche issues automaticamente com `Closes #123`
4. **Screenshots/GIFs**: Se for mudança visual
5. **Testes**: Adicione testes para novas funcionalidades

## 🎯 Áreas para Contribuir

- 🤖 **AI Router**: Melhorias no fallback entre providers
- 📱 **WhatsApp**: Novas features de integração
- 📅 **Google Calendar**: Sincronização mais inteligente
- 💳 **Stripe**: Melhorias de billing
- 🧪 **Testes**: Aumentar cobertura
- 📚 **Documentação**: Melhorar docs

## 📚 Documentação Importante

- [Global Rules](../obsidian/00%20-%20META/global-rules.md)
- [Design System](../obsidian/04%20-%20DESIGN/design-system.md)
- [Roadmap](../obsidian/01%20-%20PRODUTO/roadmap.md)

## 🐛 Reportando Bugs

Use [Issues](https://github.com/gomeslxy/Agendra/issues) com detalhe:
- Descrição do comportamento esperado vs atual
- Steps para reproduzir
- Logs/screenshots
- Environment (Node version, PNPM version, etc)

## 💬 Discussões

Para questions ou ideias, use [Discussions](https://github.com/gomeslxy/Agendra/discussions).

## 📝 Convenções de Código

- **TypeScript**: Sempre tipado, sem `any`
- **Componentes**: Use Server Components quando possível (Next.js 15)
- **Naming**: camelCase para variáveis/funções, PascalCase para componentes
- **Imports**: Organize por: React → 3rd party → relative
- **Comments**: Apenas para WHY, nunca para WHAT

---

**License**: MIT  
**Maintainer**: Lucas Gomes do Amaral
