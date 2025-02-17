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
        // Skip 'components' in brand files as it's handled separately
        if (key === 'components' && relativePath === 'brand') return;
        
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
/**
 * Processes a token reference path into TypeScript
 */
function processTokenReference(reference, options = {}) {
  const { currentBrand } = options;
  if (!currentBrand) return reference;

  // Remove curly braces and split path
  const tokenPath = reference.slice(1, -1);
  const parts = tokenPath.split('.');
  
  // Look up the defining file for this token
  const firstPart = parts[0];
  const location = fileDefinitionMap.get(firstPart);
  
  if (!location) return reference;
  
  if (location.directory === 'globals') {
    // Token is defined in a globals file
    return `${location.fileName}${parts.map(formatPropertyAccessor).join('')}`;
  } else if (['background', 'foreground', 'components'].includes(firstPart)) {
    // Theme references
    return `${currentBrand}light${parts.map(formatPropertyAccessor).join('')}`;
  } else {
    // Brand references
    return `${currentBrand}${parts.map(formatPropertyAccessor).join('')}`;
  }
}

/**
 * Processes a value, handling both direct values and references
 */
function processValue(value, options = {}) {
  if (value && typeof value === 'object' && 'value' in value) {
    if (typeof value.value === 'string' && value.value.startsWith('{')) {
      return processTokenReference(value.value, options);
    }
    // For direct values, remove redundant quotes
    return typeof value.value === 'string' ? `'${value.value}'` : value.value;
  }

  if (typeof value === 'string' && value.startsWith('{')) {
    return processTokenReference(value, options);
  }

  // For direct values, remove redundant quotes
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
function createTypeScriptContent(data, options = {}) {
  const { fileName, additionalImports = [] } = options;
  const { processed, imports } = processTokenObject(data, options);
  
  // Combine automatic imports with additional imports
  const allImports = [...imports, ...additionalImports];
  
  // Generate import statements
  const importStatements = Array.from(new Set(allImports.map(imp => JSON.stringify(imp))))
    .map(imp => {
      const { importName, importPath } = JSON.parse(imp);
      return `import { ${importName} } from '${importPath}';`;
    })
    .join('\n');

  // Convert to string with proper formatting
  const content = JSON.stringify(processed, null, 2)
    .replace(/"([^"]+)":/g, (_, p1) => p1.includes('-') ? `'${p1}':` : `${p1}:`)
    .replace(/: "([^"]+)"/g, ": $1") // Remove quotes around values
    .replace(/"([^"]+\.[^"]+(?:\['[^']+'\])*)"(?=,?\n)/g, '$1');

  const exportName = fileName.replace(/-/g, '');
  
  return `${importStatements}

export const ${exportName} = ${content};
`;
}

/**
 * Processes a brand file and its components
 */
function processBrandFile(brandFile, directory) {
  const brandName = path.basename(brandFile, '.json').replace(/-/g, '');
  const content = JSON.parse(fs.readFileSync(path.join(directory, brandFile), 'utf8'));
  
  // Split components into separate file
  const { components, ...brandBase } = content;
  
  // Write brand base file
  const basePath = path.join(tsDir, 'brand', `${brandName}.ts`);
  ensureDirectoryExistence(basePath);
  fs.writeFileSync(
    basePath,
    createTypeScriptContent(brandBase, { 
      fileName: brandName,
      additionalImports: [
        { importName: 'globals', importPath: '../globals/globals' }
      ]
    })
  );
  
  // Write components file
  const componentsPath = path.join(tsDir, 'brand', `${brandName}components.ts`);
  fs.writeFileSync(
    componentsPath,
    createTypeScriptContent(components, {
      fileName: `${brandName}components`,
      currentBrand: brandName,
      additionalImports: [
        { importName: brandName, importPath: `../brand/${brandName}` },
        { importName: `${brandName}light`, importPath: `../theme/${brandName}light` },
        { importName: `${brandName}dark`, importPath: `../theme/${brandName}dark` }
      ]
    })
  );

  // Process theme variations
  ['light', 'dark'].forEach(variation => {
    const themeFile = path.join(jsonDir, 'theme', `${variation}.json`);
    if (fs.existsSync(themeFile)) {
      const themeContent = JSON.parse(fs.readFileSync(themeFile, 'utf8'));
      const themePath = path.join(tsDir, 'theme', `${brandName}${variation}.ts`);
      
      ensureDirectoryExistence(themePath);
      fs.writeFileSync(
        themePath,
        createTypeScriptContent(themeContent, {
          fileName: `${brandName}${variation}`,
          currentBrand: brandName,
          additionalImports: [
            { importName: 'globalvalue', importPath: '../globals/globalvalue' },
            { importName: brandName, importPath: `../brand/${brandName}` },
            { importName: `${brandName}components`, importPath: `../brand/${brandName}components` }
          ]
        })
      );
    }
  });
}

/**
 * Converts all files in the json directory to TypeScript
 */
function convertFiles() {
  console.log("🔍 Starting conversion process...");
  
  // First build the definition map
  console.log("📚 Building file definition map...");
  buildFileDefinitionMap();
  
  // Process brand files first
  const brandDir = path.join(jsonDir, 'brand');
  if (fs.existsSync(brandDir)) {
    const brandFiles = fs.readdirSync(brandDir)
      .filter(f => f.endsWith('.json'));
      
    for (const brandFile of brandFiles) {
      console.log(`📦 Processing brand: ${brandFile}`);
      processBrandFile(brandFile, brandDir);
    }
  }
  
  // Process remaining files
  function processDirectory(directory = jsonDir) {
    const files = fs.readdirSync(directory, { withFileTypes: true });
    
    for (const file of files) {
      const fullPath = path.join(directory, file.name);
      const relativePath = path.relative(jsonDir, directory);
      
      // Skip brand directory as it's already processed
      if (file.isDirectory() && relativePath !== 'brand') {
        processDirectory(fullPath);
      } else if (file.name.endsWith('.json') && relativePath !== 'brand') {
        const tsPath = path.join(tsDir, relativePath, file.name.replace('.json', '.ts'));
        
        console.log(`📦 Processing: ${path.join(relativePath, file.name)}`);
        
        const content = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
        const tsContent = createTypeScriptContent(content, { 
          fileName: path.basename(file.name, '.json'),
          additionalImports: [
            { importName: 'globalvalue', importPath: '../globals/globalvalue' }
          ]
        });
        
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