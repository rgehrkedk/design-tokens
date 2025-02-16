import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import chokidar from "chokidar";

// Håndter __dirname i ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Stier til JSON input-mappen og TypeScript output-mappen.
 */
const jsonDir = path.join(__dirname, "json");
const tsDir = path.join(__dirname, "ts");

/**
 * Sikrer, at en mappe eksisterer. Hvis ikke, opretter den den nødvendige sti.
 * @param {string} filePath - Stien til filen, der skal gemmes.
 */
function ensureDirectoryExistence(filePath) {
  const dirname = path.dirname(filePath);
  if (!fs.existsSync(dirname)) {
    fs.mkdirSync(dirname, { recursive: true });
  }
}

/**
 * Finder alle brands i `brand/`-mappen og returnerer deres relative stier.
 * @returns {string[]} - Liste af brand-import-stier.
 */
function getAllBrandImports() {
  const brandDir = path.join(tsDir, "brand");
  if (!fs.existsSync(brandDir)) return [];

  return fs.readdirSync(brandDir)
    .filter(file => file.endsWith(".ts")) // Kun TypeScript-filer
    .map(file => `../brand/${file.replace(".ts", "")}`); // Returnér relative import-stier
}

/**
 * Bestemmer, hvilke filer der skal importeres i den genererede TypeScript-fil.
 * - `brand/*.ts` importeres IKKE i andre brands
 * - `theme/*.ts` (inklusiv `light-mode.ts` og `dark-mode.ts`) importerer ALLE `brand/*.ts` og `globals.ts`
 * 
 * @param {string} relativePath - Stien til filen relativt til `json/` mappen.
 * @returns {string[]} - En liste af afhængigheder (import-stier).
 */
function determineDependencies(relativePath) {
  const dependencies = [];

  if (relativePath.startsWith("theme/")) {
    dependencies.push(...getAllBrandImports()); // Dynamisk import af ALLE brands
    dependencies.push("../globals/default"); // Theme-filer skal også importere globals
  }

  return dependencies;
}

/**
 * Fjerner "value" nøglen og erstatter med selve værdien.
 * @param {object} obj - JSON-objektet der skal renses.
 * @returns {object} - Nyt objekt uden "value"-nøgler.
 */
function removeValueKeys(obj) {
  if (typeof obj !== "object" || obj === null) return obj;

  if ("value" in obj && Object.keys(obj).length === 1) {
    return obj.value; // Hvis eneste nøgle er "value", returnér kun dens værdi
  }

  return Object.fromEntries(
    Object.entries(obj).map(([key, value]) => [key, removeValueKeys(value)])
  );
}

/**
 * Konverter JSON til en TypeScript-venlig string med korrekt formatering:
 * - Nøgler med `-` omgives af `' '`
 * - Andre nøgler står uden anførselstegn
 * - Værdier, der er referencer (`'{neutrals.alpha.900.10}'`), konverteres til `brand.neutrals.alpha['900']['10']`
 * - Prefix `brand.` eller `globals.` tilføjes korrekt
 * - Hex-koder og andre værdier forbliver i `' '` 
 * 
 * @param {object} obj - JSON-objektet der skal konverteres.
 * @param {string} prefix - Prefix afhængigt af JSON-stien (`brand.` eller `globals.`).
 * @returns {string} - En korrekt formateret TypeScript-eksport.
 */
function formatJsonForTs(obj, prefix) {
  return JSON.stringify(obj, null, 2)
    .replace(/"([^"]+)":/g, (match, p1) => (p1.includes("-") ? `'${p1}':` : `${p1}:`)) // ' ' ved bindestreg-nøgler
    .replace(/"\{([^}]+)\}"/g, (match, p1) => { 
      const parts = p1.split('.');

      if (parts.length === 2) {
        return `${prefix}${parts[0]}['${parts[1]}']`; // brand.primary['300']
      } else if (parts.length >= 3) {
        return `${prefix}${parts[0]}.${parts[1]}${parts.slice(2).map(p => `['${p}']`).join('')}`; 
        // brand.neutrals.alpha['900']['10']
      }

      return match; // fallback hvis formatet er anderledes
    })
    .replace(/"([^"]+)"/g, "'$1'"); // ' ' omkring alle andre værdier
}

/**
 * Konverterer en JSON-fil til en TypeScript-fil.
 * Genererer TypeScript-imports baseret på afhængigheder og eksporterer JSON-indholdet som et objekt.
 * 
 * @param {string} jsonPath - Den fulde sti til JSON-filen.
 */
function convertJsonToTs(jsonPath) {
  // Find den relative sti for at bevare mappestrukturen
  const relativePath = path.relative(jsonDir, jsonPath);
  const tsPath = path.join(tsDir, relativePath.replace(/\.json$/, ".ts"));

  // Bestem prefix afhængigt af mappen (brand eller globals)
  const prefix = relativePath.startsWith("brand/") ? "brand." : relativePath.startsWith("globals/") ? "globals." : "brand.";

  // Generér et gyldigt TypeScript variabelnavn
  const moduleName = path.basename(tsPath, ".ts").replace(/-/g, "_");

  fs.readFile(jsonPath, "utf8", (err, data) => {
    if (err) {
      console.error(`❌ Fejl ved læsning af ${jsonPath}:`, err);
      return;
    }

    try {
      // Parse JSON-indholdet
      let jsonData = JSON.parse(data);
      jsonData = removeValueKeys(jsonData); // Fjern "value"-nøglen
      const dependencies = determineDependencies(relativePath);

      // Generér import-sætninger baseret på afhængigheder
      let imports = dependencies
        .map(dep => `import * as ${path.basename(dep).replace(/-/g, "_")} from '${dep}';`)
        .join("\n");

      // Omdan JSON til en gyldig TypeScript-eksport med korrekt formatering
      const formattedJson = formatJsonForTs(jsonData, prefix);
      const tsContent = `${imports}\n\nexport const ${moduleName} = ${formattedJson};`;

      // Sikrer, at outputmappen eksisterer, før vi skriver til filen
      ensureDirectoryExistence(tsPath);

      // Skriv TypeScript-filen til `ts/`-mappen
      fs.writeFile(tsPath, tsContent, "utf8", (err) => {
        if (err) {
          console.error(`❌ Fejl ved skrivning af ${tsPath}:`, err);
        } else {
          console.log(`✅ Konverteret: ${jsonPath} → ${tsPath}`);
        }
      });
    } catch (parseError) {
      console.error(`❌ Fejl ved parsing af JSON i ${jsonPath}:`, parseError);
    }
  });
}

/**
 * Gennemgår `json/`-mappen rekursivt og konverterer alle JSON-filer til TypeScript.
 */
function convertAllExistingJson(dir = jsonDir) {
  fs.readdirSync(dir, { withFileTypes: true }).forEach(dirent => {
    const fullPath = path.join(dir, dirent.name);
    if (dirent.isDirectory()) {
      convertAllExistingJson(fullPath); // Rekursivt scan undermapper
    } else if (dirent.isFile() && dirent.name.endsWith(".json")) {
      convertJsonToTs(fullPath);
    }
  });
}

// 🚀 Kør konvertering for alle eksisterende JSON-filer
convertAllExistingJson();

console.log("👀 Overvåger JSON-filer i:", jsonDir);