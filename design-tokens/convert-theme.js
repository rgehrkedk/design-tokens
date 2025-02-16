import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

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

// Cache for at holde styr på hvilken mappe hver fil tilhører
const fileToFolderCache = new Map();

/**
 * Finder top-level mapperne i json/
 */
function getTopLevelFolders() {
  return fs.readdirSync(jsonDir, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .map(dirent => dirent.name);
}

const topLevelFolders = getTopLevelFolders();

/**
 * Finder den top-level mappe som en fil eller reference tilhører
 */
function findParentFolder(identifier, currentFilePath = null) {
  // Hvis vi har en filsti og den er i cachen, brug det
  if (currentFilePath && fileToFolderCache.has(currentFilePath)) {
    return fileToFolderCache.get(currentFilePath);
  }

  // Find parent folder ved at analysere mappestrukturen
  for (const folder of topLevelFolders) {
    const folderPath = path.join(tsDir, folder);
    if (!fs.existsSync(folderPath)) continue;

    const files = fs.readdirSync(folderPath);
    const matchingFile = files.find(file => 
      file === identifier + '.ts' || 
      file === identifier + '.json' ||
      file.startsWith(identifier + '.')
    );

    if (matchingFile) {
      // Gem i cache hvis vi har en filsti
      if (currentFilePath) {
        fileToFolderCache.set(currentFilePath, folder);
      }
      return folder;
    }
  }

  return null;
}

/**
 * Bestemmer om en reference skal have prefix baseret på dens kontekst
 */
function shouldAddPrefix(reference, currentFilePath) {
  const currentFolder = findParentFolder(path.basename(currentFilePath, '.ts'), currentFilePath);
  const referenceFolder = findParentFolder(reference.split('.')[0]);
  
  // Hvis referencen tilhører en anden mappe end den nuværende fil
  return referenceFolder && currentFolder !== referenceFolder;
}

/**
 * Konverterer JSON-værdier til TypeScript med korrekte prefixes
 */
function formatJsonForTs(obj, currentFilePath) {
  return JSON.stringify(obj, null, 2)
    .replace(/"([^"]+)":/g, (match, p1) => (p1.includes("-") ? `'${p1}':` : `${p1}:`))
    .replace(/"\{([^}]+)\}"/g, (match, p1) => {
      const parts = p1.split(".");
      const firstPart = parts[0];
      
      // Hvis vi skal tilføje prefix
      if (shouldAddPrefix(firstPart, currentFilePath)) {
        const parentFolder = findParentFolder(firstPart);
        if (parentFolder) {
          // Tilføj prefix til referencen
          if (parts.length === 2) {
            return `${parentFolder}.${firstPart}['${parts[1]}']`;
          } else if (parts.length >= 3) {
            return `${parentFolder}.${firstPart}.${parts[1]}${parts.slice(2).map(p => `['${p}']`).join('')}`;
          }
        }
      }
      
      // Hvis vi ikke skal tilføje prefix
      if (parts.length === 2) {
        return `${firstPart}['${parts[1]}']`;
      } else if (parts.length >= 3) {
        return `${firstPart}.${parts[1]}${parts.slice(2).map(p => `['${p}']`).join('')}`;
      }
      
      return match;
    })
    .replace(/"([^"]+)"/g, "'$1'");
}

function convertJsonToTs(jsonPath) {
  const relativePath = path.relative(jsonDir, jsonPath);
  const tsPath = path.join(tsDir, relativePath.replace(/\.json$/, ".ts"));
  const moduleName = path.basename(tsPath, ".ts").replace(/-/g, "_");

  fs.readFile(jsonPath, "utf8", (err, data) => {
    if (err) {
      console.error(`❌ Fejl ved læsning af ${jsonPath}:`, err);
      return;
    }

    try {
      let jsonData = JSON.parse(data);
      // Fjern value keys hvis nødvendigt
      jsonData = removeValueKeys(jsonData);

      const formattedJson = formatJsonForTs(jsonData, tsPath);
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