/**
 * Forbedret build script til korrekt reference håndtering i Style Dictionary v4
 */

import StyleDictionary from 'style-dictionary';

console.log('Style Dictionary Version:', StyleDictionary.VERSION);

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
          outputReferences: true,
          // Style Dictionary v4 understøtter outputReferenceFallbacks
          // Dette sikrer, at reference-værdier bevares selvom de ikke kan opløses
          outputReferenceFallbacks: true 
        },
        filter: (token) => {
          return token.filePath.includes('eboks.json') || 
                 !token.filePath.includes('brand/');
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
          outputReferences: true,
          outputReferenceFallbacks: true
        },
        filter: (token) => {
          return token.filePath.includes('nykredit.json') || 
                 !token.filePath.includes('brand/');
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
          outputReferences: true,
          outputReferenceFallbacks: true
        },
        filter: (token) => {
          return token.filePath.includes('postnl.json') || 
                 !token.filePath.includes('brand/');
        }
      }]
    }
  }
};

try {
  console.log('Bygger tokens med bevarelse af referencer...');
  const sd = StyleDictionary(config);
  
  // Udskriv tokens før bygning for at tjekke strukturen
  console.log('Starter bygning af tokens...');
  
  sd.buildAllPlatforms();
  console.log('✅ Færdig! Tokens er gemt i build-mappen.');
} catch (error) {
  console.error('❌ Bygning fejlede:', error);
}