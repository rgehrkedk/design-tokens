/**
 * Minimal build script til Style Dictionary v4
 */

// Import Style Dictionary med korrekt ESM import
import * as StyleDictionaryPkg from 'style-dictionary';

// Få adgang til StyleDictionary - v4 har ændret eksportstrukturen
const StyleDictionary = StyleDictionaryPkg.default || StyleDictionaryPkg;

// Log StyleDictionary version
console.log('Style Dictionary Version:', StyleDictionaryPkg.version);
console.log('StyleDictionary objekt struktur:', Object.keys(StyleDictionary));

// Definer en meget simpel konfiguration
const config = {
  source: ['tokens/**/*.json'],
  platforms: {
    json: {
      transformGroup: 'js',
      buildPath: 'build/',
      files: [
        {
          destination: 'eboks-tokens.json',
          format: 'json/nested',
          filter: (token) => {
            // Simple filter der kun inkluderer eboks brand tokens
            return token.filePath.includes('eboks.json') || 
                   !token.filePath.includes('brand/');
          }
        },
        {
          destination: 'nykredit-tokens.json',
          format: 'json/nested',
          filter: (token) => {
            // Simple filter der kun inkluderer nykredit brand tokens
            return token.filePath.includes('nykredit.json') || 
                   !token.filePath.includes('brand/');
          }
        },
        {
          destination: 'postnl-tokens.json',
          format: 'json/nested',
          filter: (token) => {
            // Simple filter der kun inkluderer postnl brand tokens
            return token.filePath.includes('postnl.json') || 
                   !token.filePath.includes('brand/');
          }
        }
      ]
    }
  }
};

try {
  console.log('Starter StyleDictionary bygning...');
  
  // Kontroller om extend-metoden findes
  if (typeof StyleDictionary.extend === 'function') {
    console.log('Bruger StyleDictionary.extend() metoden');
    const sd = StyleDictionary.extend(config);
    
    // Kontroller om buildAllPlatforms metoden eksisterer
    if (typeof sd.buildAllPlatforms === 'function') {
      console.log('Bygger tokens for alle brands...');
      sd.buildAllPlatforms();
      console.log('✅ Færdig! Tokens er gemt i build-mappen.');
    } else {
      console.error('❌ buildAllPlatforms metoden findes ikke på StyleDictionary objektet');
      console.log('Tilgængelige metoder:', Object.keys(sd));
    }
  } else if (StyleDictionary.core && typeof StyleDictionary.core.extend === 'function') {
    console.log('Bruger StyleDictionary.core.extend() metoden');
    const sd = StyleDictionary.core.extend(config);
    sd.buildAllPlatforms();
    console.log('✅ Færdig! Tokens er gemt i build-mappen.');
  } else {
    console.error('❌ Kunne ikke finde extend metoden på StyleDictionary');
    console.log('StyleDictionary objekt struktur:', StyleDictionary);
  }
} catch (error) {
  console.error('❌ Fejl ved bygning af tokens:', error);
}