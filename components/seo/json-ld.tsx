import React from "react";

const BASE_URL = "https://www.agendra.site";

export function JsonLd() {
  const organizationSchema = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "Agendra",
    url: BASE_URL,
    logo: `${BASE_URL}/assets/agendra-logo.svg`,
    description: "IA que responde, qualifica e agenda leads 24/7 no WhatsApp e Instagram.",
    sameAs: [
      "https://www.instagram.com/agendra.ai",
      "https://www.linkedin.com/company/agendra",
    ],
  };

  const websiteSchema = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "Agendra",
    url: BASE_URL,
  };

  const softwareSchema = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "Agendra",
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    description:
      "Plataforma de automação de agendamentos e qualificação de leads com inteligência artificial via WhatsApp e Instagram.",
    url: BASE_URL,
    offers: {
      "@type": "Offer",
      url: `${BASE_URL}/planos`,
      priceCurrency: "BRL",
      availability: "https://schema.org/InStock",
    },
    aggregateRating: {
      "@type": "AggregateRating",
      ratingValue: "4.9",
      reviewCount: "127",
      bestRating: "5",
      worstRating: "1",
    },
    review: [
      {
        "@type": "Review",
        author: { "@type": "Person", name: "Dra. Ana Ferreira" },
        reviewRating: { "@type": "Rating", ratingValue: "5", bestRating: "5" },
        reviewBody:
          "A Agendra pagou o plano inteiro no primeiro dia. Três leads do Instagram viraram consultas em menos de 10 minutos — sem eu tocar no celular.",
      },
      {
        "@type": "Review",
        author: { "@type": "Person", name: "Rodrigo Melo" },
        reviewRating: { "@type": "Rating", ratingValue: "5", bestRating: "5" },
        reviewBody:
          "Antes eu perdia lead porque não respondia rápido. Agora a IA responde em segundos e manda pra mim só os quentes. Agenda lotada há 3 semanas.",
      },
      {
        "@type": "Review",
        author: { "@type": "Person", name: "Juliana Costa" },
        reviewRating: { "@type": "Rating", ratingValue: "5", bestRating: "5" },
        reviewBody:
          "Integração com o Google Calendar funciona perfeitamente. Zero conflito de horário, zero trabalho manual.",
      },
    ],
  };

  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [
      {
        "@type": "Question",
        name: "A Agendra funciona em quais canais?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Atualmente, a Agendra integra-se nativamente com WhatsApp e Instagram (Direct). Também fornecemos widgets para sites e suporte a formulários de captura de leads.",
        },
      },
      {
        "@type": "Question",
        name: "Como a IA sabe os horários disponíveis?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Nós nos conectamos diretamente ao seu calendário (Google Calendar ou Outlook). A IA verifica a disponibilidade em tempo real e nunca marca reuniões em horários ocupados.",
        },
      },
      {
        "@type": "Question",
        name: "A IA pode responder dúvidas técnicas sobre o meu serviço?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Sim. Você faz o upload do seu 'Cérebro' (documentos, manuais, lista de preços) e a Agendra usa essas informações para responder com precisão, seguindo o tom de voz da sua marca.",
        },
      },
      {
        "@type": "Question",
        name: "É difícil de configurar?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Não. A maioria dos nossos clientes coloca a Agendra para rodar em menos de 15 minutos. Basta conectar o WhatsApp e subir seus dados básicos.",
        },
      },
    ],
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
        dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />
    </>
  );
}
