import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const jsonDir = path.join(__dirname, "json");
const tsDir = path.join(__dirname, "ts");

// Cache for storing symbol definitions and their full paths
const symbolDefinitionCache = new Map();
const dependencyGraph = new Map();

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
        const content = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
        const relativePath = path.relative(jsonDir, dir);
        const moduleBaseName = path.basename(file.name, '.json');
        
        // Store full path information for the module
        const moduleInfo = {
          folder: relativePath,
          name: moduleBaseName,
          fullPath: path.join(relativePath, moduleBaseName),
          symbols: Object.keys(content)
        };
        
        // Cache each top-level symbol with its module info
        for (const symbol of moduleInfo.symbols) {
          symbolDefinitionCache.set(symbol, moduleInfo);
        }
      }
    }
  }

  scanDirectory(jsonDir);
}

/**
 * Analyzes dependencies between modules
 */
function analyzeDependencies(jsonPath) {
  const content = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  const currentModule = path.basename(jsonPath, '.json');
  const dependencies = new Set();

  JSON.stringify(content, (key, value) => {
    if (typeof value === 'string' && value.startsWith('{') && value.endsWith('}')) {
      const symbol = value.slice(1, -1).split('.')[0];
      const moduleInfo = symbolDefinitionCache.get(symbol);
      if (moduleInfo && moduleInfo.name !== currentModule) {
        dependencies.add(moduleInfo);
      }
    }
    return value;
  });

  return Array.from(dependencies);
}

/**
 * Generates import statements with proper relative paths
 */
function generateImports(currentFilePath, dependencies) {
  const currentDir = path.dirname(currentFilePath);
  
  return dependencies.map(dep => {
    const relativePath = path.relative(currentDir, path.join(tsDir, dep.folder))
      .replace(/\\/g, '/'); // Ensure forward slashes for imports
    
    const importPath = relativePath.startsWith('.') ? 
      `${relativePath}/${dep.name}` : 
      `./${relativePath}/${dep.name}`;
    
    return `import { ${dep.name} } from '${importPath}';`;
  }).join('\n');
}

/**
 * Process references in JSON values and add proper module prefixes
 */
function processJsonReferences(obj, currentModule) {
  return JSON.stringify(obj, (key, value) => {
    if (typeof value === 'string' && value.startsWith('{') && value.endsWith('}')) {
      const parts = value.slice(1, -1).split('.');
      const symbol = parts[0];
      const moduleInfo = symbolDefinitionCache.get(symbol);
      
      if (moduleInfo && moduleInfo.name !== currentModule) {
        // Add module prefix for external references
        return `${moduleInfo.name}.${parts.join('.')}`;
      }
    }
    return value;
  }, 2);
}

function convertJsonToTs(jsonPath) {
  const relativePath = path.relative(jsonDir, jsonPath);
  const tsPath = path.join(tsDir, relativePath.replace(/\.json$/, ".ts"));
  const moduleName = path.basename(tsPath, ".ts").replace(/-/g, "_");

  try {
    const jsonContent = fs.readFileSync(jsonPath, 'utf8');
    let jsonData = JSON.parse(jsonContent);
    jsonData = removeValueKeys(jsonData);

    // Analyze dependencies
    const dependencies = analyzeDependencies(jsonPath);
    
    // Generate imports
    const imports = generateImports(tsPath, dependencies);
    
    // Process JSON with proper references
    const processedJson = processJsonReferences(jsonData, moduleName)
      .replace(/"([^"]+)":/g, (match, p1) => 
        p1.includes("-") ? `'${p1}':` : `${p1}:`);

    const tsContent = `${imports}\n\nexport const ${moduleName} = ${processedJson};\n`;

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
  // First build the symbol definition map
  buildSymbolDefinitionMap();
  
  // Then convert all files
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
}

// Start conversion
convertAllFiles();
console.log("👀 Watching JSON files in:", jsonDir);