import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const jsonDir = path.join(__dirname, "json");
const tsDir = path.join(__dirname, "ts");

// Cache for tracking token definitions and dependencies
const tokenDefinitions = new Map();
const dependencyGraph = new Map();
const globalTokens = new Map(); // Cache for all global tokens

function ensureDirectoryExistence(filePath) {
  const dirname = path.dirname(filePath);
  if (!fs.existsSync(dirname)) {
    fs.mkdirSync(dirname, { recursive: true });
  }
}

/**
 * Merges multiple global token files into a single collection
 */
function mergeGlobalTokens(filesMap) {
  const merged = {};
  
  for (const [namespace, tokens] of filesMap.entries()) {
    if (namespace === 'globals') {
      // If this is the main globals.json, merge at root level
      Object.assign(merged, tokens);
    } else {
      // For other files, create a namespace
      merged[namespace] = tokens;
    }
  }
  
  return merged;
}

/**
 * Processes a globals directory containing multiple token files
 */
function processGlobalsDirectory(globalsPath) {
  const globalsFiles = new Map();
  
  // Read all JSON files in the globals directory
  fs.readdirSync(globalsPath)
    .filter(file => file.endsWith('.json'))
    .forEach(file => {
      const filePath = path.join(globalsPath, file);
      const namespace = path.basename(file, '.json');
      try {
        const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        globalsFiles.set(namespace, content);
      } catch (error) {
        console.error(`Error processing ${file}:`, error);
      }
    });
  
  // Merge all global tokens
  const mergedGlobals = mergeGlobalTokens(globalsFiles);
  globalTokens.set('merged', mergedGlobals);
  
  // Store individual files for reference
  for (const [namespace, content] of globalsFiles.entries()) {
    globalTokens.set(namespace, content);
  }
  
  return mergedGlobals;
}

/**
 * Scans all JSON files to build a map of token definitions and their locations
 */
function buildTokenDefinitionMap() {
  function scanFile(filePath, namespace) {
    const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const tokens = new Set();
    
    function traverse(obj, path = []) {
      for (const [key, value] of Object.entries(obj)) {
        const currentPath = [...path, key];
        const fullPath = currentPath.join('.');
        
        if (value && typeof value === 'object') {
          if ('value' in value) {
            tokens.add(fullPath);
          } else {
            traverse(value, currentPath);
          }
        } else {
          tokens.add(fullPath);
        }
      }
    }
    
    traverse(content);
    tokenDefinitions.set(namespace, tokens);
  }

  // Scan globals
  const globalsPath = path.join(jsonDir, 'globals');
  if (fs.existsSync(globalsPath)) {
    fs.readdirSync(globalsPath)
      .filter(file => file.endsWith('.json'))
      .forEach(file => {
        const namespace = path.basename(file, '.json');
        scanFile(path.join(globalsPath, file), namespace);
      });
  }

  // Scan brands
  const brandsPath = path.join(jsonDir, 'brand');
  if (fs.existsSync(brandsPath)) {
    fs.readdirSync(brandsPath)
      .filter(file => file.endsWith('.json'))
      .forEach(file => {
        const namespace = path.basename(file, '.json').replace(/-/g, '');
        scanFile(path.join(brandsPath, file), namespace);
      });
  }
}

/**
 * Analyzes token references to build dependency graph
 */
function buildDependencyGraph(content, sourceFile) {
  const dependencies = new Set();

  function findReferences(obj) {
    if (typeof obj === 'string' && obj.startsWith('{') && obj.endsWith('}')) {
      const reference = obj.slice(1, -1);
      const namespace = reference.split('.')[0];
      dependencies.add(namespace);
    } else if (obj && typeof obj === 'object') {
      for (const value of Object.values(obj)) {
        findReferences(value);
      }
    }
  }

  findReferences(content);
  dependencyGraph.set(sourceFile, Array.from(dependencies));
}

/**
 * Resolves a token reference to its source file
 */
function resolveTokenSource(reference) {
  const [namespace, ...parts] = reference.split('.');
  
  // Check if this is a global token
  if (globalTokens.has(namespace)) {
    return {
      namespace,
      path: parts,
      isGlobal: true
    };
  }
  
  // Default to standard resolution
  return {
    namespace,
    path: parts,
    isGlobal: false
  };
}

/**
 * Determines the correct import path for a dependency
 */
function getImportPath(sourceFile, dependency) {
  const sourceDir = path.dirname(sourceFile);
  let targetPath;

  // Handle global token files
  if (globalTokens.has(dependency)) {
    targetPath = path.join(tsDir, 'globals', dependency);
  }
  // Handle brand references
  else if (dependency === 'brand') {
    const brandName = path.basename(sourceFile, '.ts').replace(/(?:light|dark)$/, '');
    targetPath = path.join(tsDir, 'brand', brandName);
  }
  // Handle other dependencies
  else {
    targetPath = path.join(tsDir, 'brand', dependency);
  }

  let relativePath = path.relative(sourceDir, targetPath).replace(/\\/g, '/');
  if (!relativePath.startsWith('.')) {
    relativePath = './' + relativePath;
  }
  
  return relativePath;
}

/**
 * Generates TypeScript imports based on dependencies
 */
function generateImports(sourceFile, dependencies) {
  return dependencies
    .map(dep => {
      const importPath = getImportPath(sourceFile, dep);
      return `import { ${dep} } from '${importPath}';`;
    })
    .join('\n');
}

