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
        if (key !== 'components') { // Skip components as it's handled separately
          const location = {
            directory: relativePath,
            fileName,
            topLevelKey: key
          };
          fileDefinitionMap.set(key, location);
        }
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
  
  // Special handling for feedback references to avoid duplication
  if (parts[0] === 'feedback') {
    return `globalvalue${parts.map(formatPropertyAccessor).join('')}`;
  }
  
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
    // Remove redundant quotes for direct values
    return typeof value.value === 'string' ? `'${value.value}'` : value.value;
  }

  if (typeof value === 'string' && value.startsWith('{')) {
    return processTokenReference(value, options.currentFile);
  }

  // Remove redundant quotes for direct values
  return typeof value === 'string' ? `'${value}'` : value;
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
  const { currentFile, additionalImports = [] } = options;
  const fileName = path.basename(currentFile, '.json').replace(/-/g, '');
  
  // Handle components separately
  if ('components' in data) {
    // Process brand file without components
    const { components, ...brandData } = data;
    
    // Create brand file
    const brandContent = processTokenObject(brandData, { currentFile });
    const brandTs = `${brandContent.imports.map(imp => 
      `import { ${imp.importName} } from '${imp.importPath}';`
    ).join('\n')}

export const ${fileName} = ${JSON.stringify(brandContent.processed, null, 2)
  .replace(/"([^"]+)":/g, (_, p1) => p1.includes('-') ? `'${p1}':` : `${p1}:`)
  .replace(/'([^']+)'/g, '$1')};`;

    // Create components file
    const componentsContent = processTokenObject(components, { currentFile });
    const componentsTs = `import { ${fileName} } from './${fileName}';
${componentsContent.imports.map(imp => 
  `import { ${imp.importName} } from '${imp.importPath}';`
).join('\n')}

export const ${fileName}components = ${JSON.stringify(componentsContent.processed, null, 2)
  .replace(/"([^"]+)":/g, (_, p1) => p1.includes('-') ? `'${p1}':` : `${p1}:`)
  .replace(/'([^']+)'/g, '$1')};`;

    return { brandTs, componentsTs };
  }

  // Process regular file
  const { processed, imports } = processTokenObject(data, { currentFile });
  
  // Combine automatic imports with additional imports
  const allImports = [...imports, ...additionalImports];
  const importStatements = Array.from(new Set(allImports.map(imp => JSON.stringify(imp))))
    .map(imp => {
      const { importName, importPath } = JSON.parse(imp);
      return `import { ${importName} } from '${importPath}';`;
    })
    .join('\n');

  const content = JSON.stringify(processed, null, 2)
    .replace(/"([^"]+)":/g, (_, p1) => p1.includes('-') ? `'${p1}':` : `${p1}:`)
    .replace(/'([^']+)'/g, '$1');

  return `${importStatements}

export const ${fileName} = ${content};`;
}

/**
 * Converts all files in the json directory to TypeScript
 */
function convertFiles() {
  console.log("🔍 Starting conversion process...");
  buildFileDefinitionMap();
  
  function processDirectory(directory = jsonDir) {
    const files = fs.readdirSync(directory, { withFileTypes: true });
    
    for (const file of files) {
      const fullPath = path.join(directory, file.name);
      
      if (file.isDirectory()) {
        processDirectory(fullPath);
      } else if (file.name.endsWith('.json')) {
        const relativePath = path.relative(jsonDir, directory);
        const content = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
        const fileName = path.basename(file.name, '.json').replace(/-/g, '');
        
        console.log(`📦 Processing: ${path.join(relativePath, file.name)}`);
        
        // Check if this is a brand file with components
        if ('components' in content) {
          const { brandTs, componentsTs } = createTypeScriptContent(content, { 
            currentFile: file.name 
          });
          
          // Write brand file
          const brandPath = path.join(tsDir, relativePath, `${fileName}.ts`);
          ensureDirectoryExistence(brandPath);
          fs.writeFileSync(brandPath, brandTs);
          
          // Write components file
          const componentsPath = path.join(tsDir, relativePath, `${fileName}components.ts`);
          fs.writeFileSync(componentsPath, componentsTs);
        } else {
          const tsPath = path.join(tsDir, relativePath, `${fileName}.ts`);
          const additionalImports = [];
          
          // Add globalvalue import for theme files
          if (relativePath.includes('theme')) {
            additionalImports.push({
              importName: 'globalvalue',
              importPath: '../globals/globalvalue'
            });
          }
          
          const tsContent = createTypeScriptContent(content, { 
            currentFile: file.name,
            additionalImports
          });
          
          ensureDirectoryExistence(tsPath);
          fs.writeFileSync(tsPath, tsContent);
        }
      }
    }
  }

  processDirectory();
  console.log("✨ Conversion complete!");
}

// Start conversion
convertFiles();