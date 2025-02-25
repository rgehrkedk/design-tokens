// style-dictionary.config.mjs

import StyleDictionary from 'style-dictionary';
import { registerTransforms } from '@tokens-studio/sd-transforms';

// 1. Registrér tokens-studio transforms
registerTransforms(StyleDictionary);

export default {
  platforms: {
    // brand eBoks
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
    // brand PostNL
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
    // brand Nykredit
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