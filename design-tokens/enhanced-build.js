/**
 * Forbedret build script for Style Dictionary v4
 * 
 * Dette script bygger design tokens for tre brands:
 * - eboks
 * - nykredit
 * - postnl
 * 
 * Hver brand bruger fælles globale tokens og tema tokens,
 * kombineret med brandspecifikke tokens.
 */

import StyleDictionary from 'style-dictionary';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

// Håndter filsti i ESM context
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Registrer output-mappe
const OUTPUT_DIR = path.resolve(__dirname, 'build');

// Opret output-mappe hvis den ikke findes
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  console.log(`Oprettet output-mappe: ${OUTPUT_DIR}`);
}

// Log StyleDictionary version
console.log('Style Dictionary Version:', StyleDictionary.version);

/**
 * Bygger tokens for et specifikt brand
 * @param {string} brand - brandnavn (eboks, nykredit, postnl)
 */
function buildBrandTokens(brand) {
  console.log(`\n🔧 Bygger tokens for ${brand}...`);
  
  // Definer kildefiler for token-opbygning
  const sources = [
    'tokens/globals/value.json',
    'tokens/theme/light.json', 
    'tokens/theme/dark.json',
    `tokens/brand/${brand}.json`
  ];
  
  // Opret Style Dictionary configuration
  const config = {
    source: sources,
    platforms: {
      json: {
        transformGroup: 'js',
        buildPath: 'build/',
        files: [{
          destination: `${brand}-tokens.json`,
          format: 'json/nested',
          options: {
            outputReferences: true
          }
        }]
      }
    }
  };

  try {
    // Udvid StyleDictionary med konfigurationen og byg
    const sd = StyleDictionary.extend(config);
    sd.buildAllPlatforms();
    console.log(`✅ ${brand} tokens bygget succesfuldt!`);
  } catch (error) {
    console.error(`❌ Fejl ved bygning af ${brand} tokens:`, error);
    throw error; // Re-throw for at håndtere det i main funktion
  }
}

/**
 * Hovedfunktion der kører build processen
 */
function main() {
  console.log('🚀 Starter Design Tokens build proces...');
  
  const brands = ['eboks', 'nykredit', 'postnl'];
  
  try {
    // For hver brand, byg tokens
    for (const brand of brands) {
      buildBrandTokens(brand);
    }
    
    console.log('\n✨ Alle tokens er bygget succesfuldt!');
    console.log(`📁 Tokens er gemt i ${OUTPUT_DIR} mappen`);
  } catch (error) {
    console.error('❌ Build process fejlede:', error);
    process.exit(1);
  }
}

// Kør programmet
main();