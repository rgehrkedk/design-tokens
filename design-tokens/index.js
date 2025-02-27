/**
 * Fejlfindings-version af Style Dictionary bygge-script
 * Med udførlige log-meddelelser for at identificere problemer
 */

import { promises as fs } from "fs";
import fetch from "node-fetch";
import path from "path";
import { fileURLToPath } from "url";
import StyleDictionary from "style-dictionary";

// Få nuværende filsti i ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log("Script køres fra:", __dirname);

// Opdatér denne URL med dit eget token-sæt
const styleDictionaryURL = "https://e-boks.zeroheight.com/api/token_management/token_set/10617/style_dictionary_links";

/**
 * Hjælpefunktion til at oprette mapper og undermappe
 */
async function ensureDirectoryExists(dirPath) {
  console.log(`Sikrer, at mappen findes: ${dirPath}`);
  try {
    await fs.mkdir(dirPath, { recursive: true });
    console.log(`✓ Mappe sikret: ${dirPath}`);
    return true;
  } catch (error) {
    console.error(`❌ Kunne ikke oprette mappe ${dirPath}:`, error);
    return false;
  }
}

/**
 * Hjælpefunktion til at gemme en fil med fejlhåndtering
 */
async function saveFile(filePath, content) {
  console.log(`Gemmer fil: ${filePath}`);
  try {
    // Sikr at mappen til filen eksisterer
    const dirPath = path.dirname(filePath);
    await ensureDirectoryExists(dirPath);
    
    // Gem filen
    if (typeof content === 'object') {
      await fs.writeFile(filePath, JSON.stringify(content, null, 2));
    } else {
      await fs.writeFile(filePath, content);
    }
    console.log(`✓ Fil gemt: ${filePath}`);
    return true;
  } catch (error) {
    console.error(`❌ Kunne ikke gemme fil ${filePath}:`, error);
    return false;
  }
}

/**
 * Funktion til at logge mappen indhold
 */
async function logDirectoryContents(dirPath) {
  console.log(`\nInspicerer indhold af: ${dirPath}`);
  try {
    const files = await fs.readdir(dirPath);
    if (files.length === 0) {
      console.log(`Mappen er tom`);
    } else {
      for (const file of files) {
        const filePath = path.join(dirPath, file);
        const stats = await fs.stat(filePath);
        if (stats.isDirectory()) {
          console.log(`📁 ${file}/`);
        } else {
          console.log(`📄 ${file} (${stats.size} bytes)`);
        }
      }
    }
  } catch (error) {
    console.error(`❌ Kunne ikke læse mappeindhold:`, error);
  }
}

/**
 * Henter links til JSON-filer fra zeroheight
 */
async function fetchLinks() {
  console.log(`\nHenter links fra ${styleDictionaryURL}`);
  
  try {
    const response = await fetch(styleDictionaryURL);
    if (!response.ok) {
      throw new Error(`HTTP fejl: ${response.status} ${response.statusText}`);
    }
    
    const textResponse = await response.text();
    if (!textResponse || textResponse.trim() === '') {
      console.error("❌ Modtog tomt svar fra API'et");
      return [];
    }
    
    const links = textResponse.split("\n").filter(link => link.trim() !== "");
    
    console.log(`✓ Fandt ${links.length} links til tokens`);
    if (links.length > 0) {
      console.log(`  Første link: ${links[0]}`);
    }
    
    return links;
  } catch (error) {
    console.error("❗️Fejl ved hentning af links:", error);
    return [];
  }
}

/**
 * Opdaterer alle referencer i et objekt
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
 * Henter og gemmer JSON-filer fra links
 */
async function saveFiles(links) {
  console.log("\nHenter og gemmer JSON-filer fra links...");
  
  // Opret JSON-mappe
  const jsonDir = path.join(__dirname, "json");
  const success = await ensureDirectoryExists(jsonDir);
  if (!success) {
    return [];
  }
  
  try {
    const fileData = [];
    
    for (const link of links) {
      console.log(`Henter: ${link}`);
      
      try {
        const response = await fetch(link);
        
        if (!response.ok) {
          console.error(`❌ Fejl ved hentning fra ${link}: ${response.statusText}`);
          continue;
        }
        
        const jsonData = await response.json();
        
        // Udled collection og mode fra link
        const url = new URL(link);
        const searchParams = new URLSearchParams(url.search);
        
        const collection = searchParams.get("collection_name") || "unknown";
        const mode = searchParams.get("mode_name") || "unknown";
        
        console.log(`  Collection: ${collection}, Mode: ${mode}`);
        
        // Lav mappe for samlingen
        const collectionDir = path.join(jsonDir, collection);
        await ensureDirectoryExists(collectionDir);
        
        // Gem filen
        const filePath = path.join(collectionDir, `${mode}.json`);
        const saved = await saveFile(filePath, jsonData);
        
        if (saved) {
          fileData.push({ collection, mode, path: filePath, data: jsonData });
        }
      } catch (error) {
        console.error(`❌ Fejl ved behandling af ${link}:`, error);
      }
    }
    
    console.log(`\n✓ Gemt ${fileData.length} filer.`);
    
    // Log indholdet af json-mappen
    await logDirectoryContents(jsonDir);
    
    return fileData;
  } catch (error) {
    console.error("❗️Overordnet fejl ved gemning af filer:", error);
    return [];
  }
}

