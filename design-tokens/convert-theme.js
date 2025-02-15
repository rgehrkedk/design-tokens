import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import chokidar from "chokidar";

// Håndter __dirname i ES Modules (da __dirname ikke findes naturligt i ESM).
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
  return name.replace(/-/g, "_").replace(/\W/g, ""); // Erstat "-" med "_" og fjern ikke-alfanumeriske tegn
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
 * - `brand/*.ts` skal importere `globals.ts` og `theme/*.ts`
 * - `theme/*.ts` skal importere `globals.ts` og ALLE `brand/*.ts`
 * - `globals.ts` har ingen afhængigheder.
 * 
 * @param {string} relativePath - Stien til filen relativt til `json/` mappen.
 * @returns {string[]} - En liste af afhængigheder (import-stier).
 */
function determineDependencies(relativePath) {
  const dependencies = [];

  if (relativePath.startsWith("brand/")) {
    dependencies.push("../globals/globals", "../theme/dark-mode", "../theme/light-mode");
  } else if (relativePath.startsWith("theme/")) {
    dependencies.push("../globals/globals");
    dependencies.push(...getAllBrandImports()); // Dynamisk import af ALLE brands
  }

  return dependencies;
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

  // Generér et gyldigt TypeScript variabelnavn fra filnavnet
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
        .map(dep => {
          const importVar = toValidVariableName(path.basename(dep)); // Konverter import-navn til en gyldig variabel
          return `import * as ${importVar} from "${dep}";`;
        })
        .join("\n");

      // Omdan JSON til en gyldig TypeScript-eksport
      const tsContent = `${imports}\n\nexport const ${moduleName} = ${JSON.stringify(jsonData, null, 2)};`;

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
  .on("add", convertJsonToTs)     // Når en ny fil tilføjes
  .on("change", convertJsonToTs); // Når en eksisterende fil ændres

console.log("👀 Overvåger JSON-filer i:", jsonDir);