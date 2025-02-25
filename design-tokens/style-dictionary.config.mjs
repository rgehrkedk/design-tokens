// style-dictionary.config.mjs

import StyleDictionary from 'style-dictionary';
import { registerTransforms } from '@tokens-studio/sd-transforms';

// 1) Kald registerTransforms med Style Dictionary
registerTransforms(StyleDictionary);

// 2) (Valgfrit) - i nogle versioner skal man selv definere transformGroups.
//    Hvis du får fejl om “Unknown transformGroup 'tokens-studio'”,
//    kan du i stedet definere en custom group eller prøve en eksisterende:

// Eksempel på custom group med nogle “ts/” transforms
// (Her gætter vi på, at 1.0.0 indeholder nogle “ts/color/...”-transformers)
// (Hvis du får fejl, slet nogle af transform-navnene eller tjek i plugin-koden)
StyleDictionary.registerTransformGroup({
  name: 'tokens-studio',
  transforms: [
    'ts/color/modifiers',
    'ts/color/css/hsl',
    'ts/size/px',
    'ts/opacity',
    'name/cti/kebab',
  ]
});

// 3) Eksportér konfiguration
export default {
  source: ['tokens/*.json'],
  platforms: {
    minimal: {
      transformGroup: 'tokens-studio',
      buildPath: 'build/',
      files: [
        {
          format: 'json/nested',
          destination: 'tokens.json'
        }
      ]
    }
  }
};