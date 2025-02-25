/**
 * Opdateret simpel build script for Style Dictionary v4
 */

// Import Style Dictionary
import StyleDictionary from 'style-dictionary';

// Log version og strukturer for at hjælpe med at fejlfinde
console.log('Style Dictionary VERSION:', StyleDictionary.VERSION);
console.log('Style Dictionary constructor type:', typeof StyleDictionary);
console.log('Direkte properties på StyleDictionary:', Object.getOwnPropertyNames(StyleDictionary));
console.log('Er StyleDictionary en class:', StyleDictionary.toString().startsWith('class'));

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
        }
      }]
    }
  }
};

try {
  console.log('Starter StyleDictionary bygning...');
  
  // Prøv at anvende StyleDictionary som en klasse (constructor)
  try {
    console.log('Prøver at anvende StyleDictionary som en constructor...');
    const sd = new StyleDictionary(config);
    
    // Tjek om der er en buildAllPlatforms metode
    if (typeof sd.buildAllPlatforms === 'function') {
      console.log('Bygger tokens for alle brands med sd.buildAllPlatforms()...');
      sd.buildAllPlatforms();
      console.log('✅ Færdig! Tokens er gemt i build-mappen.');
    } else {
      console.log('Tilgængelige metoder på sd:', Object.getOwnPropertyNames(sd));
      
      // Prøv build metoden hvis buildAllPlatforms ikke findes
      if (typeof sd.build === 'function') {
        console.log('Bygger tokens for alle brands med sd.build()...');
        sd.build();
        console.log('✅ Færdig! Tokens er gemt i build-mappen.');
      } else {
        throw new Error('Kunne ikke finde build eller buildAllPlatforms metoder');
      }
    }
  } catch (constructorError) {
    console.log('Constructor approach failed:', constructorError.message);
    
    // Prøv at kalde StyleDictionary som en funktion
    console.log('Prøver at kalde StyleDictionary som en funktion...');
    const sd = StyleDictionary(config);
    
    if (typeof sd.buildAllPlatforms === 'function') {
      console.log('Bygger tokens for alle brands med funktionsresultat...');
      sd.buildAllPlatforms();
      console.log('✅ Færdig! Tokens er gemt i build-mappen.');
    } else if (typeof sd.build === 'function') {
      console.log('Bygger tokens med sd.build()...');
      sd.build();
      console.log('✅ Færdig! Tokens er gemt i build-mappen.');
    } else {
      throw new Error('Kunne ikke finde build metoder på funktionsresultatet');
    }
  }
} catch (error) {
  console.error('❌ Fejl ved bygning af tokens:', error);
}