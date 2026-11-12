/**
 * Artwork styles a user can pick. Keys are stored; labels are for display and prompts.
 * Keep in sync with frontend/src/config/artStyles.js.
 */
export const ART_STYLES = Object.freeze({
  none: 'No specific style',
  'digital-art': 'Digital art',
  cyberpunk: 'Cyberpunk',
  fantasy: 'Fantasy',
  anime: 'Anime',
  'pixel-art': 'Pixel art',
  watercolor: 'Watercolor',
  'oil-painting': 'Oil painting',
  '3d-render': '3D render',
  abstract: 'Abstract',
  photorealistic: 'Photorealistic',
});

export const ART_STYLE_KEYS = Object.freeze(Object.keys(ART_STYLES));
