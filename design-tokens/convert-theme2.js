import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const jsonDir = path.join(__dirname, "json");
const tsDir = path.join(__dirname, "ts");

// Cache for storing symbol definitions
const symbolDefinitionCache = new Map();

function ensureDirectoryExistence(filePath) {
  const dirname = path.dirname(filePath);
  if (!fs.existsSync(dirname)) {
    fs.mkdirSync(dirname, { recursive: true });
  }
}

/**
 * Scans all JSON files to build symbol definition map
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
 * Finds what globals files contain each referenced token
 */
function findGlobalsTokenSources(obj) {
  const globalTokens = new Map();
  const globalsDir = path.join(jsonDir, 'globals');
  
  // Get list of all files in globals directory
  const globalsFiles = fs.readdirSync(globalsDir)
    .filter(file => file.endsWith('.json'))
    .map(file => path.basename(file, '.json'));
  
  // Scan through object to find references to any globals
  JSON.stringify(obj, (key, value) => {
    if (typeof value === 'string' && value.startsWith('{') && value.endsWith('}')) {
      const token = value.slice(1, -1).split('.')[0];
      if (globalsFiles.includes(token)) {
        globalTokens.set(token, token);
      }
    }
    return value;
  });
  
  return globalTokens;
}

/**
 * Generates imports for theme files
 */
function generateThemeImports(obj, brandName) {
  const imports = new Set();
  
  // Get globals imports
  const globalTokens = findGlobalsTokenSources(obj);
  for (const [token, sourceFile] of globalTokens) {
    imports.add(`import { ${token} } from '../globals/${sourceFile}';`);
  }
  
  // Add brand imports
  imports.add(`import { ${brandName} } from '../brand/${brandName}';`);
  imports.add(`import { ${brandName}components } from '../brand/${brandName}components';`);
  
  return Array.from(imports).join('\n');
}

/**
 * Finds which folder a symbol is defined in
 */
function findSymbolDefinition(symbol) {
  return symbolDefinitionCache.get(symbol);
}

/**
 * Finds all unique symbols referenced in an object
 */
function findReferencedSymbols(obj) {
  const symbols = new Set();
  
  JSON.stringify(obj, (key, value) => {
    if (typeof value === 'string' && value.startsWith('{') && value.endsWith('}')) {
      const symbol = value.slice(1, -1).split('.')[0];
      symbols.add(symbol);
    }
    return value;
  });
  
  return Array.from(symbols);
}

/**
 * Converts JSON values to TypeScript with correct prefixes
 */
function formatJsonForTs(obj, currentFolder) {
  return JSON.stringify(obj, null, 2)
    .replace(/"([^"]+)":/g, (match, p1) => (p1.includes("-") ? `'${p1}':` : `${p1}:`))
    .replace(/"\{([^}]+)\}"/g, (match, p1) => {
      const parts = p1.split(".");
      const firstPart = parts[0];
      
      // Find parent folder for symbol
      const symbolFolder = findSymbolDefinition(firstPart);
      
      // Always add prefix if symbol is defined in a folder
      const prefix = symbolFolder ? `${symbolFolder}.` : '';
      
      if (parts.length === 2) {
        return `${prefix}${firstPart}['${parts[1]}']`;
      } else if (parts.length >= 3) {
        return `${prefix}${firstPart}.${parts[1]}${parts.slice(2).map(p => `['${p}']`).join('')}`;
      }
      
      return match;
    })
    .replace(/"([^"]+)"/g, "'$1'");
}

function removeValueKeys(obj) {
  if (typeof obj !== "object" || obj === null) return obj;
  if ("value" in obj && Object.keys(obj).length === 1) {
    return obj.value;
  }
  return Object.fromEntries(Object.entries(obj).map(([key, value]) => [key, removeValueKeys(value)]));
}

/**
 * Converts a theme JSON file for a specific brand
 */
