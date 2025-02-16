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
 * Konverterer et filnavn til et gyldigt TypeScript variabelnavn.
 * Fjerner ugyldige tegn og erstatter bindestreger med underscores.
 * @param {string} name - Filnavnet eller en nøgle fra JSON-filen.
 * @returns {string} - Et gyldigt variabelnavn.
 */
function toValidVariableName(name) {
  return name.replace(/-/g, "_").replace(/\W/g, ""); // Erstat "-" med "_", fjern ikke-alfanumeriske tegn
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
 * - `theme/*.ts` importerer ALLE `brand/*.ts` og `globals.ts`
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
 * Konverter JSON til en TypeScript-venlig string med korrekt formatering:
 * - Nøgler med `-` omgives af `' '`
 * - Andre nøgler står uden anførselstegn
 * - Værdier, der er referencer (`'{brand.something.xyz}'`), får det korrekte `brand.` eller `globals.` prefix
 * - Hex-koder og andre værdier forbliver i `' '` 
 * 
 * @param {object} obj - JSON-objektet der skal konverteres.
 * @returns {string} - En korrekt formateret TypeScript-eksport.
 */
function formatJsonForTs(obj) {
  return JSON.stringify(obj, null, 2)
    .replace(/"([^"]+)":/g, (match, p1) => (p1.includes("-") ? `'${p1}':` : `${p1}:`)) // ' ' ved bindestreg-nøgler
    .replace(/"\{([^}]+)\}"/g, (match, p1) => { 
      const parts = p1.split('.');
      if (parts.length === 2) {
        return `${parts[0]}.${parts[1]}`; // brand.primary
      } else if (parts.length === 3) {
        return `${parts[0]}.${parts[1]}['${parts[2]}']`; // brand.primary['300']
      }
      return match; // fallback hvis formatet er anderledes
    })
    .replace(/\b(brand|globals)\./g, (match, p1) => `${p1}.`) // Sikrer prefix
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

  // Generér et gyldigt TypeScript variabelnavn
  const moduleName = toValidVariableName(path.basename(tsPath, ".ts"));

  fs.readFile(jsonPath, "utf8", (err, data) => {
    if (err) {
      console.error(`❌ Fejl ved læsning af ${jsonPath}:`, err);
      return;
    }

    try {
      // Parse JSON-indholdet
      const jsonData = JSON.parse(data);
      const dependencies = determineDependencies(relativePath);

      // Generér import-sætninger baseret på afhængigheder
      let imports = dependencies
        .map(dep => `import * as ${toValidVariableName(path.basename(dep))} from '${dep}';`)
        .join("\n");

      // Omdan JSON til en gyldig TypeScript-eksport med korrekt formatering
      const formattedJson = formatJsonForTs(jsonData);
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
 * Gennemgår hele `json/`-mappen og konverterer alle eksisterende JSON-filer til TypeScript-filer.
 */
function convertAllExistingJson() {
  function scanDir(dir) {
    fs.readdirSync(dir, { withFileTypes: true }).forEach(dirent => {
      const fullPath = path.join(dir, dirent.name);
      if (dirent.isDirectory()) {
        scanDir(fullPath); // Hvis det er en mappe, scan den rekursivt
      } else if (dirent.isFile() && dirent.name.endsWith(".json")) {
        convertJsonToTs(fullPath);
      }
    });
  }
  console.log("🔄 Konverterer eksisterende JSON-filer...");
  scanDir(jsonDir);
}

// 🚀 **Konverter alle eksisterende JSON-filer ved scriptets opstart**
convertAllExistingJson();

// 🔍 **Overvåg ændringer i JSON-mappen**
chokidar.watch(`${jsonDir}/**/*.json`, { persistent: true })
  .on('add', convertJsonToTs)    
  .on('change', convertJsonToTs);

console.log("👀 Overvåger JSON-filer i:", jsonDir);