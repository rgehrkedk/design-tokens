/**
 * Forbedret version af simple-build der sikrer bevarelse af references
 * Baseret på den simple version der allerede virker
 */

// Import Style Dictionary
import StyleDictionary from 'style-dictionary';

// Log version - vi ved at denne fungerer
console.log('Style Dictionary Version:', StyleDictionary.VERSION);

// Konfiguration for alle brands - lignende simple-build
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
          // Dette sikrer at første niveau af referencer inkluderes
          includeMeta: true,
          // Denne indstilling bevarer hele token stien
          preserveRawValue: true
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
          includeMeta: true,
          preserveRawValue: true
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
          includeMeta: true,
          preserveRawValue: true
        }
      }]
    }
  }
};

try {
  console.log('Starter StyleDictionary bygning...');
  
  // Vi bruger new StyleDictionary() fordi det er sådan det virkede i simple-build
  console.log('Prøver at anvende StyleDictionary som en constructor...');
  const sd = new StyleDictionary(config);
  
  // Byg alle platforme
  console.log('Bygger tokens for alle brands...');
  sd.buildAllPlatforms();
  console.log('✅ Færdig! Tokens er gemt i build-mappen.');
} catch (error) {
  console.error('❌ Fejl ved bygning af tokens:', error);
}