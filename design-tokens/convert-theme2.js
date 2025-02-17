import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const jsonDir = path.join(__dirname, "json");
const tsDir = path.join(__dirname, "ts");

// Map to store where each token type is defined
const tokenDefinitionMap = new Map();

function ensureDirectoryExistence(filePath) {
  const dirname = path.dirname(filePath);
  if (!fs.existsSync(dirname)) {
    fs.mkdirSync(dirname, { recursive: true });
  }
}

/**
 * Scans all JSON files to build a map of token definitions
 */
function buildTokenDefinitionMap(directory = jsonDir) {
  const files = fs.readdirSync(directory, { withFileTypes: true });
  
  for (const file of files) {
    const fullPath = path.join(directory, file.name);
    
    if (file.isDirectory()) {
      buildTokenDefinitionMap(fullPath);
    } else if (file.name.endsWith('.json')) {
      const content = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
      const relativePath = path.relative(jsonDir, directory);
      const fileName = path.basename(file.name, '.json').replace(/-/g, '');
      
      // Store where each top-level token is defined
      Object.keys(content).forEach(key => {
        // Skip components in brand files as it's handled separately
        if (key === 'components' && relativePath === 'brand') return;
        
        tokenDefinitionMap.set(key, {
          directory: relativePath,
          fileName,
          filePath: fullPath
        });
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
 * Gets import information for a token reference
 */
function getTokenImport(tokenPath) {
  const firstPart = tokenPath.split('.')[0];
  const definition = tokenDefinitionMap.get(firstPart);
  
  if (!definition) return null;
  
  return {
    importName: definition.fileName,
    importPath: `../${definition.directory}/${definition.fileName}`
  };
}

/**
 * Processes a token reference into TypeScript
 */
function processTokenReference(reference, options = {}) {
  const { currentBrand } = options;
  if (!currentBrand && !reference.startsWith('{')) return reference;

  // Remove curly braces and split path
  const tokenPath = reference.slice(1, -1);
  const parts = tokenPath.split('.');

  // Handle theme references (background, foreground, etc.)
  if (['background', 'foreground', 'components'].includes(parts[0])) {
    return `${currentBrand}light${parts.map(formatPropertyAccessor).join('')}`;
  }

  // For other references, look up the definition
  const importInfo = getTokenImport(tokenPath);
  if (!importInfo) return reference;

  // If it's a brand reference and we have a current brand, use that
  if (parts[0] === 'brand' && currentBrand) {
    return `${currentBrand}${parts.map(formatPropertyAccessor).join('')}`;
  }

  // Otherwise use the looked-up import name
  return `${importInfo.importName}${parts.map(formatPropertyAccessor).join('')}`;
}

/**
 * Processes a value and collects required imports
 */
function processValue(value, options = {}) {
  const imports = new Set();
  
  if (value && typeof value === 'object' && 'value' in value) {
    if (typeof value.value === 'string' && value.value.startsWith('{')) {
      const importInfo = getTokenImport(value.value.slice(1, -1));
      if (importInfo) imports.add(JSON.stringify(importInfo));
      return { 
        value: processTokenReference(value.value, options),
        imports
      };
    }
    return { 
      value: typeof value.value === 'string' ? `'${value.value}'` : value.value,
      imports
    };
  }

  if (typeof value === 'string' && value.startsWith('{')) {
    const importInfo = getTokenImport(value.slice(1, -1));
    if (importInfo) imports.add(JSON.stringify(importInfo));
    return { 
      value: processTokenReference(value, options),
      imports
    };
  }

  return { 
    value: typeof value === 'string' ? `'${value}'` : value,
    imports
  };
}

/**
 * Processes an object's values recursively
 */
function processTokenObject(obj, options = {}) {
  const result = {};
  const imports = new Set();

  for (const [key, value] of Object.entries(obj)) {
    if (value && typeof value === 'object' && !('value' in value)) {
      const processed = processTokenObject(value, options);
      result[key] = processed.result;
      processed.imports.forEach(imp => imports.add(imp));
    } else {
      const processed = processValue(value, options);
      result[key] = processed.value;
      processed.imports.forEach(imp => imports.add(imp));
    }
  }

  return {
    result,
    imports: Array.from(imports).map(imp => JSON.parse(imp))
  };
}

/**
 * Creates TypeScript content with proper imports
 */
function createTypeScriptContent(data, options = {}) {
  const { fileName, additionalImports = [] } = options;
  const { result, imports } = processTokenObject(data, options);
  
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
  const content = JSON.stringify(result, null, 2)
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
    createTypeScriptContent(brandBase, { fileName: brandName })
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
          currentBrand: brandName
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
  
  // First build the token definition map
  console.log("📚 Building token definition map...");
  buildTokenDefinitionMap();
  
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
          fileName: path.basename(file.name, '.json')
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