// Keep in sync with backend/src/constants/artStyles.js
export const ART_STYLES = [
  { key: 'none', label: 'No specific style' },
  { key: 'digital-art', label: 'Digital art' },
  { key: 'cyberpunk', label: 'Cyberpunk' },
  { key: 'fantasy', label: 'Fantasy' },
  { key: 'anime', label: 'Anime' },
  { key: 'pixel-art', label: 'Pixel art' },
  { key: 'watercolor', label: 'Watercolor' },
  { key: 'oil-painting', label: 'Oil painting' },
  { key: '3d-render', label: '3D render' },
  { key: 'abstract', label: 'Abstract' },
  { key: 'photorealistic', label: 'Photorealistic' },
]

export const styleLabel = (key) => ART_STYLES.find((s) => s.key === key)?.label ?? key

// Mirrors the backend limits so users get instant feedback; the backend re-checks everything.
export const IMAGE_RULES = {
  types: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'],
  accept: '.png,.jpg,.jpeg,.webp,.gif',
  maxBytes: 10 * 1024 * 1024,
  minDimension: 64,
  maxDimension: 8192,
}

export const MAX_ATTRIBUTES = 20
