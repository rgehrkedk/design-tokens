import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import chokidar from "chokidar";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const jsonDir = path.join(__dirname, "json");
const tsDir = path.join(__dirname, "ts");

function ensureDirectoryExistence(filePath) {
  const dirname = path.dirname(filePath);
  if (!fs.existsSync(dirname)) {
    fs.mkdirSync(dirname, { recursive: true });
  }
}

function getTopLevelFolders() {
  return fs.readdirSync(jsonDir, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .map(dirent => dirent.name);
}

const topLevelFolders = getTopLevelFolders();

/**
 * Bestemmer om en reference er intern (i samme fil) eller ekstern (fra en anden fil)
 * @param {string} reference - Referencen der skal tjekkes
 * @param {string} currentFolder - Den nuværende mappe vi er i
 * @returns {boolean} - true hvis referencen er ekstern
 */
function isExternalReference(reference, currentFolder) {
  const refFolder = reference.split('.')[0];
  return refFolder !== currentFolder;
}

/**
 * Bestemmer hvilket prefix der skal bruges baseret på om referencen er intern eller ekstern
 * @param {string} reference - Referencen der skal have prefix
 * @param {string} currentFolder - Den nuværende mappe vi er i
 */
function determinePrefix(reference, currentFolder) {
  if (!isExternalReference(reference, currentFolder)) {
    return "";
  }
  const refFolder = reference.split('.')[0];
  return topLevelFolders.includes(refFolder) ? `${refFolder}.` : "";
}

function getAllValidImports(relativePath) {
  return topLevelFolders
    .filter(folder => folder !== relativePath.split("/")[0])
    .flatMap(folder => {
      const dir = path.join(tsDir, folder);
      if (!fs.existsSync(dir)) return [];
      return fs.readdirSync(dir)
        .filter(file => file.endsWith(".ts"))
        .map(file => `../${folder}/${file.replace(".ts", "")}`);
    });
}

function determineDependencies(relativePath) {
  return getAllValidImports(relativePath);
}

function removeValueKeys(obj) {
  if (typeof obj !== "object" || obj === null) return obj;
  if ("value" in obj && Object.keys(obj).length === 1) {
    return obj.value;
  }
  return Object.fromEntries(Object.entries(obj).map(([key, value]) => [key, removeValueKeys(value)]));
}

/**
 * Formaterer JSON til TypeScript med korrekt håndtering af interne og eksterne referencer
 * @param {object} obj - JSON objektet der skal formateres
 * @param {string} currentFolder - Den nuværende mappe vi er i
 */
function formatJsonForTs(obj, currentFolder) {
  return JSON.stringify(obj, null, 2)
    .replace(/"([^"]+)":/g, (match, p1) => (p1.includes("-") ? `'${p1}':` : `${p1}:`))
    .replace(/"\{([^}]+)\}"/g, (match, p1) => {
      const parts = p1.split(".");
      const reference = parts[0];
      
      // Bestem prefix baseret på om referencen er intern eller ekstern
      const prefix = determinePrefix(p1, currentFolder);

      if (parts.length === 2) {
        return `${prefix}${parts[0]}['${parts[1]}']`;
      } else if (parts.length >= 3) {
        return `${prefix}${parts[0]}.${parts[1]}${parts.slice(2).map(p => `['${p}']`).join('')}`;
      }
      return match;
    })
    .replace(/"([^"]+)"/g, "'$1'");
}

function convertJsonToTs(jsonPath) {
  const relativePath = path.relative(jsonDir, jsonPath);
  const currentFolder = relativePath.split(path.sep)[0];
  const tsPath = path.join(tsDir, relativePath.replace(/\.json$/, ".ts"));
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

      const formattedJson = formatJsonForTs(jsonData, currentFolder);
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

// Start konvertering
convertAllExistingJson();
console.log("👀 Overvåger JSON-filer i:", jsonDir);