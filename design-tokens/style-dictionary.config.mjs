import StyleDictionary from 'style-dictionary';
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
    // postnl, nykredit, ...
  }
};