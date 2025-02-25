// style-dictionary.config.js

const StyleDictionary = require('style-dictionary');
const sdTransforms = require('@tokens-studio/sd-transforms');

// 1. Registrér tokens-studio transforms, så referencer opløses korrekt
sdTransforms.registerTransforms(StyleDictionary);

module.exports = {
  platforms: {
    // brand eBoks
    eboks: {
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
    postnl: {
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
    nykredit: {
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