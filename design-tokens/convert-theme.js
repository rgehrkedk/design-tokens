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
 * Finder alle top-niveau mapper i `json/` for at identificere typer af data.
 */
function getTopLevelFolders() {
  return fs.readdirSync(jsonDir, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .map(dirent => dirent.name);
}

const topLevelFolders = getTopLevelFolders();

/**
 * Dynamisk bestemmelse af prefix baseret på mappe-struktur.
 */
function determinePrefix(relativePath) {
  const folderName = relativePath.split("/")[0];
  return topLevelFolders.includes(folderName) ? `${folderName}.` : `${topLevelFolders[0]}.`;
}

/**
 * Finder alle undermapper (bortset fra "theme") og returnerer deres relative stier.
 */
function getAllCategoryImports() {
  return topLevelFolders
    .filter(folder => folder !== "theme") // Theme skal ikke importeres i sig selv
    .flatMap(folder => {
      const dir = path.join(tsDir, folder);
      if (!fs.existsSync(dir)) return [];
      return fs.readdirSync(dir)
        .filter(file => file.endsWith(".ts"))
        .map(file => `../${folder}/${file.replace(".ts", "")}`);
    });
}

/**
 * Bestemmer afhængigheder baseret på JSON-filens placering.
 */
function determineDependencies(relativePath) {
  const dependencies = [];
  if (relativePath.startsWith("theme/")) {
    dependencies.push(...getAllCategoryImports());
  }
  return dependencies;
}

/**
 * Fjerner "value" nøglen og erstatter med dens værdi.
 */
function removeValueKeys(obj) {
  if (typeof obj !== "object" || obj === null) return obj;
  if ("value" in obj && Object.keys(obj).length === 1) {
    return obj.value;
  }
  return Object.fromEntries(Object.entries(obj).map(([key, value]) => [key, removeValueKeys(value)]));
}

/**
 * Konverter JSON til en TypeScript-venlig string med korrekt formatering.
 */
function formatJsonForTs(obj, prefix) {
  return JSON.stringify(obj, null, 2)
    .replace(/"([^"]+)":/g, (match, p1) => (p1.includes("-") ? `'${p1}':` : `${p1}:`))
    .replace(/"\{([^}]+)\}"/g, (match, p1) => { 
      const parts = p1.split('.');
      if (parts.length === 2) {
        return `${prefix}${parts[0]}['${parts[1]}']`;
      } else if (parts.length >= 3) {
        return `${prefix}${parts[0]}.${parts[1]}${parts.slice(2).map(p => `['${p}']`).join('')}`;
      }
      return match;
    })
    .replace(/"([^"]+)"/g, "'$1'");
}

/**
 * Konverterer en JSON-fil til en TypeScript-fil.
 */
function convertJsonToTs(jsonPath) {
  const relativePath = path.relative(jsonDir, jsonPath);
  const tsPath = path.join(tsDir, relativePath.replace(/\.json$/, ".ts"));
  const prefix = determinePrefix(relativePath);
  const moduleName = path.basename(tsPath, ".ts").replace(/-/g, "_");

  fs.readFile(jsonPath, "utf8", (err, data) => {
    if (err) {
      console.error(`❌ Fejl ved læsning af ${jsonPath}:`, err);
      return;
    }

    try {
      let jsonData = JSON.parse(data);
      jsonData = removeValueKeys(jsonData);
      const dependencies = determineDependencies(relativePath);

      let imports = dependencies
        .map(dep => `import * as ${path.basename(dep).replace(/-/g, "_")} from '${dep}';`)
        .join("\n");

      const formattedJson = formatJsonForTs(jsonData, prefix);
      const tsContent = `${imports}\n\nexport const ${moduleName} = ${formattedJson};`;

      ensureDirectoryExistence(tsPath);

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
 * Rekursiv scanning af hele `json/`-mappen og konvertering af eksisterende JSON-filer.
 */
function convertAllExistingJson(dir = jsonDir) {
  fs.readdirSync(dir, { withFileTypes: true }).forEach(dirent => {
    const fullPath = path.join(dir, dirent.name);
    if (dirent.isDirectory()) {
      convertAllExistingJson(fullPath);
    } else if (dirent.isFile() && dirent.name.endsWith(".json")) {
      convertJsonToTs(fullPath);
    }
  });
}

// 🚀 Kør konvertering for alle eksisterende JSON-filer
convertAllExistingJson();

console.log("👀 Overvåger JSON-filer i:", jsonDir);