/**
 * Strukturerer tokens i vores format og opdaterer referencer
 */
async function buildBrandTokens(fileData) {
  console.log("\nBygger tokens i struktureret format...");
  
  // Opretter build-mapper
  const buildDir = path.join(__dirname, "build");
  await ensureDirectoryExists(buildDir);
  
  const tsBuildDir = path.join(buildDir, "ts");
  await ensureDirectoryExists(tsBuildDir);
  
  // Gruppér filer efter collection/mode
  const collections = fileData.reduce((acc, file) => {
    if (!acc[file.collection]) {
      acc[file.collection] = {};
    }
    acc[file.collection][file.mode] = file.data;
    return acc;
  }, {});
  
  console.log("\nFundet collections:", Object.keys(collections));
  
  // Find primitivs collection og tokens collection
  const primitivesCollection = collections.primitives || {};
  const tokensCollection = collections.tokens || {};
  
  console.log("Primitive modes:", Object.keys(primitivesCollection));
  console.log("Token modes:", Object.keys(tokensCollection));
  
  // For hver primitives mode, kombiner med tokens modes
  for (const primitiveMode in primitivesCollection) {
    console.log(`\nBygger tokens med primitives: ${primitiveMode}`);
    
    const primitives = primitivesCollection[primitiveMode];
    
    for (const tokenMode in tokensCollection) {
      console.log(`  Kombinerer med tokens mode: ${tokenMode}`);
      
      const tokens = tokensCollection[tokenMode];
      
      // Opbyg vores struktur
      const globals = primitives; // Globale værdier (colors, typography, etc.)
      const brand = tokens; // Brand-specifikke tokens
      
      // Opdel i light og dark (antager at tokenMode er enten 'light' eller 'dark')
      const theme = {
        [tokenMode]: tokens
      };
      
      // Udtræk components hvis de findes
      const components = tokens.components || {};
      
      // Fjern components fra brand
      const brandWithoutComponents = { ...tokens };
      delete brandWithoutComponents.components;
      
      // Opdater referencer for hver sektion
      const updatedGlobals = updateReferences(globals, 'globals');
      const updatedBrand = updateReferences(brandWithoutComponents, 'brand');
      const updatedTheme = {};
      updatedTheme[tokenMode] = updateReferences(theme[tokenMode], `theme.${tokenMode}`);
      const updatedComponents = updateReferences(components, 'components');
      
      // Opret den strukturerede output
      const brandName = primitiveMode.toLowerCase(); // Brug primitive mode som brand navn
      const structuredOutput = {
        _meta: {
          brand: brandName,
          themeMode: tokenMode,
          primitiveMode: primitiveMode,
          generatedAt: new Date().toISOString()
        },
        globals: updatedGlobals,
        brand: updatedBrand,
        theme: updatedTheme,
        components: updatedComponents
      };
      
      // Gem struktureret output
      const outputFile = path.join(buildDir, `${brandName}-${tokenMode}.json`);
      const saved = await saveFile(outputFile, structuredOutput);
      
      if (saved) {
        console.log(`  ✓ Gemt JSON: ${outputFile}`);
        
        // Nu bruger vi Style Dictionary til at bygge TypeScript-definitioner
        await buildStyleDictionaryOutput(brandName, tokenMode, structuredOutput);
      }
    }
  }
  
  // Log indholdet af build-mappen efter bygning
  console.log("\nIndhold af build-mappen efter bygning:");
  await logDirectoryContents(buildDir);
  
  console.log("\nIndhold af build/ts-mappen efter bygning:");
  await logDirectoryContents(tsBuildDir);
}

/**
 * Anvender Style Dictionary til at generere TypeScript typer
 */
