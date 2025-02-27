/**
 * Kombineret token builder med det bedste fra begge verdener
 * - Konverterer hardcoded tema-referencer til $mode
 * - Inkluderer intelligent reference-håndtering
 * - Bevarer original struktur og opdager automatisk brands
 */

import fs from 'fs';
import path from 'path';

// Funktion til at læse og parse en JSON-fil
function readJsonFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(content);
  } catch (error) {
    console.error(`Fejl ved læsning af ${filePath}:`, error);
    return {};
  }
}

// Funktion til at gemme en JSON-fil
function writeJsonFile(filePath, data) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    return true;
  } catch (error) {
    console.error(`Fejl ved skrivning af ${filePath}:`, error);
    return false;
  }
}

// Funktion til at gemme en tekstfil
function writeTextFile(filePath, content) {
  try {
    fs.writeFileSync(filePath, content);
    return true;
  } catch (error) {
    console.error(`Fejl ved skrivning af ${filePath}:`, error);
    return false;
  }
}

/**
 * Opdaterer alle referencer rekursivt i et objekt
 * Kombinerer stikorrigering og tema-agnostisk håndtering
 * 
 * @param {Object} obj - Objektet der skal opdateres
 * @param {string} currentSection - Navn på den nuværende sektion
 * @return {Object} - Objekt med opdaterede referencer
 */
function updateReferences(obj, currentSection = '') {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }
  
  // Håndter token value referencer
  if (obj.value && typeof obj.value === 'string' && obj.value.startsWith('{') && obj.value.endsWith('}')) {
    const reference = obj.value.substring(1, obj.value.length - 1); // Fjern { }
    
    // Få sektionerne i referencen
    const refParts = reference.split('.');
    
    // TEMA-AGNOSTISK DEL: Konverter tema-specifikke referencer til at bruge $mode
    if (reference.startsWith('theme.light.') || reference.startsWith('theme.dark.')) {
      // Erstat 'light' eller 'dark' med '$mode'
      const agnosticRef = reference.replace(/theme\.(light|dark)\./, 'theme.$mode.');
      obj.value = `{${agnosticRef}}`;
    }
    // STI-KORREKTION: Opdater på basis af sektion
    else if (currentSection === 'components' || currentSection.startsWith('components.')) {
      if (refParts[0] === 'colors') {
        obj.value = `{brand.${reference}}`;
      } else if (['fg', 'bg'].includes(refParts[0])) {
        // Gør denne også tema-agnostisk
        obj.value = `{theme.$mode.${reference}}`;
      } else if (['numbers', 'typography'].includes(refParts[0])) {
        obj.value = `{globals.${reference}}`;
      }
    } 
    else if (currentSection.startsWith('theme.')) {
      if (refParts[0] === 'colors') {
        if (refParts.length > 1 && refParts[1] === 'brand') {
          obj.value = `{brand.${reference}}`;
        } else {
          obj.value = `{globals.${reference}}`;
        }
      } else if (['numbers', 'typography'].includes(refParts[0])) {
        obj.value = `{globals.${reference}}`;
      }
    }
  }
  
  // Rekursivt opdater egenskaber
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      const newSection = currentSection ? `${currentSection}.${key}` : key;
      obj[key] = updateReferences(obj[key], newSection);
    }
  }
  
  return obj;
}

/**
 * Finder alle tilgængelige brands
 */
function discoverBrands() {
  const brandDir = 'tokens/brand';
  
  try {
    if (!fs.existsSync(brandDir)) {
      console.error(`Brand mappe '${brandDir}' findes ikke!`);
      return [];
    }
    
    const files = fs.readdirSync(brandDir);
    const brands = files
      .filter(file => file.endsWith('.json'))
      .map(file => path.basename(file, '.json'));
    
    return brands;
  } catch (error) {
    console.error('Fejl ved automatisk opdagelse af brands:', error);
    return [];
  }
}

// Funktion til at bygge tokens for et specifikt brand
function buildBrand(brand) {
  console.log(`\nBygger tokens for ${brand}...`);
  
  // Definér kildefiler
  const globalFile = 'tokens/globals/value.json';
  const lightFile = 'tokens/theme/light.json';
  const darkFile = 'tokens/theme/dark.json';
  const brandFile = `tokens/brand/${brand}.json`;
  
  // Sikkerhedstjek for filernes eksistens
  if (!fs.existsSync(globalFile)) {
    console.error(`Global token fil '${globalFile}' findes ikke!`);
    return false;
  }
  
  if (!fs.existsSync(lightFile)) {
    console.error(`Light theme fil '${lightFile}' findes ikke!`);
    return false;
  }
  
  if (!fs.existsSync(darkFile)) {
    console.error(`Dark theme fil '${darkFile}' findes ikke!`);
    return false;
  }
  
  if (!fs.existsSync(brandFile)) {
    console.error(`Brand fil '${brandFile}' findes ikke!`);
    return false;
  }
  
  // Læs kildefiler
  const globals = readJsonFile(globalFile);
  const light = readJsonFile(lightFile);
  const dark = readJsonFile(darkFile);
  const brandData = readJsonFile(brandFile);
  
  // Udtræk components fra brandData
  const components = brandData.components || {};
  
  // Lav en kopi af brandData uden components
  const brandBase = { ...brandData };
  delete brandBase.components;
  
  // Opdater referencer for hver sektion
  const updatedGlobals = updateReferences(globals, 'globals');
  const updatedBrand = updateReferences(brandBase, 'brand');
  const updatedLight = updateReferences(light, 'theme.light');
  const updatedDark = updateReferences(dark, 'theme.dark');
  const updatedComponents = updateReferences(components, 'components');
  
  // Opret den strukturerede output
  const structuredOutput = {
    // Tilføj metadata til tokens
    _meta: {
      brand: brand,
      generatedAt: new Date().toISOString(),
      version: "1.0.0"
    },
    
    // 1. Globals (fra value.json)
    globals: updatedGlobals,
    
    // 2. Brand base (uden components)
    brand: updatedBrand,
    
    // 3. Theme (light og dark samlet)
    theme: {
      light: updatedLight,
      dark: updatedDark
    },
    
    // 4. Components (fra brand-filen)
    components: updatedComponents
  };
  
  // Gem struktureret output
  const outputFile = path.join('build', `${brand}-tokens.json`);
  if (writeJsonFile(outputFile, structuredOutput)) {
    console.log(`✅ ${brand}-tokens.json gemt til build-mappen med tema-agnostiske referencer`);
    
    // Generer også TypeScript-typer
    generateTypeDefinitions(brand, outputFile);
    
    return true;
  }
  
  return false;
}

