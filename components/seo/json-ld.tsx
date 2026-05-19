import React from "react";

export function JsonLd() {
  const organizationSchema = {
    "@context": "https://schema.org",
    "@type": "Organization",
    "name": "Agendra",
    "url": "https://www.agendra.site",
    "logo": "https://www.agendra.site/assets/agendra-logo.svg",
    "description": "IA que responde, qualifica e agenda leads 24/7 no WhatsApp e Instagram.",
    "sameAs": [
      "https://www.instagram.com/agendra.ai",
      "https://www.linkedin.com/company/agendra"
    ]
  };

  const websiteSchema = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "name": "Agendra",
    "url": "https://www.agendra.site",
    "potentialAction": {
      "@type": "SearchAction",
      "target": "https://www.agendra.site/search?q={search_term_string}",
      "query-input": "required name=search_term_string"
    }
  };

  const productSchema = {
    "@context": "https://schema.org",
    "@type": "Product",
    "name": "Agendra SaaS",
    "description": "Plataforma de automação de agendamentos e qualificação de leads com inteligência artificial.",
    "brand": {
      "@type": "Brand",
      "name": "Agendra"
    },
    "offers": {
      "@type": "Offer",
      "url": "https://www.agendra.site/planos",
      "priceCurrency": "BRL",
      "availability": "https://schema.org/InStock"
    }
  };

  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": [
      {
        "@type": "Question",
        "name": "A Agendra funciona em quais canais?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "Atualmente, a Agendra integra-se nativamente com WhatsApp e Instagram (Direct). Também fornecemos widgets para sites e suporte a formulários de captura de leads."
        }
      },
      {
        "@type": "Question",
        "name": "Como a IA sabe os horários disponíveis?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "Nós nos conectamos diretamente ao seu calendário (Google Calendar ou Outlook). A IA verifica a disponibilidade em tempo real e nunca marca reuniões em horários ocupados."
        }
      },
      {
        "@type": "Question",
        "name": "A IA pode responder dúvidas técnicas sobre o meu serviço?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "Sim. Você faz o upload do seu 'Cérebro' (documentos, manuais, lista de preços) e a Agendra usa essas informações para responder com precisão, seguindo o tom de voz da sua marca."
        }
      }
    ]
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(productSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />
    </>
  );
}
