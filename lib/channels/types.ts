export type ChannelProvider = 'whatsapp' | 'instagram' | 'telegram' | 'messenger' | 'webchat' | 'email' | 'discord';

export interface ChannelCapabilities {
  supportsText: boolean;
  supportsImage: boolean;
  supportsAudio: boolean;
  supportsVideo: boolean;
  supportsDocument: boolean;
  supportsSticker: boolean;
  supportsLocation: boolean;
  supportsReaction: boolean;
  supportsTypingIndicator: boolean;
  supportsTTS: boolean;
  supportsRichText: boolean;        // markdown/HTML
  supportsButtons: boolean;         // quick replies
  maxTextLength: number;
  maxMediaSizeMB: number;
  rateLimitPerSecond: number;
  humanReadableName: string;
  icon: string;                     // lucide icon name
  color: string;                    // hex
  formatInstructions: string;       // injected into AI system prompt
}

export interface IncomingMessage {
  provider: ChannelProvider;
  channelId: string;               // UUID do channel no DB
  companyId: string;
  providerMessageId: string;
  senderIdentifier: string;        // phone p/ WA, igScopedId p/ IG
  senderName: string;
  type: 'text' | 'image' | 'audio' | 'video' | 'document' | 'sticker' | 'location' | 'reaction';
  text?: string;
  mediaId?: string;
  mediaMimeType?: string;
  mediaCaption?: string;
  location?: { lat: number; lng: number; name?: string };
  reaction?: { messageId: string; emoji: string };
  rawPayload: Record<string, any>; // payload original do provider
  timestamp: Date;
}

export interface OutgoingMessage {
  to: string;                       // identifier do destinatário
  text?: string;
  mediaUrl?: string;
  mediaType?: 'image' | 'audio' | 'video' | 'document';
  mediaCaption?: string;
  filename?: string;
  buttons?: { id: string; title: string }[];
  audioBuffer?: Buffer;             // opcional, para envios em buffer de áudio (TTS)
}

export interface SendResult {
  ok: boolean;
  providerMessageId?: string;
  error?: string;
}

export interface ChannelConfig {
  id: string;
  companyId: string;
  provider: ChannelProvider;
  providerId: string;
  accessToken: string;
  meta: Record<string, any>;
  status: 'active' | 'error' | 'paused';
}

export interface ParsedWebhookResult {
  messages: IncomingMessage[];
  statusUpdates: { messageId: string; status: string }[];
  provider: ChannelProvider;
  channelProviderId: string;       // para lookup no DB
}

export interface ChannelAdapter {
  provider: ChannelProvider;
  capabilities: ChannelCapabilities;
  
  sendText(channelConfig: ChannelConfig, msg: OutgoingMessage): Promise<SendResult>;
  sendMedia(channelConfig: ChannelConfig, msg: OutgoingMessage): Promise<SendResult>;
  sendTypingIndicator?(channelConfig: ChannelConfig, recipientId: string): Promise<void>;
  
  parseWebhookPayload(rawBody: string, headers: Headers): Promise<ParsedWebhookResult> | ParsedWebhookResult;
  validateWebhookSignature(rawBody: string, headers: Headers, secret: string): boolean;
}