/**
 * Genererer TypeScript type-definitioner for en token-fil
 */
function generateTypeDefinitions(brand, tokenFilePath) {
  const tsContent = `/**
 * Autogenererede TypeScript typer for ${brand} tokens
 * Genereret ${new Date().toISOString()}
 */

// Token basistyper
export type TokenType = 'color' | 'number' | 'string' | 'boolean';
export type TokenValue = string | number | boolean;

export interface DesignToken {
  type: TokenType;
  value: TokenValue | string;
}

export type TokenTree = {
  [key: string]: TokenTree | DesignToken;
}

// Metadata
export interface TokenMetadata {
  brand: string;
  generatedAt: string;
  version: string;
}

// Den komplette tokens-struktur
export interface ${capitalize(brand)}Tokens {
  _meta: TokenMetadata;
  globals: TokenTree;
  brand: TokenTree;
  theme: {
    light: TokenTree;
    dark: TokenTree;
  };
  components: TokenTree;
}

// Tema-mode type
export type ThemeMode = 'light' | 'dark';

// Deklaration for at sikre at import af JSON fungerer
declare module '*/${brand}-tokens.json' {
  const value: ${capitalize(brand)}Tokens;
  export default value;
}

/**
 * Resolver til at opløse token-referencer
 * Understøtter $mode variablen i tema-referencer
 */
export class TokenResolver {
  private tokens: ${capitalize(brand)}Tokens;
  private currentTheme: ThemeMode;
  
  constructor(tokens: ${capitalize(brand)}Tokens, defaultTheme: ThemeMode = 'light') {
    this.tokens = tokens;
    this.currentTheme = defaultTheme;
  }
  
  /**
   * Sæt aktivt tema
   */
  setTheme(theme: ThemeMode): void {
    this.currentTheme = theme;
  }
  
  /**
   * Få en token værdi med automatisk reference-opløsning
   */
  get(path: string): TokenValue {
    // Hvis stien indeholder $mode, erstat med det aktuelle tema
    if (path.includes('$mode')) {
      path = path.replace('$mode', this.currentTheme);
    }
    
    // Find og returner værdien
    return this.getValueByPath(path);
  }
  
  /**
   * Intern hjælpefunktion til at følge en sti
   */
  private getValueByPath(path: string): TokenValue {
    // Implementation detaljer...
    return ''; // Placeholder
  }
}
`;

  // Skriv TypeScript-filen som TEKST (ikke JSON)
  const outputPath = path.join(path.dirname(tokenFilePath), `${brand}-tokens.d.ts`);
  writeTextFile(outputPath, tsContent);
  console.log(`✅ TypeScript definitioner gemt til ${outputPath}`);
}

// Hjælpefunktion til at kapitalisere første bogstav
function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// Hovedfunktion
function main() {
  console.log('Starter optimeret token byggeprocess...');
  
  // Opret output-mappen hvis den ikke eksisterer
  if (!fs.existsSync('build')) {
    fs.mkdirSync('build');
    console.log('Build-mappe oprettet');
  }
  
  // Find automatisk alle brands
  const brands = discoverBrands();
  
  if (brands.length === 0) {
    console.error('Ingen brands fundet i tokens/brand/ mappen');
    return;
  }
  
  console.log(`Fandt følgende brands: ${brands.join(', ')}`);
  
  // Byg tokens for hvert brand
  let successCount = 0;
  for (const brand of brands) {
    const success = buildBrand(brand);
    if (success) successCount++;
  }
  
  console.log(`\n✅ ${successCount} af ${brands.length} token-filer bygget succesfuldt!`);
  console.log('\nForbedringer:');
  console.log(' - Tema-specifikke referencer bruger nu $mode');
  console.log(' - Original token-struktur er bevaret');
  console.log(' - TypeScript type-definitioner er genereret');
  console.log(' - Resolver understøtter $mode variablen');
}

// Kør hovedfunktionen
main();