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
 * Finder alle undermapper i `json/` for at identificere typer af data.
 * Returnerer en liste af de top-niveau mapper (fx. "brand", "globals", "theme").
 */
function getTopLevelFolders() {
  return fs.readdirSync(jsonDir, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .map(dirent => dirent.name);
}

// Hent alle top-niveau mapper (fx. ["brand", "globals", "theme"])
const topLevelFolders = getTopLevelFolders();

/**
 * Bestemmer prefix dynamisk afhængigt af mappen.
 * 
 * - Hvis en JSON-fil ligger i en af de registrerede mapper (`brand`, `globals`, etc.),
 *   bruger vi dens navn som prefix.
 * - Hvis filen ligger i `theme/`, antager vi, at den skal referere til `brand`.
 * 
 * @param {string} relativePath - Stien til filen relativt til `json/` mappen.
 * @returns {string} - Dynamisk genereret prefix.
 */
function determinePrefix(relativePath) {
  const folderName = relativePath.split("/")[0]; // Første mappe i stien

  if (topLevelFolders.includes(folderName)) {
    return `${folderName}.`; // Eks: "brand.", "globals."
  }

  return "brand."; // Default til "brand." hvis den er i `theme/`
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
    dependencies.push(`../globals/default`); // Theme-filer skal også importere globals
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
 * - Prefix `brand.` eller `globals.` tilføjes dynamisk
 * - Hex-koder og andre værdier forbliver i `' '` 
 * 
 * @param {object} obj - JSON-objektet der skal konverteres.
 * @param {string} prefix - Dynamisk prefix afhængigt af JSON-stien.
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

  // Dynamisk prefix afhængigt af mappen
  const prefix = determinePrefix(relativePath);

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

// 🚀 Kør konvertering for alle eksisterende JSON-filer
convertAllExistingJson();

console.log("👀 Overvåger JSON-filer i:", jsonDir);