function convertThemeForBrand(themeJsonPath, brandName) {
  const themeName = path.basename(themeJsonPath, '.json'); // 'dark' or 'light'
  const tsPath = path.join(tsDir, 'theme', `${brandName}${themeName}.ts`);

  fs.readFile(themeJsonPath, "utf8", (err, data) => {
    if (err) {
      console.error(`❌ Error reading ${themeJsonPath}:`, err);
      return;
    }

    try {
      let jsonData = JSON.parse(data);
      jsonData = removeValueKeys(jsonData);

      const imports = generateThemeImports(jsonData, brandName);
      const formattedJson = formatJsonForTs(jsonData);
      const tsContent = `${imports}\n\nexport const ${brandName}${themeName} = ${formattedJson};`;

      ensureDirectoryExistence(tsPath);

      fs.writeFile(tsPath, tsContent, "utf8", (err) => {
        if (err) {
          console.error(`❌ Error writing ${tsPath}:`, err);
        } else {
          console.log(`✅ Converted theme for ${brandName}: ${tsPath}`);
        }
      });
    } catch (parseError) {
      console.error(`❌ Error parsing JSON in ${themeJsonPath}:`, parseError);
    }
  });
}

function convertJsonToTs(jsonPath) {
  const relativePath = path.relative(jsonDir, jsonPath);
  const currentFolder = relativePath.split(path.sep)[0];

  // If this is a brand file
  if (currentFolder === 'brand') {
    const brandName = path.basename(jsonPath, '.json').replace(/-/g, '_');
    
    // Convert dark and light themes for this brand
    const darkThemePath = path.join(jsonDir, 'theme', 'dark.json');
    const lightThemePath = path.join(jsonDir, 'theme', 'light.json');
    
    if (fs.existsSync(darkThemePath)) {
      convertThemeForBrand(darkThemePath, brandName);
    }
    if (fs.existsSync(lightThemePath)) {
      convertThemeForBrand(lightThemePath, brandName);
    }
  }

  // Regular file conversion
  const tsPath = path.join(tsDir, relativePath.replace(/\.json$/, ".ts"));
  const moduleName = path.basename(tsPath, ".ts").replace(/-/g, "_");

  fs.readFile(jsonPath, "utf8", (err, data) => {
    if (err) {
      console.error(`❌ Error reading ${jsonPath}:`, err);
      return;
    }

    try {
      let jsonData = JSON.parse(data);
      jsonData = removeValueKeys(jsonData);

      const referencedSymbols = findReferencedSymbols(jsonData);
      const imports = generateStandardImports(referencedSymbols, currentFolder);
      
      const formattedJson = formatJsonForTs(jsonData, currentFolder);
      const tsContent = `${imports}\n\nexport const ${moduleName} = ${formattedJson};`;

      ensureDirectoryExistence(tsPath);

      fs.writeFile(tsPath, tsContent, "utf8", (err) => {
        if (err) {
          console.error(`❌ Error writing ${tsPath}:`, err);
        } else {
          console.log(`✅ Converted: ${jsonPath} → ${tsPath}`);
        }
      });
    } catch (parseError) {
      console.error(`❌ Error parsing JSON in ${jsonPath}:`, parseError);
    }
  });
}

function generateStandardImports(symbols, currentFolder) {
  const imports = new Set();
  
  for (const symbol of symbols) {
    const parentFolder = findSymbolDefinition(symbol);
    if (parentFolder && parentFolder !== currentFolder) {
      imports.add(`import { ${symbol} } from '../${parentFolder}/${symbol}';`);
    }
  }
  
  return Array.from(imports).join('\n');
}

function convertAllFiles() {
  // First build symbol definition map
  buildSymbolDefinitionMap();
  
  // Then convert files
  function processDirectory(dir = jsonDir) {
    fs.readdirSync(dir, { withFileTypes: true }).forEach(dirent => {
      const fullPath = path.join(dir, dirent.name);
      if (dirent.isDirectory()) {
        processDirectory(fullPath);
      } else if (dirent.isFile() && dirent.name.endsWith(".json")) {
        convertJsonToTs(fullPath);
      }
    });
  }

  processDirectory();
}

// Start conversion
convertAllFiles();
console.log("👀 Watching JSON files in:", jsonDir);