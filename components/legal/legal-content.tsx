import type { ReactNode } from "react";

// ─── Shared section wrapper ────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mb-7">
      <h2 className="mb-2 text-sm font-semibold text-white/90">{title}</h2>
      <div className="space-y-2 text-white/65 [&_ul]:ml-4 [&_ul]:list-disc [&_ul]:space-y-1">
        {children}
      </div>
    </section>
  );
}

// ─── Termos de Uso ─────────────────────────────────────────────────────────────

export function TermosContent() {
  return (
    <div>
      <p className="mb-6 text-xs text-white/40">
        Última atualização: 8 de maio de 2026
      </p>

      <Section title="1. Aceitação dos Termos">
        <p>
          Ao acessar ou utilizar a plataforma Agendra ("Serviço"), você concorda com
          estes Termos de Uso. Se não concordar, não utilize o Serviço. Estes termos
          constituem um contrato vinculante entre você e a Agendra Tecnologia Ltda.
          ("Empresa", "nós").
        </p>
      </Section>

      <Section title="2. Descrição do Serviço">
        <p>
          A Agendra é uma plataforma SaaS de gestão de leads, agendamentos e
          comunicações voltada a empresas e profissionais autônomos. O Serviço pode
          ser modificado, suspenso ou encerrado a qualquer momento, com aviso prévio
          razoável.
        </p>
      </Section>

      <Section title="3. Elegibilidade">
        <p>
          O Serviço é destinado a pessoas jurídicas e profissionais com capacidade
          legal para contratar. Ao criar uma conta, você declara ter autoridade para
          vincular a organização em nome da qual atua a estes termos.
        </p>
      </Section>

      <Section title="4. Conta e Responsabilidades">
        <ul>
          <li>Você é responsável por manter a confidencialidade de suas credenciais.</li>
          <li>Toda atividade realizada sob sua conta é de sua responsabilidade.</li>
          <li>
            Notifique-nos imediatamente em caso de acesso não autorizado:{" "}
            <a href="mailto:suporte@agendra.app" className="text-blue-400 hover:underline">
              suporte@agendra.app
            </a>
            .
          </li>
          <li>É proibida a criação de contas falsas ou em nome de terceiros sem autorização.</li>
        </ul>
      </Section>

      <Section title="5. Uso Aceitável">
        <p>Você concorda em não utilizar o Serviço para:</p>
        <ul>
          <li>Violar leis aplicáveis ou direitos de terceiros.</li>
          <li>Enviar spam, conteúdo enganoso ou comunicações não solicitadas.</li>
          <li>Tentar obter acesso não autorizado a sistemas ou dados de outros usuários.</li>
          <li>Realizar engenharia reversa ou cópia não autorizada do Serviço.</li>
          <li>Usar o Serviço de forma que sobrecarregue indevidamente nossa infraestrutura.</li>
        </ul>
      </Section>

      <Section title="6. Propriedade Intelectual">
        <p>
          Todos os direitos sobre o Serviço — incluindo software, marca, logotipo,
          interface e conteúdos — pertencem à Empresa. O uso do Serviço não transfere
          qualquer direito de propriedade intelectual ao usuário.
        </p>
        <p>
          Os dados inseridos por você na plataforma permanecem de sua propriedade.
          Você concede à Empresa licença limitada para processá-los exclusivamente com
          a finalidade de operar o Serviço.
        </p>
      </Section>

      <Section title="7. Pagamentos e Assinaturas">
        <p>
          Planos pagos são cobrados conforme a página de preços. As cobranças são
          realizadas antecipadamente por período contratado. Não há reembolso
          proporcional por cancelamento antecipado, salvo disposição contrária em lei.
        </p>
        <p>
          Inadimplência por mais de 7 dias pode resultar na suspensão da conta. Seus
          dados serão retidos por 30 dias após a suspensão para possibilitar
          regularização.
        </p>
      </Section>

      <Section title="8. Limitação de Responsabilidade">
        <p>
          O Serviço é fornecido "como está". Não garantimos disponibilidade
          ininterrupta ou ausência de erros. Em nenhuma hipótese a Empresa será
          responsável por danos indiretos, incidentais ou consequentes.
        </p>
        <p>
          Nossa responsabilidade total está limitada ao valor pago pelo usuário nos
          últimos 3 meses anteriores ao evento que gerou o dano.
        </p>
      </Section>

      <Section title="9. Rescisão">
        <p>
          Você pode encerrar sua conta a qualquer momento nas configurações. A Empresa
          pode encerrar ou suspender sua conta em caso de violação destes termos,
          mediante notificação prévia sempre que possível.
        </p>
      </Section>

      <Section title="10. Alterações nos Termos">
        <p>
          Podemos atualizar estes Termos periodicamente. Notificaremos por e-mail com
          pelo menos 15 dias de antecedência para alterações materiais. O uso
          continuado após a vigência implica aceitação.
        </p>
      </Section>

      <Section title="11. Lei Aplicável e Foro">
        <p>
          Estes Termos são regidos pelas leis da República Federativa do Brasil. Fica
          eleito o foro da comarca de São Paulo/SP para dirimir quaisquer
          controvérsias.
        </p>
      </Section>

      <Section title="12. Contato">
        <p>
          Dúvidas sobre estes Termos:{" "}
          <a href="mailto:juridico@agendra.app" className="text-blue-400 hover:underline">
            juridico@agendra.app
          </a>
        </p>
      </Section>
    </div>
  );
}

// ─── Política de Privacidade (LGPD) ───────────────────────────────────────────

