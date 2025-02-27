/**
 * Utility-funktioner til token-håndtering
 * Indeholder reference-opdatering og type-generering
 */

import { promises as fs } from "fs";
import path from "path";

/**
 * Opdaterer alle referencer rekursivt i et objekt
 * Kombinerer stikorrigering og tema-agnostisk håndtering
 * 
 * @param {Object} obj - Objektet der skal opdateres
 * @param {string} currentSection - Navn på den nuværende sektion
 * @return {Object} - Objekt med opdaterede referencer
 */
export function updateReferences(obj, currentSection = '') {
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
 * Genererer TypeScript type-definitioner for en token-fil
 */
export async function generateTypeDefinitions(brand, themeMode, tokenFilePath) {
  const capitalizedBrand = capitalize(brand);
  
  const tsContent = `/**
 * Autogenererede TypeScript typer for ${brand} tokens (${themeMode} mode)
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
  themeMode: string;
  primitiveMode: string;
  generatedAt: string;
}

// Den komplette tokens-struktur
export interface ${capitalizedBrand}${capitalize(themeMode)}Tokens {
  _meta: TokenMetadata;
  globals: TokenTree;
  brand: TokenTree;
  theme: {
    ${themeMode}: TokenTree;
  };
  components: TokenTree;
}

// Tema-mode type
export type ThemeMode = 'light' | 'dark';

// Deklaration for at sikre at import af JSON fungerer
declare module '*/${brand}-${themeMode}.json' {
  const value: ${capitalizedBrand}${capitalize(themeMode)}Tokens;
  export default value;
}

/**
 * Resolver til at opløse token-referencer
 * Understøtter $mode variablen i tema-referencer
 */
export class TokenResolver {
  private tokens: ${capitalizedBrand}${capitalize(themeMode)}Tokens;
  private currentTheme: ThemeMode;
  
  constructor(tokens: ${capitalizedBrand}${capitalize(themeMode)}Tokens, defaultTheme: ThemeMode = '${themeMode}') {
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
    const parts = path.split('.');
    let current: any = this.tokens;
    
    for (const part of parts) {
      if (current === undefined || current === null) {
        return '';
      }
      current = current[part];
    }
    
    if (current && typeof current === 'object' && 'value' in current) {
      const value = current.value;
      
      // Hvis værdien er en reference, opløs den rekursivt
      if (typeof value === 'string' && 
          value.startsWith('{') && 
          value.endsWith('}')) {
        return this.get(value.substring(1, value.length - 1));
      }
      
      return value as TokenValue;
    }
    
    return '';
  }
}
`;

  // Skriv TypeScript-filen som ren tekst (ikke JSON)
  const outputPath = path.join(path.dirname(tokenFilePath), `${brand}-${themeMode}.d.ts`);
  try {
    await fs.writeFile(outputPath, tsContent);
    console.log(`  ✅ TypeScript definitioner gemt: ${outputPath}`);
  } catch (error) {
    console.error(`  ❌ Fejl ved generering af TypeScript definitioner:`, error);
  }
}

/**
 * Hjælpefunktion til at kapitalisere første bogstav
 */
export function capitalize(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}