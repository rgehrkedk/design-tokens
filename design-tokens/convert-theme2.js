import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const jsonDir = path.join(__dirname, "json");
const tsDir = path.join(__dirname, "ts");

// Map to store file definitions and their locations
const fileDefinitionMap = new Map();

function ensureDirectoryExistence(filePath) {
  const dirname = path.dirname(filePath);
  if (!fs.existsSync(dirname)) {
    fs.mkdirSync(dirname, { recursive: true });
  }
}

/**
 * Scans the entire json directory to build a map of where tokens are defined
 */
function buildFileDefinitionMap(directory = jsonDir) {
  const files = fs.readdirSync(directory, { withFileTypes: true });
  
  for (const file of files) {
    const fullPath = path.join(directory, file.name);
    
    if (file.isDirectory()) {
      buildFileDefinitionMap(fullPath);
    } else if (file.name.endsWith('.json')) {
      const content = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
      const relativePath = path.relative(jsonDir, directory);
      const fileName = path.basename(file.name, '.json').replace(/-/g, '');
      
      // Store the top-level keys and their file location
      Object.keys(content).forEach(key => {
        const location = {
          directory: relativePath,
          fileName,
          topLevelKey: key
        };
        fileDefinitionMap.set(key, location);
      });
    }
  }
}

/**
 * Formats a property accessor for TypeScript
 */
function formatPropertyAccessor(part) {
  if (/^\d+$/.test(part) || part.includes('-') || part.includes(' ')) {
    return `['${part}']`;
  }
  return `.${part}`;
}

/**
 * Gets the import name and path for a token based on its location
 */
function getTokenImportInfo(tokenPath) {
  const firstPart = tokenPath.split('.')[0];
  const location = fileDefinitionMap.get(firstPart);
  
  if (!location) return null;
  
  const importName = location.fileName;
  const importPath = `../${location.directory}/${location.fileName}`;
  
  return { importName, importPath };
}

/**
 * Processes a token reference path into TypeScript
 */
function processTokenReference(reference, currentFile) {
  // Remove curly braces and split path
  const tokenPath = reference.slice(1, -1);
  const parts = tokenPath.split('.');
  
  // Get import info for this token
  const importInfo = getTokenImportInfo(tokenPath);
  if (!importInfo) return reference; // Keep original if not found
  
  // Build the reference using the import name
  const accessors = parts.map(formatPropertyAccessor).join('');
  return `${importInfo.importName}${accessors}`;
}

/**
 * Processes a value, handling both direct values and references
 */
function processValue(value, options = {}) {
  if (value && typeof value === 'object' && 'value' in value) {
    if (typeof value.value === 'string' && value.value.startsWith('{')) {
      return processTokenReference(value.value, options.currentFile);
    }
    return JSON.stringify(value.value);
  }

  if (typeof value === 'string' && value.startsWith('{')) {
    return processTokenReference(value, options.currentFile);
  }

  return JSON.stringify(value);
}

/**
 * Processes an object's values recursively
 */
function processTokenObject(obj, options = {}) {
  const result = {};
  const requiredImports = new Set();

  for (const [key, value] of Object.entries(obj)) {
    if (value && typeof value === 'object' && !('value' in value)) {
      const { processed, imports } = processTokenObject(value, options);
      result[key] = processed;
      imports.forEach(imp => requiredImports.add(JSON.stringify(imp)));
    } else {
      const processed = processValue(value, options);
      result[key] = processed;
      
      // If it's a reference, track the required import
      if (typeof value === 'string' && value.startsWith('{')) {
        const importInfo = getTokenImportInfo(value.slice(1, -1));
        if (importInfo) {
          requiredImports.add(JSON.stringify(importInfo));
        }
      }
    }
  }

  return {
    processed: result,
    imports: Array.from(requiredImports).map(imp => JSON.parse(imp))
  };
}

/**
 * Creates TypeScript content with proper imports and formatting
 */
function createTypeScriptContent(data, options) {
  const { currentFile } = options;
  const { processed, imports } = processTokenObject(data, { currentFile });
  
  // Generate import statements
  const importStatements = Array.from(new Set(imports))
    .map(imp => `import { ${imp.importName} } from '${imp.importPath}';`)
    .join('\n');

  // Convert to string with proper formatting
  const content = JSON.stringify(processed, null, 2)
    .replace(/"([^"]+)":/g, (_, p1) => p1.includes('-') ? `'${p1}':` : `${p1}:`)
    .replace(/"([^"]+\.[^"]+(?:\['[^']+'\])*)"(?=,?\n)/g, '$1');

  const exportName = path.basename(currentFile, '.json').replace(/-/g, '');
  
  return `${importStatements}

export const ${exportName} = ${content};
`;
}

/**
 * Converts all files in the json directory to TypeScript
 */
function convertFiles() {
  console.log("🔍 Starting conversion process...");
  
  // First build the definition map
  console.log("📚 Building file definition map...");
  buildFileDefinitionMap();
  
  // Process all JSON files
  function processDirectory(directory = jsonDir) {
    const files = fs.readdirSync(directory, { withFileTypes: true });
    
    for (const file of files) {
      const fullPath = path.join(directory, file.name);
      
      if (file.isDirectory()) {
        processDirectory(fullPath);
      } else if (file.name.endsWith('.json')) {
        const relativePath = path.relative(jsonDir, directory);
        const tsPath = path.join(tsDir, relativePath, file.name.replace('.json', '.ts'));
        
        console.log(`📦 Processing: ${path.join(relativePath, file.name)}`);
        
        const content = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
        const tsContent = createTypeScriptContent(content, { currentFile: file.name });
        
        ensureDirectoryExistence(tsPath);
        fs.writeFileSync(tsPath, tsContent);
      }
    }
  }

  processDirectory();
  console.log("✨ Conversion complete!");
}

// Start conversion
convertFiles();