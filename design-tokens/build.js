/**
 * Build script til Style Dictionary v4
 */

// I version 4, er API'en muligvis ændret
import * as StyleDictionaryPackage from 'style-dictionary';

// Få adgang til StyleDictionary konstruktøren
const StyleDictionary = StyleDictionaryPackage.default || StyleDictionaryPackage;

// Log lidt information om versionen
console.log('Style Dictionary Version:', StyleDictionaryPackage.version || 'Unknown');

// Konfiguration
const config = {
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
};

// Forskellige måder at kunne tilgå .extend metoden
let sd;
try {
  if (typeof StyleDictionary.extend === 'function') {
    sd = StyleDictionary.extend(config);
    console.log('Brugte StyleDictionary.extend');
  } else if (StyleDictionary.core && typeof StyleDictionary.core.extend === 'function') {
    sd = StyleDictionary.core.extend(config);
    console.log('Brugte StyleDictionary.core.extend');
  } else if (typeof StyleDictionary === 'function') {
    sd = StyleDictionary(config);
    console.log('Brugte StyleDictionary som konstruktør');
  } else {
    throw new Error('Kunne ikke finde extend metoden på StyleDictionary');
  }

  // Byg alle platforme
  console.log('Bygger tokens for alle brands...');
  sd.buildAllPlatforms();
  console.log('Færdig! Tokens er gemt i build-mappen.');
} catch (error) {
  console.error('Fejl ved bygning af tokens:', error);
  console.error('Style Dictionary struktur:', StyleDictionary);
}