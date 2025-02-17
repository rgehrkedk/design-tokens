import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const jsonDir = path.join(__dirname, "json");
const tsDir = path.join(__dirname, "ts");

// Map to store all token definitions and their locations
const tokenDefinitionMap = new Map();
// Store list of discovered brands
const brandsList = new Set();

function ensureDirectoryExistence(filePath) {
  const dirname = path.dirname(filePath);
  if (!fs.existsSync(dirname)) {
    fs.mkdirSync(dirname, { recursive: true });
  }
}

/**
 * Scans all JSON files to build a complete token definition map and discover brands
 */
function buildTokenDefinitionMap(dir = jsonDir) {
  const files = fs.readdirSync(dir, { withFileTypes: true });
  
  for (const file of files) {
    const fullPath = path.join(dir, file.name);
    const relativePath = path.relative(jsonDir, dir);
    
    if (file.isDirectory()) {
      buildTokenDefinitionMap(fullPath);
    } else if (file.name.endsWith('.json')) {
      // Store brand names if found in brand directory
      if (relativePath === 'brand') {
        const brandName = path.basename(file.name, '.json');
        brandsList.add(brandName);
      }

      const content = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
      const moduleName = path.basename(file.name, '.json').replace(/-/g, '_');
      
      // Store file location and top-level keys
      const keys = new Set(
        Object.keys(content).filter(key => 
          !(relativePath === 'brand' && key === 'components')
        )
      );
      
      const fileInfo = {
        path: relativePath,
        module: moduleName,
        keys,
        isGlobal: relativePath.startsWith('globals'),
        isTheme: relativePath === 'theme'
      };
      
      tokenDefinitionMap.set(fullPath, fileInfo);
    }
  }
}

/**
 * Find the source file that defines a token
 */
function findTokenDefinition(token) {
  for (const [filePath, info] of tokenDefinitionMap) {
    if (info.keys.has(token)) {
      return {
        filePath,
        ...info
      };
    }
  }
  return null;
}

/**
 * Process token references to determine correct imports
 */
function processTokenReferences(obj, excludeTheme = false) {
  const references = new Set();
  
  JSON.stringify(obj, (key, value) => {
    if (typeof value === 'string' && value.startsWith('{') && value.endsWith('}')) {
      const token = value.slice(1, -1).split('.')[0];
      const definition = findTokenDefinition(token);
      if (definition && (!excludeTheme || !definition.isTheme)) {
        references.add(definition);
      }
    }
    return value;
  });
  
  return Array.from(references);
}

/**
 * Generate import statements for required tokens
 */
function generateImports(references, currentPath) {
  const imports = new Set();
  
  for (const ref of references) {
    const relativePath = path.relative(
      path.dirname(currentPath),
      path.join(tsDir, ref.path)
    );
    
    const importPath = relativePath.startsWith('.') 
      ? relativePath 
      : './' + relativePath;
      
    const importName = ref.module;
    imports.add(`import { ${importName} } from '${importPath}/${ref.module}';`);
  }
  
  return Array.from(imports).join('\n');
}

/**
 * Format JSON values for TypeScript with proper references
 */
function formatJsonForTs(obj) {
  return JSON.stringify(obj, null, 2)
    .replace(/"([^"]+)":/g, (match, p1) => 
      p1.includes('-') ? `'${p1}':` : `${p1}:`)
    .replace(/"\{([^}]+)\}"/g, (match, p1) => {
      const parts = p1.split('.');
      const token = parts[0];
      const definition = findTokenDefinition(token);
      
      if (definition) {
        const prefix = `${definition.module}.`;
        if (parts.length === 2) {
          return `${prefix}${token}['${parts[1]}']`;
        } else if (parts.length >= 3) {
          return `${prefix}${token}.${parts[1]}${parts.slice(2).map(p => `['${p}']`).join('')}`;
        }
      }
      
      return match;
    })
    .replace(/"([^"]+)"/g, "'$1'");
}