export function PrivacidadeContent() {
  return (
    <div>
      <p className="mb-1 text-xs text-white/40">
        Última atualização: 8 de maio de 2026
      </p>
      <p className="mb-6 text-xs font-medium text-blue-400">
        Em conformidade com a LGPD — Lei nº 13.709/2018
      </p>

      <Section title="1. Controlador dos Dados">
        <p>
          <strong className="text-white/80">Agendra Tecnologia Ltda.</strong> é a
          controladora dos dados pessoais tratados nesta plataforma.
        </p>
        <p>
          DPO (Encarregado de Proteção de Dados):{" "}
          <a href="mailto:dpo@agendra.app" className="text-blue-400 hover:underline">
            dpo@agendra.app
          </a>
        </p>
      </Section>

      <Section title="2. Dados Coletados e Finalidades">
        <ul>
          <li>
            <strong className="text-white/80">Nome e e-mail</strong> — criação e
            gerenciamento de conta (base legal: execução de contrato, art. 7º, V).
          </li>
          <li>
            <strong className="text-white/80">Senha (hash bcrypt)</strong> —
            autenticação segura (execução de contrato).
          </li>
          <li>
            <strong className="text-white/80">Nome da empresa</strong> —
            personalização do Serviço (execução de contrato).
          </li>
          <li>
            <strong className="text-white/80">Dados de uso e logs</strong> —
            segurança e melhorias (legítimo interesse, art. 7º, IX).
          </li>
          <li>
            <strong className="text-white/80">Dados de cobrança</strong> —
            processamento de pagamentos (execução de contrato).
          </li>
          <li>
            <strong className="text-white/80">Cookies de sessão</strong> — manter
            sessão autenticada (legítimo interesse).
          </li>
        </ul>
      </Section>

      <Section title="3. Compartilhamento">
        <p>
          Seus dados <strong className="text-white/80">não são vendidos</strong>.
          Compartilhamos apenas com:
        </p>
        <ul>
          <li>
            <strong className="text-white/80">Supabase Inc.</strong> — banco de dados
            e autenticação (AWS, us-east-1).
          </li>
          <li>
            <strong className="text-white/80">Stripe Inc.</strong> — processamento de
            pagamentos (PCI-DSS Level 1).
          </li>
          <li>
            <strong className="text-white/80">Vercel Inc.</strong> — hospedagem da
            aplicação.
          </li>
          <li>
            <strong className="text-white/80">Autoridades</strong> — quando exigido
            por lei ou ordem judicial.
          </li>
        </ul>
      </Section>

      <Section title="4. Transferências Internacionais">
        <p>
          Parte dos dados é processada em servidores nos EUA, com base em cláusulas
          contratuais padrão, em conformidade com o art. 33 da LGPD.
        </p>
      </Section>

      <Section title="5. Retenção">
        <ul>
          <li>
            <strong className="text-white/80">Conta ativa:</strong> pelo tempo
            necessário à prestação do Serviço.
          </li>
          <li>
            <strong className="text-white/80">Após cancelamento:</strong> 30 dias,
            então exclusão definitiva dos dados operacionais.
          </li>
          <li>
            <strong className="text-white/80">Dados fiscais:</strong> 5 anos
            (obrigação legal).
          </li>
          <li>
            <strong className="text-white/80">Logs de segurança:</strong> 12 meses.
          </li>
        </ul>
      </Section>

      <Section title="6. Seus Direitos (art. 18 LGPD)">
        <ul>
          <li>
            <strong className="text-white/80">Acesso</strong> — saber quais dados
            temos.
          </li>
          <li>
            <strong className="text-white/80">Correção</strong> — de dados
            incompletos ou inexatos.
          </li>
          <li>
            <strong className="text-white/80">Eliminação</strong> — de dados tratados
            com consentimento.
          </li>
          <li>
            <strong className="text-white/80">Portabilidade</strong> — em formato
            estruturado.
          </li>
          <li>
            <strong className="text-white/80">Oposição</strong> — ao tratamento com
            base em legítimo interesse.
          </li>
          <li>
            <strong className="text-white/80">Reclamação à ANPD</strong> —{" "}
            <a
              href="https://www.gov.br/anpd"
              className="text-blue-400 hover:underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              gov.br/anpd
            </a>
            .
          </li>
        </ul>
        <p>
          Solicite via{" "}
          <a href="mailto:dpo@agendra.app" className="text-blue-400 hover:underline">
            dpo@agendra.app
          </a>
          . Respondemos em até 15 dias úteis.
        </p>
      </Section>

      <Section title="7. Segurança">
        <ul>
          <li>Criptografia em trânsito (TLS 1.2+) e em repouso (AES-256).</li>
          <li>Senhas armazenadas exclusivamente como hash bcrypt.</li>
          <li>Controle de acesso baseado em funções (RBAC).</li>
          <li>Monitoramento contínuo de acessos e anomalias.</li>
        </ul>
      </Section>

      <Section title="8. Cookies">
        <p>
          Utilizamos apenas cookies estritamente necessários para autenticação e
          sessão. Sem cookies de rastreamento ou publicidade de terceiros.
        </p>
      </Section>

      <Section title="9. Menores de Idade">
        <p>
          Serviço destinado exclusivamente a usuários com 18 anos ou mais. Dados de
          menores identificados serão excluídos imediatamente.
        </p>
      </Section>

      <Section title="10. Contato">
        <p>
          <strong className="text-white/80">DPO:</strong>{" "}
          <a href="mailto:dpo@agendra.app" className="text-blue-400 hover:underline">
            dpo@agendra.app
          </a>{" "}
          — resposta em até 15 dias úteis.
        </p>
      </Section>
    </div>
  );
}
