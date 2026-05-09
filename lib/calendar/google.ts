/**
 * Google Calendar API Helper
 *
 * Stateless: recebe refresh_token por chamada (multi-tenant).
 * Usa a API REST diretamente (sem google-auth-library) para manter
 * o bundle leve — apenas fetch nativo.
 *
 * Funções exportadas:
 *   - refreshAccessToken   → troca refresh_token por access_token
 *   - getFreeBusySlots     → consulta API Free/Busy
 *   - createGoogleCalendarEvent → cria evento no Google Calendar
 *   - buildGoogleOAuthUrl  → gera URL de autorização OAuth
 *   - exchangeCodeForTokens → troca code por tokens
 */

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GCAL_API_BASE = 'https://www.googleapis.com/calendar/v3';

// ─── OAuth Config ─────────────────────────────────────────────────────────────

function getOAuthConfig() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error(
      'Variáveis de ambiente ausentes: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI',
    );
  }
  return { clientId, clientSecret, redirectUri };
}

// ─── Token Management ─────────────────────────────────────────────────────────

/**
 * Troca o refresh_token por um access_token válido (expira em ~1h).
 * Chamado antes de qualquer requisição à API do Google Calendar.
 */
export async function refreshAccessToken(refreshToken: string): Promise<string> {
  const { clientId, clientSecret } = getOAuthConfig();

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Falha ao renovar token do Google: ${res.status} — ${body}`);
  }

  const json = (await res.json()) as { access_token: string };
  return json.access_token;
}

// ─── Free/Busy ────────────────────────────────────────────────────────────────

export interface BusySlot {
  start: string;
  end: string;
}

/**
 * Consulta a API Free/Busy do Google Calendar.
 * Retorna os intervalos OCUPADOS (busy) para o calendário especificado.
 */
export async function getFreeBusySlots(
  refreshToken: string,
  calendarId: string,
  timeMin: string,
  timeMax: string,
): Promise<BusySlot[]> {
  const accessToken = await refreshAccessToken(refreshToken);

  const res = await fetch(`${GCAL_API_BASE}/freeBusy`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      timeMin,
      timeMax,
      items: [{ id: calendarId }],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Google Free/Busy falhou: ${res.status} — ${body}`);
  }

  const json = (await res.json()) as {
    calendars: Record<string, { busy: BusySlot[] }>;
  };

  return json.calendars[calendarId]?.busy ?? [];
}

// ─── Event Creation ───────────────────────────────────────────────────────────

export interface CalendarEventInput {
  title: string;
  start: string;  // ISO 8601
  end: string;    // ISO 8601
  description?: string;
  attendeeEmail?: string; // lead's email, if available
}

/**
 * Cria um evento no Google Calendar.
 * Retorna o `id` do evento criado (salvo como gcal_event_id na tabela events).
 */
export async function createGoogleCalendarEvent(
  refreshToken: string,
  calendarId: string,
  event: CalendarEventInput,
): Promise<string> {
  const accessToken = await refreshAccessToken(refreshToken);

  const body: Record<string, unknown> = {
    summary: event.title,
    description: event.description ?? '',
    start: { dateTime: event.start },
    end: { dateTime: event.end },
    reminders: {
      useDefault: false,
      overrides: [
        { method: 'email', minutes: 60 },
        { method: 'popup', minutes: 15 },
      ],
    },
  };

  if (event.attendeeEmail) {
    body.attendees = [{ email: event.attendeeEmail }];
  }

  const res = await fetch(
    `${GCAL_API_BASE}/calendars/${encodeURIComponent(calendarId)}/events`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    },
  );

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Falha ao criar evento no Google Calendar: ${res.status} — ${errBody}`);
  }

  const json = (await res.json()) as { id: string };
  return json.id;
}

// ─── OAuth Flow ───────────────────────────────────────────────────────────────

const GOOGLE_OAUTH_SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/userinfo.email',
].join(' ');

/**
 * Gera a URL de autorização para redirecionar o usuário ao Google OAuth.
 * state = companyId (para associar o token à empresa correta no callback).
 */
export function buildGoogleOAuthUrl(companyId: string): string {
  const { clientId, redirectUri } = getOAuthConfig();

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: GOOGLE_OAUTH_SCOPES,
    access_type: 'offline',   // garante refresh_token
    prompt: 'consent',         // força re-exibição mesmo se já autorizado
    state: companyId,
  });

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export interface GoogleTokens {
  access_token: string;
  refresh_token: string;
  /** Email da conta Google autorizada */
  email: string;
}

/**
 * Troca o authorization code (recebido no callback OAuth) pelos tokens.
 * O refresh_token deve ser salvo de forma persistente na tabela companies.
 */
export async function exchangeCodeForTokens(code: string): Promise<GoogleTokens> {
  const { clientId, clientSecret, redirectUri } = getOAuthConfig();

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Falha ao trocar code por tokens: ${res.status} — ${body}`);
  }

  const json = (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    id_token?: string;
  };

  if (!json.refresh_token) {
    throw new Error(
      'Google não retornou refresh_token. Revogue o acesso em myaccount.google.com e tente novamente.',
    );
  }

  // Decodificar email do id_token (JWT payload, sem verificação de assinatura aqui)
  let email = '';
  if (json.id_token) {
    try {
      const payload = JSON.parse(
        Buffer.from(json.id_token.split('.')[1], 'base64url').toString('utf-8'),
      ) as { email?: string };
      email = payload.email ?? '';
    } catch {
      // id_token malformado — email fica vazio
    }
  }

  return {
    access_token: json.access_token,
    refresh_token: json.refresh_token,
    email,
  };
}