/**
 * Convert theme files for each brand
 */
function convertThemeFiles() {
  const themeDir = path.join(jsonDir, 'theme');
  if (!fs.existsSync(themeDir)) return;

  const themeFiles = fs.readdirSync(themeDir)
    .filter(f => f.endsWith('.json'));

  // Process each theme file for each brand
  for (const themeFile of themeFiles) {
    const themeName = path.basename(themeFile, '.json'); // 'dark' or 'light'
    const themeContent = JSON.parse(
      fs.readFileSync(path.join(themeDir, themeFile), 'utf8')
    );

    // Generate theme file for each brand
    for (const brand of brandsList) {
      const tsPath = path.join(tsDir, 'theme', `${brand}_${themeName}.ts`);
      
      // Process references excluding theme files to prevent circular imports
      const references = processTokenReferences(themeContent, true);
      const imports = generateImports(references, tsPath);
      
      const formattedJson = formatJsonForTs(themeContent);
      const moduleName = `${brand}_${themeName}`;
      
      const tsContent = `${imports}\n\nexport const ${moduleName} = ${formattedJson};`;

      ensureDirectoryExistence(tsPath);
      fs.writeFile(tsPath, tsContent, "utf8", (err) => {
        if (err) {
          console.error(`❌ Error writing ${tsPath}:`, err);
        } else {
          console.log(`✅ Converted theme: ${tsPath}`);
        }
      });
    }
  }
}

/**
 * Convert a JSON file to TypeScript
 */
function convertJsonToTs(jsonPath) {
  const relativePath = path.relative(jsonDir, jsonPath);
  
  // Skip theme directory as it's handled separately
  if (relativePath.startsWith('theme')) return;
  
  const tsPath = path.join(tsDir, relativePath.replace(/\.json$/, ".ts"));
  const moduleName = path.basename(tsPath, ".ts").replace(/-/g, "_");

  fs.readFile(jsonPath, "utf8", (err, data) => {
    if (err) {
      console.error(`❌ Error reading ${jsonPath}:`, err);
      return;
    }

    try {
      let jsonData = JSON.parse(data);
      
      // For brand files, extract components
      if (relativePath.startsWith('brand')) {
        const { components, ...brandData } = jsonData;
        jsonData = brandData;
        
        // If there are components, create a separate file for them
        if (components) {
          const componentsPath = tsPath.replace('.ts', 'components.ts');
          const componentReferences = processTokenReferences(components);
          const componentImports = generateImports(componentReferences, componentsPath);
          const formattedComponents = formatJsonForTs(components);
          
          const componentsContent = `${componentImports}\n\nexport const ${moduleName}_components = ${formattedComponents};`;
          
          ensureDirectoryExistence(componentsPath);
          fs.writeFile(componentsPath, componentsContent, "utf8", (err) => {
            if (err) {
              console.error(`❌ Error writing ${componentsPath}:`, err);
            } else {
              console.log(`✅ Converted components: ${componentsPath}`);
            }
          });
        }
      }
      
      // Find all token references and generate imports
      const references = processTokenReferences(jsonData);
      const imports = generateImports(references, tsPath);
      
      const formattedJson = formatJsonForTs(jsonData);
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

/**
 * Convert all JSON files in directory
 */
function convertAllFiles(dir = jsonDir) {
  // First build the token definition map and discover brands
  buildTokenDefinitionMap();
  
  // Convert regular files
  fs.readdirSync(dir, { withFileTypes: true }).forEach(dirent => {
    const fullPath = path.join(dir, dirent.name);
    if (dirent.isDirectory()) {
      convertAllFiles(fullPath);
    } else if (dirent.isFile() && dirent.name.endsWith(".json")) {
      convertJsonToTs(fullPath);
    }
  });
  
  // Convert theme files after all other files
  convertThemeFiles();
}

// Start conversion
convertAllFiles();
console.log("👀 Watching JSON files in:", jsonDir);