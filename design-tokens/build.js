/**
 * Build script til Style Dictionary v4
 */

import StyleDictionary from 'style-dictionary';

// Konfigurer Style Dictionary
const sd = StyleDictionary.extend({
  source: ['tokens/**/*.json'],
  platforms: {
    eboks: {
      source: [
        'tokens/globals/value.json',
        'tokens/theme/light.json', 
        'tokens/theme/dark.json',
        'tokens/brand/eboks.json'
      ],
      transformGroup: 'js',
      buildPath: 'build/',
      files: [{
        destination: 'eboks-tokens.json',
        format: 'json/nested',
        options: {
          outputReferences: true
        }
      }]
    },
    nykredit: {
      source: [
        'tokens/globals/value.json',
        'tokens/theme/light.json', 
        'tokens/theme/dark.json',
        'tokens/brand/nykredit.json'
      ],
      transformGroup: 'js',
      buildPath: 'build/',
      files: [{
        destination: 'nykredit-tokens.json',
        format: 'json/nested',
        options: {
          outputReferences: true
        }
      }]
    },
    postnl: {
      source: [
        'tokens/globals/value.json',
        'tokens/theme/light.json', 
        'tokens/theme/dark.json',
        'tokens/brand/postnl.json'
      ],
      transformGroup: 'js',
      buildPath: 'build/',
      files: [{
        destination: 'postnl-tokens.json',
        format: 'json/nested',
        options: {
          outputReferences: true
        }
      }]
    }
  }
});

// Byg alle platforms
console.log('Bygger tokens for alle brands...');
sd.buildAllPlatforms();
console.log('Færdig! Tokens er gemt i build-mappen.');