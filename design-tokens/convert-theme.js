import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration - can be modified for different projects
const CONFIG = {
  sourceDir: "json",  // Source directory for JSON files
  outputDir: "ts",    // Output directory for TypeScript files
  fileExtension: {
    source: ".json",
    output: ".ts"
  }
};

const jsonDir = path.join(__dirname, CONFIG.sourceDir);
const tsDir = path.join(__dirname, CONFIG.outputDir);

// Cache for storing symbol definitions and their full paths
const symbolDefinitionCache = new Map();

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
      } else if (file.isFile() && file.name.endsWith(CONFIG.fileExtension.source)) {
        try {
          const content = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
          const relativePath = path.relative(jsonDir, dir);
          const moduleBaseName = path.basename(file.name, CONFIG.fileExtension.source);
          
          // Store full path information for the module
          const moduleInfo = {
            folder: relativePath,
            name: moduleBaseName,
            fullPath: path.join(relativePath, moduleBaseName),
            symbols: extractTopLevelSymbols(content)
          };
          
          // Cache each top-level symbol with its module info
          for (const symbol of moduleInfo.symbols) {
            if (symbolDefinitionCache.has(symbol)) {
              console.warn(`⚠️ Warning: Symbol '${symbol}' is defined in multiple files:`,
                `\n  - ${symbolDefinitionCache.get(symbol).fullPath}`,
                `\n  - ${moduleInfo.fullPath}`);
            }
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
 * Extracts all top-level symbols from a JSON object
 */
function extractTopLevelSymbols(obj) {
  return Array.from(new Set(
    Object.keys(obj).concat(
      Object.values(obj)
        .filter(v => typeof v === 'object' && v !== null)
        .flatMap(v => extractReferencedSymbols(v))
    )
  ));
}

/**
 * Finds all referenced symbols in an object
 */
function extractReferencedSymbols(obj) {
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
 * Analyzes dependencies between modules
 */
function analyzeDependencies(jsonPath) {
  const content = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  const currentModule = path.basename(jsonPath, CONFIG.fileExtension.source);
  const dependencies = new Set();

  function findDependencies(obj) {
    if (typeof obj !== 'object' || obj === null) return;
    
    Object.values(obj).forEach(value => {
      if (typeof value === 'string' && value.startsWith('{') && value.endsWith('}')) {
        const symbol = value.slice(1, -1).split('.')[0];
        const moduleInfo = symbolDefinitionCache.get(symbol);
        if (moduleInfo && moduleInfo.name !== currentModule) {
          dependencies.add(moduleInfo);
        }
      } else if (typeof value === 'object') {
        findDependencies(value);
      }
    });
  }

  findDependencies(content);
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
        return `${moduleInfo.name}.${parts.join('.')}`;
      }
      return value.slice(1, -1); // Remove curly braces for internal references
    }
    return value;
  }, 2);
}

/**
 * Converts a JSON file to TypeScript
 */
function convertJsonToTs(jsonPath) {
  const relativePath = path.relative(jsonDir, jsonPath);
  const tsPath = path.join(tsDir, relativePath.replace(CONFIG.fileExtension.source, CONFIG.fileExtension.output));
  const moduleName = path.basename(tsPath, CONFIG.fileExtension.output).replace(/-/g, "_");

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

/**
 * Converts all JSON files to TypeScript
 */
function convertAllFiles() {
  console.log(`🔍 Scanning ${CONFIG.sourceDir} directory for JSON files...`);
  
  // First build the symbol definition map
  buildSymbolDefinitionMap();
  
  // Then convert all files
  function processDirectory(dir) {
    fs.readdirSync(dir, { withFileTypes: true }).forEach(dirent => {
      const fullPath = path.join(dir, dirent.name);
      if (dirent.isDirectory()) {
        processDirectory(fullPath);
      } else if (dirent.isFile() && dirent.name.endsWith(CONFIG.fileExtension.source)) {
        convertJsonToTs(fullPath);
      }
    });
  }

  processDirectory(jsonDir);
  console.log(`✨ Conversion complete! TypeScript files generated in ${CONFIG.outputDir}/`);
}

// Start conversion
convertAllFiles();