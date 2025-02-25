/**
 * Build script til Style Dictionary (async ES modules version)
 */

import { fileURLToPath } from 'url';
import { dirname } from 'path';

// Få den aktuelle filsti (erstatning for __dirname i ES modules)
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Dynamisk import af moduler
async function buildTokens() {
  try {
    // Importér modulerne dynamisk
    const StyleDictionaryModule = await import('style-dictionary');
    const configModule = await import('./style-dictionary.config.js');
    
    // Hent de rette eksporter
    const StyleDictionary = StyleDictionaryModule.default || StyleDictionaryModule;
    const config = configModule.default || configModule;
    
    // Opsæt Style Dictionary
    const sd = StyleDictionary.extend(config);
    
    // Byg alle platforme
    console.log('Bygger tokens for alle brands...');
    sd.buildAllPlatforms();
    
    console.log('\nBygning færdig! Token-filer er gemt i build-mappen.');
  } catch (error) {
    console.error('Fejl under bygning af tokens:', error);
  }
}

// Kør bygningen
buildTokens();