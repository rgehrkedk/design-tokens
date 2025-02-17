import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const jsonDir = path.join(__dirname, "json");
const tsDir = path.join(__dirname, "ts");

// Map to track token definitions and their locations
const tokenDefinitions = new Map();

function ensureDirectoryExistence(filePath) {
  const dirname = path.dirname(filePath);
  if (!fs.existsSync(dirname)) {
    fs.mkdirSync(dirname, { recursive: true });
  }
}

/**
 * Builds a map of all token definitions and their locations
 */
function buildTokenDefinitionMap() {
  function scanDirectory(dir) {
    const files = fs.readdirSync(dir, { withFileTypes: true });
    
    for (const file of files) {
      const fullPath = path.join(dir, file.name);
      
      if (file.isDirectory()) {
        scanDirectory(fullPath);
      } else if (file.isFile() && file.name.endsWith('.json')) {
        const content = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
        const relativePath = path.relative(jsonDir, dir);
        const moduleName = path.basename(file.name, '.json').replace(/-/g, '_');
        
        // Store location info for each top-level token
        Object.keys(content).forEach(token => {
          tokenDefinitions.set(token, {
            path: relativePath,
            module: moduleName,
            file: file.name
          });
        });
      }
    }
  }

  scanDirectory(jsonDir);
}

/**
 * Finds the source module for a token
 */
function findTokenSource(token) {
  return tokenDefinitions.get(token);
}

/**
 * Processes a reference string (e.g. "{brand.primary.300}")
 */
function processReference(ref, currentPath) {
  if (!ref.startsWith('{') || !ref.endsWith('}')) return ref;
  
  const tokenPath = ref.slice(1, -1);
  const parts = tokenPath.split('.');
  const rootToken = parts[0];
  
  const tokenInfo = findTokenSource(rootToken);
  if (!tokenInfo) return ref;
  
  // Determine relative import path
  const importPath = path.relative(
    path.dirname(currentPath),
    path.join(tsDir, tokenInfo.path)
  );
  
  // Build the reference string
  const reference = parts.map(part => {
    return part.includes('-') ? `['${part}']` : `.${part}`;
  }).join('');
  
  return `${tokenInfo.module}${reference}`;
}

/**
 * Collects all required imports for a set of references
 */
function collectImports(references, currentPath) {
  const imports = new Set();
  
  for (const ref of references) {
    if (!ref.startsWith('{') || !ref.endsWith('}')) continue;
    
    const tokenPath = ref.slice(1, -1);
    const rootToken = tokenPath.split('.')[0];
    
    const tokenInfo = findTokenSource(rootToken);
    if (tokenInfo) {
      const importPath = path.relative(
        path.dirname(currentPath),
        path.join(tsDir, tokenInfo.path)
      ).replace(/\\/g, '/');
      
      imports.add(`import { ${tokenInfo.module} } from '${importPath}/${tokenInfo.module}';`);
    }
  }
  
  return Array.from(imports).sort().join('\n');
}

/**
 * Finds all token references in an object
 */
function findReferences(obj) {
  const references = new Set();
  
  JSON.stringify(obj, (key, value) => {
    if (typeof value === 'string' && value.startsWith('{') && value.endsWith('}')) {
      references.add(value);
    }
    return value;
  });
  
  return Array.from(references);
}

/**
 * Converts a JSON object to TypeScript format
 */
function convertToTypeScript(obj, currentPath) {
  const references = findReferences(obj);
  const imports = collectImports(references, currentPath);
  
  let content = JSON.stringify(obj, null, 2);
  
  // Process all references
  references.forEach(ref => {
    const processed = processReference(ref, currentPath);
    content = content.replace(new RegExp(escapeRegExp(ref), 'g'), processed);
  });
  
  // Format for TypeScript
  content = content
    .replace(/"([^"]+)":/g, (_, key) => {
      return key.includes('-') ? `'${key}':` : `${key}:`;
    })
    .replace(/: "([^"]+)"/g, ": $1")
    .replace(/"/g, "'");
  
  return { imports, content };
}

function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Converts a JSON file to TypeScript
 */
function convertFile(jsonPath) {
  const relativePath = path.relative(jsonDir, jsonPath);
  const tsPath = path.join(tsDir, relativePath.replace(/\.json$/, ".ts"));
  const moduleName = path.basename(tsPath, ".ts").replace(/-/g, "_");

  try {
    const jsonContent = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    const { imports, content } = convertToTypeScript(jsonContent, tsPath);
    
    const tsContent = `${imports}\n\nexport const ${moduleName} = ${content};\n`;
    
    ensureDirectoryExistence(tsPath);
    fs.writeFileSync(tsPath, tsContent);
    
    console.log(`✅ Converted: ${jsonPath} → ${tsPath}`);
  } catch (error) {
    console.error(`❌ Error processing ${jsonPath}:`, error);
  }
}

/**
 * Converts all JSON files in the directory
 */
function convertAllFiles(dir = jsonDir) {
  // First build the token definition map
  buildTokenDefinitionMap();
  
  // Then convert all files
  fs.readdirSync(dir, { withFileTypes: true }).forEach(dirent => {
    const fullPath = path.join(dir, dirent.name);
    if (dirent.isDirectory()) {
      convertAllFiles(fullPath);
    } else if (dirent.isFile() && dirent.name.endsWith(".json")) {
      convertFile(fullPath);
    }
  });
}

// Start conversion
convertAllFiles();
console.log("👀 Watching JSON files in:", jsonDir);