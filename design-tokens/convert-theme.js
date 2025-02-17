import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const jsonDir = path.join(__dirname, "json");
const tsDir = path.join(__dirname, "ts");

// Cache for storing symbol definitions and their full paths
const symbolDefinitionCache = new Map();

// Tracks the dependency structure
const DEPENDENCY_RULES = {
  theme: {
    allowedImports: ['brand', 'globals'],
    circular: false
  },
  brand: {
    allowedImports: ['theme', 'globals'],
    circular: false
  },
  globals: {
    allowedImports: [],
    circular: false
  }
};

function ensureDirectoryExistence(filePath) {
  const dirname = path.dirname(filePath);
  if (!fs.existsSync(dirname)) {
    fs.mkdirSync(dirname, { recursive: true });
  }
}

/**
 * Builds a complete map of symbol definitions including nested paths
 */
function buildSymbolDefinitionMap() {
  function scanDirectory(dir) {
    const files = fs.readdirSync(dir, { withFileTypes: true });
    
    for (const file of files) {
      const fullPath = path.join(dir, file.name);
      
      if (file.isDirectory()) {
        scanDirectory(fullPath);
      } else if (file.isFile() && file.name.endsWith('.json')) {
        try {
          const content = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
          const relativePath = path.relative(jsonDir, dir);
          const moduleBaseName = path.basename(file.name, '.json')
            .replace(/-/g, ''); // Remove hyphens from module names
          
          // Store full path information for the module
          const moduleInfo = {
            folder: relativePath,
            name: moduleBaseName,
            fullPath: path.join(relativePath, moduleBaseName),
            type: relativePath.split(path.sep)[0], // Get type (brand/theme/globals)
            symbols: Object.keys(content)
          };
          
          // Cache each top-level symbol with its module info
          for (const symbol of moduleInfo.symbols) {
            symbolDefinitionCache.set(symbol, moduleInfo);
          }
        } catch (error) {
          console.error(`❌ Error processing ${fullPath}:`, error);
        }
      }
    }
  }

  scanDirectory(jsonDir);
}

/**
 * Determines required imports based on file type and location
 */
function determineRequiredImports(fileInfo) {
  const imports = new Set();
  
  // Add globalvalue import for all files except globals
  if (fileInfo.type !== 'globals') {
    imports.add({
      folder: 'globals',
      name: 'globalvalue',
      fullPath: 'globals/globalvalue'
    });
  }

  // Add theme imports for brand files
  if (fileInfo.type === 'brand') {
    imports.add({
      folder: 'theme',
      name: 'light',
      fullPath: 'theme/light'
    });
    imports.add({
      folder: 'theme',
      name: 'dark',
      fullPath: 'theme/dark'
    });
  }

  return Array.from(imports);
}

/**
 * Generates import statements with proper relative paths
 */
function generateImports(currentFilePath, requiredImports) {
  const currentDir = path.dirname(currentFilePath);
  
  return requiredImports.map(dep => {
    const relativePath = path.relative(currentDir, path.join(tsDir, dep.folder))
      .replace(/\\/g, '/') // Ensure forward slashes
      .replace(/^\.\/\.\./, '..') // Clean up unnecessary ./../
      .replace(/\/\.\//, '/'); // Clean up /./ in paths
    
    const importPath = relativePath.startsWith('.') ? 
      `${relativePath}/${dep.name}` : 
      `./${relativePath}/${dep.name}`;
    
    return `import { ${dep.name} } from '${importPath}';`;
  }).join('\n');
}

/**
 * Process references in JSON values and add proper module prefixes
 */
function processJsonReferences(obj, fileInfo) {
  return JSON.stringify(obj, (key, value) => {
    if (typeof value === 'string' && value.startsWith('{') && value.endsWith('}')) {
      const parts = value.slice(1, -1).split('.');
      const symbol = parts[0];
      const moduleInfo = symbolDefinitionCache.get(symbol);
      
      if (moduleInfo && moduleInfo.name !== fileInfo.name) {
        // Add module prefix for external references
        return `${moduleInfo.name}.${parts.join('.')}`;
      }
      return value.slice(1, -1); // Remove braces for internal references
    }
    return value;
  }, 2);
}

function convertJsonToTs(jsonPath) {
  const relativePath = path.relative(jsonDir, jsonPath);
  const tsPath = path.join(tsDir, relativePath.replace(/\.json$/, ".ts"));
  const moduleName = path.basename(tsPath, ".ts")
    .replace(/-/g, ''); // Remove hyphens from module name
  
  const fileInfo = {
    name: moduleName,
    type: path.dirname(relativePath).split(path.sep)[0],
    fullPath: relativePath
  };

  try {
    const jsonContent = fs.readFileSync(jsonPath, 'utf8');
    let jsonData = JSON.parse(jsonContent);
    jsonData = removeValueKeys(jsonData);

    // Determine required imports based on file type
    const requiredImports = determineRequiredImports(fileInfo);
    
    // Generate imports
    const imports = generateImports(tsPath, requiredImports);
    
    // Process JSON with proper references
    const processedJson = processJsonReferences(jsonData, fileInfo)
      .replace(/"([^"]+)":/g, (match, p1) => 
        p1.includes("-") ? `'${p1}':` : `${p1}:`);

    const tsContent = [
      "// Generated by convert-theme.js",
      imports,
      "",
      `export const ${moduleName} = ${processedJson};`,
      "" // Ensure trailing newline
    ].join('\n');

    ensureDirectoryExistence(tsPath);
    fs.writeFileSync(tsPath, tsContent, "utf8");
    console.log(`✅ Converted: ${jsonPath} → ${tsPath}`);
  } catch (error) {
    console.error(`❌ Error processing ${jsonPath}:`, error);
  }
}

function removeValueKeys(obj) {
  if (typeof obj !== "object" || obj === null) return obj;
  if ("value" in obj && Object.keys(obj).length === 1) {
    return obj.value;
  }
  return Object.fromEntries(
    Object.entries(obj).map(([key, value]) => [key, removeValueKeys(value)])
  );
}

function convertAllFiles() {
  console.log("🔍 Building symbol definition map...");
  buildSymbolDefinitionMap();
  
  console.log("📦 Converting files...");
  function processDirectory(dir) {
    fs.readdirSync(dir, { withFileTypes: true }).forEach(dirent => {
      const fullPath = path.join(dir, dirent.name);
      if (dirent.isDirectory()) {
        processDirectory(fullPath);
      } else if (dirent.isFile() && dirent.name.endsWith(".json")) {
        convertJsonToTs(fullPath);
      }
    });
  }

  processDirectory(jsonDir);
  console.log("✨ Conversion complete!");
}

// Start conversion
convertAllFiles();