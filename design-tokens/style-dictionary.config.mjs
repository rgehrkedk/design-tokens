// style-dictionary.config.mjs

import StyleDictionary from 'style-dictionary';
// Bemærk brug af "registerTokenStudioTransforms" frem for "registerTransforms"
import { registerTokenStudioTransforms } from '@tokens-studio/sd-transforms';

registerTokenStudioTransforms(StyleDictionary);

export default {
  platforms: {
    brandEboks: {
      source: [
        'tokens/globals/value.json',
        'tokens/theme/light.json',
        'tokens/theme/dark.json',
        'tokens/brand/eboks.json'
      ],
      transformGroup: 'tokens-studio',
      buildPath: 'build/eboks/',
      files: [
        {
          format: 'json/nested',
          destination: 'eboks-tokens.json'
        }
      ]
    },
    brandPostnl: {
      source: [
        'tokens/globals/value.json',
        'tokens/theme/light.json',
        'tokens/theme/dark.json',
        'tokens/brand/postnl.json'
      ],
      transformGroup: 'tokens-studio',
      buildPath: 'build/postnl/',
      files: [
        {
          format: 'json/nested',
          destination: 'postnl-tokens.json'
        }
      ]
    },
    brandNykredit: {
      source: [
        'tokens/globals/value.json',
        'tokens/theme/light.json',
        'tokens/theme/dark.json',
        'tokens/brand/nykredit.json'
      ],
      transformGroup: 'tokens-studio',
      buildPath: 'build/nykredit/',
      files: [
        {
          format: 'json/nested',
          destination: 'nykredit-tokens.json'
        }
      ]
    }
  }
};