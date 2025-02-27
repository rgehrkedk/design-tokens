/**
 * Autogenererede TypeScript typer for postnl tokens
 * Genereret 2025-02-25T20:23:06.579Z
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
export interface PostnlTokens {
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
declare module '*/postnl-tokens.json' {
  const value: PostnlTokens;
  export default value;
}

/**
 * Resolver til at opløse token-referencer
 * Understøtter $mode variablen i tema-referencer
 */
export class TokenResolver {
  private tokens: PostnlTokens;
  private currentTheme: ThemeMode;
  
  constructor(tokens: PostnlTokens, defaultTheme: ThemeMode = 'light') {
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
