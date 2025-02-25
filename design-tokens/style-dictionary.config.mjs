// style-dictionary.config.mjs

import StyleDictionary from 'style-dictionary';
import { transformers } from '@tokens-studio/sd-transforms';

// Her kalder vi "transformers.registerTransforms(...)" – i v1.2.9 er det denne metode
transformers.registerTransforms(StyleDictionary);

export default {
  platforms: {
    brandEboks: {
      source: [
        'tokens/globals/value.json',
        'tokens/theme/light.json',
        'tokens/theme/dark.json',
        'tokens/brand/eboks.json'
      ],
      // "tokens-studio" er den transformGroup, sd-transforms normalt definerer
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