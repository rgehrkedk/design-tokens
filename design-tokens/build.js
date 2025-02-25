/**
 * Build script til Style Dictionary (ES modules version)
 */

import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

// Opret en require-funktion for at importere CommonJS-moduler
const require = createRequire(import.meta.url);

// Få den aktuelle filsti
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Importér Style Dictionary som CommonJS modul
const StyleDictionary = require('style-dictionary');

// Importér konfigurationen
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

try {
  // Opsæt Style Dictionary
  const sd = StyleDictionary.extend(config);
  
  // Byg alle platforme
  console.log('Bygger tokens for alle brands...');
  sd.buildAllPlatforms();
  
  console.log('\nBygning færdig! Token-filer er gemt i build-mappen.');
} catch (error) {
  console.error('Fejl under bygning af tokens:', error);
}