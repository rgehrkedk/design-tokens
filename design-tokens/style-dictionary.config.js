const StyleDictionary = require('style-dictionary');

// (valgfrit) Custom transforms eller tokens-studio transforms
// e.g.:
// const sdTransforms = require('@tokens-studio/sd-transforms');
// sdTransforms.registerTransforms(StyleDictionary); // hvis I vil have tokens-studio reference parsing

module.exports = {
  // I dette eksempel sætter vi “source” for hver "platform"
  platforms: {
    eboks_light: {
      source: [
        'tokens/globals/value.json',
        'tokens/theme/light.json',
        'tokens/brand/eboks.json'
      ],
      transformGroup: 'tokens-studio',    // brug tokens-studio transforms
      buildPath: 'build/eboks/light/',    // mappe for genererede filer
      files: [
        {
          destination: 'tokens.json',    // fx "tokens.json"
          format: 'json/nested'
        }
      ]
    },
    eboks_dark: {
      source: [
        'tokens/globals/value.json',
        'tokens/theme/dark.json',
        'tokens/brand/eboks.json'
      ],
      transformGroup: 'tokens-studio',
      buildPath: 'build/eboks/dark/',
      files: [
        {
          destination: 'tokens.json',
          format: 'json/nested'
        }
      ]
    },

    // PostNL
    postnl_light: {
      source: [
        'tokens/globals/value.json',
        'tokens/theme/light.json',
        'tokens/brand/postnl.json'
      ],
      transformGroup: 'tokens-studio',
      buildPath: 'build/postnl/light/',
      files: [
        {
          destination: 'tokens.json',
          format: 'json/nested'
        }
      ]
    },
    postnl_dark: {
      source: [
        'tokens/globals/value.json',
        'tokens/theme/dark.json',
        'tokens/brand/postnl.json'
      ],
      transformGroup: 'tokens-studio',
      buildPath: 'build/postnl/dark/',
      files: [
        {
          destination: 'tokens.json',
          format: 'json/nested'
        }
      ]
    },

    // Nykredit
    nykredit_light: {
      source: [
        'tokens/globals/value.json',
        'tokens/theme/light.json',
        'tokens/brand/nykredit.json'
      ],
      transformGroup: 'tokens-studio',
      buildPath: 'build/nykredit/light/',
      files: [
        {
          destination: 'tokens.json',
          format: 'json/nested'
        }
      ]
    },
    nykredit_dark: {
      source: [
        'tokens/globals/value.json',
        'tokens/theme/dark.json',
        'tokens/brand/nykredit.json'
      ],
      transformGroup: 'tokens-studio',
      buildPath: 'build/nykredit/dark/',
      files: [
        {
          destination: 'tokens.json',
          format: 'json/nested'
        }
      ]
    }
  }
};