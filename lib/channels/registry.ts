import { ChannelProvider, ChannelAdapter, ChannelCapabilities } from './types';
import { WhatsAppAdapter } from './adapters/whatsapp-adapter';
import { InstagramAdapter } from './adapters/instagram-adapter';

const adapters: Record<ChannelProvider, ChannelAdapter | null> = {
  whatsapp: new WhatsAppAdapter(),
  instagram: new InstagramAdapter(),
  telegram: null,
  messenger: null,
  webchat: null,
  email: null,
  discord: null,
};

export const ALL_PROVIDERS: ChannelProvider[] = ['whatsapp', 'instagram', 'telegram', 'messenger', 'webchat', 'email', 'discord'];

export function getAdapter(provider: ChannelProvider): ChannelAdapter {
  const adapter = adapters[provider];
  if (!adapter) {
    throw new Error(`Adapter for provider '${provider}' is not implemented or registered.`);
  }
  return adapter;
}

export function getCapabilities(provider: ChannelProvider): ChannelCapabilities {
  const adapter = adapters[provider];
  if (adapter) {
    return adapter.capabilities;
  }
  
  // Return a generic/disabled capability set for unimplemented channels
  return {
    supportsText: false,
    supportsImage: false,
    supportsAudio: false,
    supportsVideo: false,
    supportsDocument: false,
    supportsSticker: false,
    supportsLocation: false,
    supportsReaction: false,
    supportsTypingIndicator: false,
    supportsTTS: false,
    supportsRichText: false,
    supportsButtons: false,
    maxTextLength: 0,
    maxMediaSizeMB: 0,
    rateLimitPerSecond: 0,
    humanReadableName: provider.charAt(0).toUpperCase() + provider.slice(1),
    icon: 'MessageCircle',
    color: '#CCCCCC',
    formatInstructions: `Use plain text for ${provider}.`,
  };
}
