import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const jsonDir = path.join(__dirname, "json");
const tsDir = path.join(__dirname, "ts");

// Cache for at gemme hvor symboler er defineret
const symbolDefinitionCache = new Map();

function ensureDirectoryExistence(filePath) {
  const dirname = path.dirname(filePath);
  if (!fs.existsSync(dirname)) {
    fs.mkdirSync(dirname, { recursive: true });
  }
}

/**
 * Scanner alle JSON filer for at bygge et map over hvor symboler er defineret
 */
function buildSymbolDefinitionMap() {
  function scanDirectory(dir) {
    const files = fs.readdirSync(dir, { withFileTypes: true });
    
    for (const file of files) {
      const fullPath = path.join(dir, file.name);
      
      if (file.isDirectory()) {
        scanDirectory(fullPath);
      } else if (file.isFile() && file.name.endsWith('.json')) {
        const content = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
        const relativePath = path.relative(jsonDir, dir);
        const topLevelKeys = Object.keys(content);
        
        for (const key of topLevelKeys) {
          symbolDefinitionCache.set(key, relativePath.split(path.sep)[0]);
        }
      }
    }
  }

  scanDirectory(jsonDir);
}

/**
 * Finder hvilken mappe et symbol er defineret i
 */
function findSymbolDefinition(symbol) {
  return symbolDefinitionCache.get(symbol);
}

/**
 * Konverterer JSON-værdier til TypeScript med korrekte prefixes
 */
function formatJsonForTs(obj, currentFolder) {
  return JSON.stringify(obj, null, 2)
    .replace(/"([^"]+)":/g, (match, p1) => (p1.includes("-") ? `'${p1}':` : `${p1}:`))
    .replace(/"\{([^}]+)\}"/g, (match, p1) => {
      const parts = p1.split(".");
      const firstPart = parts[0];
      
      // Find parent folder for symbolet
      const symbolFolder = findSymbolDefinition(firstPart);
      
      // Tilføj prefix hvis symbolet er defineret i en anden mappe
      const needsPrefix = symbolFolder && symbolFolder !== currentFolder;
      const prefix = needsPrefix ? `${symbolFolder}.` : '';
      
      if (parts.length === 2) {
        return `${prefix}${firstPart}['${parts[1]}']`;
      } else if (parts.length >= 3) {
        return `${prefix}${firstPart}.${parts[1]}${parts.slice(2).map(p => `['${p}']`).join('')}`;
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

      const formattedJson = formatJsonForTs(jsonData, currentFolder);
      const tsContent = `export const ${moduleName} = ${formattedJson};`;

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

function removeValueKeys(obj) {
  if (typeof obj !== "object" || obj === null) return obj;
  if ("value" in obj && Object.keys(obj).length === 1) {
    return obj.value;
  }
  return Object.fromEntries(Object.entries(obj).map(([key, value]) => [key, removeValueKeys(value)]));
}

function convertAllExistingJson(dir = jsonDir) {
  // Først bygger vi symbol definition map
  buildSymbolDefinitionMap();
  
  // Derefter konverterer vi filerne
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