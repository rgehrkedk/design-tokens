/**
 * Optimeret build script til Style Dictionary v4
 * Fokuserer på at bevare token-referencer korrekt
 */

import StyleDictionary from 'style-dictionary';
import fs from 'fs';
import path from 'path';

console.log('Style Dictionary Version:', StyleDictionary.VERSION);

// Registrer et brugerdefineret format, der bevarer referencer og hierarki
StyleDictionary.registerFormat({
  name: 'json/enhanced',
  formatter: function(dictionary) {
    const { tokens } = dictionary;
    return JSON.stringify(tokens, null, 2);
  }
});

// Funktion til at bygge tokens for et specifikt brand
function buildBrand(brand) {
  console.log(`\nBygger tokens for ${brand}...`);
  
  // Konfigurer kildefiler
  const config = {
    source: [
      'tokens/globals/value.json',
      'tokens/theme/light.json', 
      'tokens/theme/dark.json',
      `tokens/brand/${brand}.json`
    ],
    platforms: {
      json: {
        transformGroup: 'js',
        buildPath: 'build/',
        files: [{
          destination: `${brand}-tokens.json`,
          format: 'json/enhanced',
          options: {
            outputReferences: true
          }
        }]
      }
    }
  };
  
  try {
    // Byg tokens med den metode der virker
    const sd = new StyleDictionary(config);
    sd.buildAllPlatforms();
    
    // Udfør efterbehandling for at sikre at alle referencer er bevaret
    enhanceTokenFile(brand);
    
    console.log(`✅ ${brand} tokens bygget og forbedret!`);
  } catch (error) {
    console.error(`❌ Fejl ved bygning af ${brand} tokens:`, error);
  }
}

// Efterbehandling for at forbedre token-filen
function enhanceTokenFile(brand) {
  const filePath = path.join('build', `${brand}-tokens.json`);
  
  try {
    // Læs original token-fil
    const tokenData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    
    // Læs alle kildefiler for at sikre komplette referencer
    const globalTokens = JSON.parse(fs.readFileSync('tokens/globals/value.json', 'utf8'));
    const lightTheme = JSON.parse(fs.readFileSync('tokens/theme/light.json', 'utf8'));
    const darkTheme = JSON.parse(fs.readFileSync('tokens/theme/dark.json', 'utf8'));
    const brandTokens = JSON.parse(fs.readFileSync(`tokens/brand/${brand}.json`, 'utf8'));
    
    // Kombiner tokens
    const enhancedTokens = {
      ...globalTokens,
      ...lightTheme,
      ...darkTheme,
      ...brandTokens,
      ...tokenData
    };
    
    // Gem forbedret token-fil
    fs.writeFileSync(filePath, JSON.stringify(enhancedTokens, null, 2));
  } catch (error) {
    console.error(`Fejl ved efterbehandling af ${brand} tokens:`, error);
  }
}

// Hovedfunktion
function main() {
  // Sørg for at output-mappen eksisterer
  if (!fs.existsSync('build')) {
    fs.mkdirSync('build');
  }
  
  // Byg tokens for hvert brand
  ['eboks', 'nykredit', 'postnl'].forEach(buildBrand);
  
  console.log('\n✅ Alle tokens er bygget!');
}

// Kør programmet
main();