/**
 * Formats a value for TypeScript output
 */
function formatValue(value, currentNamespace) {
  if (typeof value === 'string' && value.startsWith('{') && value.endsWith('}')) {
    const reference = value.slice(1, -1);
    const [namespace, ...parts] = reference.split('.');
    
    // Determine correct reference prefix
    let prefix = namespace;
    if (namespace === 'brand') {
      prefix = currentNamespace;
    }
    
    return `${prefix}.${parts.join('.')}`;
  }
  
  return JSON.stringify(value);
}

/**
 * Processes object values recursively
 */
function processTokenObject(obj, currentNamespace) {
  const result = {};
  
  for (const [key, value] of Object.entries(obj)) {
    if (value && typeof value === 'object' && !('value' in value)) {
      result[key] = processTokenObject(value, currentNamespace);
    } else if (value && typeof value === 'object' && 'value' in value) {
      result[key] = formatValue(value.value, currentNamespace);
    } else {
      result[key] = formatValue(value, currentNamespace);
    }
  }
  
  return result;
}

/**
 * Converts JSON tokens to TypeScript
 */
function convertTokensToTypeScript(jsonPath, options = {}) {
  const { currentNamespace, outputPath } = options;
  const content = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  
  // Build dependency graph for this file
  buildDependencyGraph(content, outputPath);
  
  // Process token values
  const processedTokens = processTokenObject(content, currentNamespace);
  
  // Generate imports
  const imports = generateImports(outputPath, dependencyGraph.get(outputPath) || []);
  
  // Format the TypeScript content
  const tsContent = `${imports}

export const ${currentNamespace} = ${JSON.stringify(processedTokens, null, 2)
    .replace(/"([^"]+)":/g, (_, p1) => p1.includes('-') ? `'${p1}':` : `${p1}:`)
    .replace(/"([^"]+)\.([^"]+)"/g, '$1.$2')};
`;

  // Write the TypeScript file
  ensureDirectoryExistence(outputPath);
  fs.writeFileSync(outputPath, tsContent, 'utf8');
  
  console.log(`✅ Converted ${jsonPath} → ${outputPath}`);
}

/**
 * Process a brand file and split it into base and components
 */
function processBrandFile(brandFile) {
  const brandName = path.basename(brandFile, '.json').replace(/-/g, '');
  const content = JSON.parse(fs.readFileSync(brandFile, 'utf8'));
  
  // Split into base and components
  const { components, ...baseContent } = content;
  
  // Convert base content
  const baseOutputPath = path.join(tsDir, 'brand', `${brandName}.ts`);
  convertTokensToTypeScript(brandFile, {
    currentNamespace: brandName,
    outputPath: baseOutputPath,
    content: baseContent
  });
  
  // Convert components if they exist
  if (components) {
    const componentsOutputPath = path.join(tsDir, 'brand', `${brandName}components.ts`);
    convertTokensToTypeScript(brandFile, {
      currentNamespace: `${brandName}components`,
      outputPath: componentsOutputPath,
      content: { components }
    });
  }
}

/**
 * Main conversion function
 */
function convertAllTokens() {
  console.log('🔍 Starting token conversion...');
  
  // First build the token definition map
  buildTokenDefinitionMap();
  
  // Process globals directory
  const globalsPath = path.join(jsonDir, 'globals');
  if (fs.existsSync(globalsPath)) {
    // Process and merge all global token files
    const mergedGlobals = processGlobalsDirectory(globalsPath);
    
    // Generate individual TypeScript files for each global token file
    for (const [namespace, content] of globalTokens.entries()) {
      if (namespace === 'merged') continue; // Skip the merged content
      
      const outputPath = path.join(tsDir, 'globals', `${namespace}.ts`);
      console.log(`Processing global tokens: ${namespace}`);
      
      convertTokensToTypeScript(null, {
        currentNamespace: namespace,
        outputPath,
        content // Pass the content directly since we already have it
      });
    }
    
    // Generate the merged globals file
    const mergedOutputPath = path.join(tsDir, 'globals', 'index.ts');
    console.log('Generating merged globals file...');
    
    // Create an index file that exports all globals
    const indexContent = Array.from(globalTokens.keys())
      .filter(name => name !== 'merged')
      .map(name => `export * from './${name}';`)
      .join('\n');
    
    ensureDirectoryExistence(mergedOutputPath);
    fs.writeFileSync(mergedOutputPath, indexContent, 'utf8');
  }
  
  // Process brands
  const brandsPath = path.join(jsonDir, 'brand');
  if (fs.existsSync(brandsPath)) {
    fs.readdirSync(brandsPath)
      .filter(file => file.endsWith('.json'))
      .forEach(file => {
        processBrandFile(path.join(brandsPath, file));
      });
  }
  
  // Process themes
  const themePath = path.join(jsonDir, 'theme');
  if (fs.existsSync(themePath)) {
    fs.readdirSync(themePath)
      .filter(file => file.endsWith('.json'))
      .forEach(file => {
        const brandName = file.replace(/-(light|dark)\.json$/, '');
        const variant = file.includes('light') ? 'light' : 'dark';
        const inputPath = path.join(themePath, file);
        const outputPath = path.join(tsDir, 'theme', `${brandName}${variant}.ts`);
        
        convertTokensToTypeScript(inputPath, {
          currentNamespace: `${brandName}${variant}`,
          outputPath
        });
      });
  }
  
  console.log('✨ Token conversion complete!');
}

// Start conversion
convertAllTokens();