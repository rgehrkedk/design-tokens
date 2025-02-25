/**
 * Meget enkel build script for Style Dictionary v4
 */

import StyleDictionary from 'style-dictionary';

// Log StyleDictionary version
console.log('Style Dictionary Version:', StyleDictionary.version);

// Konfiguration for alle brands
const config = {
  source: [
    'tokens/**/*.json'
  ],
  platforms: {
    eboks: {
      transformGroup: 'js',
      buildPath: 'build/',
      files: [{
        destination: 'eboks-tokens.json',
        format: 'json/nested',
        options: {
          outputReferences: true
        },
        filter: {
          attributes: {
            brand: 'eboks'
          }
        }
      }]
    },
    nykredit: {
      transformGroup: 'js',
      buildPath: 'build/',
      files: [{
        destination: 'nykredit-tokens.json',
        format: 'json/nested',
        options: {
          outputReferences: true
        },
        filter: {
          attributes: {
            brand: 'nykredit'
          }
        }
      }]
    },
    postnl: {
      transformGroup: 'js',
      buildPath: 'build/',
      files: [{
        destination: 'postnl-tokens.json',
        format: 'json/nested',
        options: {
          outputReferences: true
        },
        filter: {
          attributes: {
            brand: 'postnl'
          }
        }
      }]
    }
  }
};

try {
  // Opret StyleDictionary instance med config
  const sd = StyleDictionary.extend(config);
  
  // Byg alle platforme
  console.log('Bygger tokens for alle brands...');
  sd.buildAllPlatforms();
  
  console.log('✅ Færdig! Tokens er gemt i build-mappen.');
} catch (error) {
  console.error('❌ Fejl ved bygning af tokens:', error);
}