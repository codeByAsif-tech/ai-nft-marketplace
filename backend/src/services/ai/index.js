import { env } from '../../config/env.js';
import { createDisabledProvider } from './providers/disabled.provider.js';
import { createGroqTextProvider } from './providers/groqText.provider.js';

/**
 * AI provider registry. The rest of the app only talks to these two objects,
 * so switching AI services, or enabling image generation later, only means
 * adding a provider here.
 *
 * Text provider contract:  getStatus(), suggestMetadata({ prompt, style })
 * Image provider contract: getStatus(), generateImage({ prompt, style })  -> { buffer, ext }
 */

function createTextProvider() {
  switch (env.ai.textProvider) {
    case 'groq':
      return createGroqTextProvider(env.ai.groq);
    case 'none':
      return createDisabledProvider({ capability: 'text', reason: 'AI text suggestions are turned off' });
    default:
      throw new Error(`Unknown AI_TEXT_PROVIDER "${env.ai.textProvider}" (use "groq" or "none")`);
  }
}

function createImageProvider() {
  switch (env.ai.imageProvider) {
    case 'none':
      return createDisabledProvider({
        capability: 'image',
        reason: 'AI image generation is not enabled on this server. Upload your own artwork instead.',
      });
    default:
      throw new Error(`Unknown AI_IMAGE_PROVIDER "${env.ai.imageProvider}"`);
  }
}

export const textProvider = createTextProvider();
export const imageProvider = createImageProvider();

export async function getAiStatus() {
  const [text, image] = await Promise.all([textProvider.getStatus(), imageProvider.getStatus()]);
  return { text, image };
}