async function buildStyleDictionaryOutput(brandName, themeName, tokens) {
  console.log(`\nGenererer Style Dictionary output for ${brandName}-${themeName}...`);
  
  const outputDir = path.join(__dirname, "build", "ts");
  await ensureDirectoryExists(outputDir);
  
  // Lav en temporær fil for dette brand og tema
  const tempDir = path.join(__dirname, "temp");
  await ensureDirectoryExists(tempDir);
  
  const tempFile = path.join(tempDir, `${brandName}-${themeName}-temp.json`);
  await saveFile(tempFile, tokens);
  
  // Opret Style Dictionary-konfiguration
  const brandConfig = {
    source: [tempFile],
    platforms: {
      typescript: {
        transformGroup: 'js',
        buildPath: `${outputDir}/`,
        files: [
          {
            destination: `${brandName}-${themeName}.d.ts`,
            format: 'typescript/module-declarations',
            options: {
              moduleName: `@tokens/${brandName}-${themeName}`
            }
          },
          {
            destination: `${brandName}-${themeName}-types.ts`,
            format: 'typescript/es6-declarations',
          }
        ]
      },
      js: {
        transformGroup: 'js',
        buildPath: `${outputDir}/`,
        files: [
          {
            destination: `${brandName}-${themeName}.js`,
            format: 'javascript/es6',
          }
        ]
      }
    }
  };
  
  try {
    console.log("Starter Style Dictionary build...");
    
    // Kør Style Dictionary
    const sd = StyleDictionary.extend(brandConfig);
    sd.buildAllPlatforms();
    
    console.log(`  ✓ Genereret TypeScript typer: ${outputDir}/${brandName}-${themeName}.d.ts`);
    
    // Tjek filen faktisk eksisterer
    try {
      const stats = await fs.stat(path.join(outputDir, `${brandName}-${themeName}.d.ts`));
      console.log(`    Filstørrelse: ${stats.size} bytes`);
    } catch (error) {
      console.error(`  ❌ ADVARSEL: TypeScript-filen ser ikke ud til at eksistere på disken!`);
    }
  } catch (error) {
    console.error(`  ❌ Fejl under Style Dictionary build:`, error);
  }
  
  // Prøv at slette den temporære fil, men fejl ikke hvis det ikke lykkes
  try {
    await fs.unlink(tempFile);
    console.log(`  ✓ Temporær fil slettet: ${tempFile}`);
  } catch (error) {
    console.warn(`  ⚠️ Kunne ikke slette temporær fil: ${tempFile}`);
  }
}

/**
 * Hovedfunktion
 */
async function main() {
  console.log("🚀 Starter token byggeproces med Style Dictionary integration...");
  console.log("Script version: Debug med udvidet logning");
  console.log("Nuværende tidspunkt:", new Date().toISOString());
  
  // Opret temp mappe
  const tempDir = path.join(__dirname, "temp");
  await ensureDirectoryExists(tempDir);
  
  // Hent links til JSON-filer
  const links = await fetchLinks();
  if (links.length === 0) {
    console.error("❌ Ingen links fundet, afbryder");
    return;
  }
  
  // Hent og gem filer
  const fileData = await saveFiles(links);
  if (fileData.length === 0) {
    console.error("❌ Ingen filer blev gemt, afbryder");
    return;
  }
  
  // Byg tokens
  await buildBrandTokens(fileData);
  
  // Ryd op i temp mappen
  try {
    // Brug fs.rm i stedet for fs.rmdir (som er forældet)
    await fs.rm(tempDir, { recursive: true, force: true });
    console.log(`\n✓ Temporær mappe slettet: ${tempDir}`);
  } catch (error) {
    console.warn(`\n⚠️ Kunne ikke slette temporær mappe: ${tempDir}`, error);
  }
  
  console.log("\n✨ Token bygning fuldført!");
  console.log("📝 StyleDictionary skulle have genereret TypeScript typer i build/ts/");
  
  // Final check af build mappe
  const buildDir = path.join(__dirname, "build");
  try {
    const buildStats = await fs.stat(buildDir);
    console.log(`Build mappe eksisterer: ${buildStats.isDirectory()}`);
    
    const tsBuildDir = path.join(buildDir, "ts");
    try {
      const tsStats = await fs.stat(tsBuildDir);
      console.log(`Build/ts mappe eksisterer: ${tsStats.isDirectory()}`);
    } catch (error) {
      console.error("❌ build/ts mappe eksisterer IKKE!");
    }
  } catch (error) {
    console.error("❌ Build mappe eksisterer IKKE!");
  }
}

// Kør hovedfunktionen
main().catch(error => {
  console.error("❌ Uventet fejl i hovedfunktionen:", error);
  process.exit(1);
});