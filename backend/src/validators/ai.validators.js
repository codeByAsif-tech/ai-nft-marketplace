import { body, param, query } from 'express-validator';
import { ART_STYLE_KEYS } from '../constants/artStyles.js';

const MAX_ATTRIBUTES = 20;

export const suggestRules = [
  body('prompt')
    .isString()
    .withMessage('Describe your artwork idea')
    .bail()
    .trim()
    .isLength({ min: 3, max: 500 })
    .withMessage('Prompt must be 3–500 characters'),
  body('style').optional().isIn(ART_STYLE_KEYS).withMessage('Unknown style'),
];

/**
 * Attributes arrive as a JSON string in multipart forms and as an array in
 * JSON bodies; normalise both, then validate each trait.
 */
const attributesRule = () =>
  body('attributes')
    .optional()
    .customSanitizer((value) => {
      if (typeof value !== 'string') return value;
      try {
        return JSON.parse(value);
      } catch {
        return value; // validator below will reject it
      }
    })
    .custom((value) => {
      if (!Array.isArray(value)) throw new Error('Attributes must be a list');
      if (value.length > MAX_ATTRIBUTES) throw new Error(`At most ${MAX_ATTRIBUTES} attributes`);
      const seen = new Set();
      for (const attr of value) {
        if (!attr || typeof attr !== 'object') throw new Error('Each attribute needs a trait type and a value');
        const type = typeof attr.trait_type === 'string' ? attr.trait_type.trim() : '';
        const val = typeof attr.value === 'string' || typeof attr.value === 'number' ? String(attr.value).trim() : '';
        if (!type || !val) throw new Error('Each attribute needs a trait type and a value');
        if (type.length > 40) throw new Error('Trait types must be at most 40 characters');
        if (val.length > 60) throw new Error('Trait values must be at most 60 characters');
        if (seen.has(type.toLowerCase())) throw new Error(`Duplicate trait type "${type}"`);
        seen.add(type.toLowerCase());
      }
      return true;
    })
    .customSanitizer((value) =>
      Array.isArray(value)
        ? value.map((a) => ({ trait_type: String(a.trait_type).trim(), value: String(a.value).trim() }))
        : value
    );

const detailRules = () => [
  body('name').optional().isString().trim().isLength({ max: 60 }).withMessage('Name must be at most 60 characters'),
  body('description')
    .optional()
    .isString()
    .trim()
    .isLength({ max: 1000 })
    .withMessage('Description must be at most 1000 characters'),
  body('collectionName')
    .optional()
    .isString()
    .trim()
    .isLength({ max: 60 })
    .withMessage('Collection name must be at most 60 characters'),
  body('prompt').optional().isString().trim().isLength({ max: 500 }).withMessage('Prompt must be at most 500 characters'),
  body('style').optional().isIn(ART_STYLE_KEYS).withMessage('Unknown style'),
  body('aiSuggested').optional().isBoolean().toBoolean(),
  attributesRule(),
];

export const createGenerationRules = detailRules();
export const updateGenerationRules = detailRules();

export const idParamRules = [param('id').isMongoId().withMessage('Invalid id')];

export const listRules = [
  query('page').optional().isInt({ min: 1, max: 10000 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 50 }).toInt(),
];
