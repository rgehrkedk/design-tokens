import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration and cache
const CONFIG = {
  jsonDir: path.join(__dirname, "json"),
  tsDir: path.join(__dirname, "ts"),
  fileExtensions: {
    json: '.json',
    ts: '.ts'
  }
};

const cache = {
  tokenDefinitions: new Map(),
  brands: new Set(),
  processedPaths: new Set()
};

// Utility functions
const utils = {
  ensureDir: (filePath) => {
    const dirname = path.dirname(filePath);
    if (!fs.existsSync(dirname)) {
      fs.mkdirSync(dirname, { recursive: true });
    }
  },

  readJsonFile: (filePath) => {
    try {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (error) {
      console.error(`❌ Error reading/parsing ${filePath}:`, error);
      return null;
    }
  },

  writeFile: async (filePath, content) => {
    try {
      utils.ensureDir(filePath);
      await fs.promises.writeFile(filePath, content, 'utf8');
      console.log(`✅ Created: ${filePath}`);
    } catch (error) {
      console.error(`❌ Error writing ${filePath}:`, error);
    }
  },

  getModuleName: (filePath) => 
    path.basename(filePath, CONFIG.fileExtensions.json).replace(/-/g, '_'),

  formatTsContent: (imports, moduleName, jsonContent) => 
    `${imports}\n\nexport const ${moduleName} = ${jsonContent};`
};

// Token Processor class for handling token references and formatting
class TokenProcessor {
  static findReferences(obj, excludeTheme = false) {
    const references = new Set();
    
    JSON.stringify(obj, (_, value) => {
      if (typeof value === 'string' && value.startsWith('{') && value.endsWith('}')) {
        const token = value.slice(1, -1).split('.')[0];
        const definition = cache.tokenDefinitions.get(token);
        if (definition && (!excludeTheme || !definition.isTheme)) {
          references.add(definition);
        }
      }
      return value;
    });
    
    return Array.from(references);
  }

  static formatJson(obj) {
    return JSON.stringify(obj, null, 2)
      .replace(/"([^"]+)":/g, (_, p1) => 
        p1.includes('-') ? `'${p1}':` : `${p1}:`)
      .replace(/"\{([^}]+)\}"/g, (_, p1) => {
        const parts = p1.split('.');
        const token = parts[0];
        const definition = cache.tokenDefinitions.get(token);
        
        if (definition) {
          const prefix = `${definition.module}.`;
          return parts.length === 2 
            ? `${prefix}${token}['${parts[1]}']`
            : `${prefix}${token}.${parts[1]}${parts.slice(2).map(p => `['${p}']`).join('')}`;
        }
        return `{${p1}}`;
      })
      .replace(/"([^"]+)"/g, "'$1'");
  }

  static generateImports(references, currentPath) {
    return Array.from(new Set(
      references.map(ref => {
        const relativePath = path.relative(
          path.dirname(currentPath),
          path.join(CONFIG.tsDir, ref.path)
        );
        const importPath = relativePath.startsWith('.') ? relativePath : './' + relativePath;
        return `import { ${ref.module} } from '${importPath}/${ref.module}';`;
      })
    )).join('\n');
  }
}

// File Processing class
class FileProcessor {
  static async processRegularFile(jsonPath) {
    const content = utils.readJsonFile(jsonPath);
    if (!content) return;

    const relativePath = path.relative(CONFIG.jsonDir, jsonPath);
    if (relativePath.startsWith('theme')) return;

    const tsPath = path.join(CONFIG.tsDir, relativePath.replace(/\.json$/, ".ts"));
    const moduleName = utils.getModuleName(jsonPath);

    if (relativePath.startsWith('brand')) {
      await FileProcessor.processBrandFile(jsonPath, content, tsPath, moduleName);
      return;
    }

    const references = TokenProcessor.findReferences(content);
    const imports = TokenProcessor.generateImports(references, tsPath);
    const formattedJson = TokenProcessor.formatJson(content);
    
    await utils.writeFile(
      tsPath, 
      utils.formatTsContent(imports, moduleName, formattedJson)
    );
  }

  static async processBrandFile(jsonPath, content, tsPath, moduleName) {
    const { components, ...brandData } = content;

    // Process main brand file
    const references = TokenProcessor.findReferences(brandData);
    const imports = TokenProcessor.generateImports(references, tsPath);
    const formattedJson = TokenProcessor.formatJson(brandData);
    
    await utils.writeFile(
      tsPath,
      utils.formatTsContent(imports, moduleName, formattedJson)
    );

    if (components) {
      const componentsPath = tsPath.replace('.ts', 'components.ts');
      const componentRefs = TokenProcessor.findReferences(components);
      const componentImports = TokenProcessor.generateImports(componentRefs, componentsPath);
      const formattedComponents = TokenProcessor.formatJson(components);
      
      const themeImports = `import { ${moduleName}_light } from '../theme/${moduleName}_light';\nimport { ${moduleName}_dark } from '../theme/${moduleName}_dark';`;
      const combinedImports = componentImports ? `${themeImports}\n${componentImports}` : themeImports;
      
      await utils.writeFile(
        componentsPath,
        utils.formatTsContent(combinedImports, `${moduleName}_components`, formattedComponents)
      );
    }
  }

  static async processThemeFiles() {
    const themeDir = path.join(CONFIG.jsonDir, 'theme');
    if (!fs.existsSync(themeDir)) return;

    const themeFiles = fs.readdirSync(themeDir)
      .filter(f => f.endsWith('.json'));

    for (const themeFile of themeFiles) {
      const themeName = path.basename(themeFile, '.json');
      const content = utils.readJsonFile(path.join(themeDir, themeFile));
      if (!content) continue;

      await Promise.all(Array.from(cache.brands).map(async brand => {
        const tsPath = path.join(CONFIG.tsDir, 'theme', `${brand}_${themeName}.ts`);
        const references = TokenProcessor.findReferences(content, true);
        const imports = TokenProcessor.generateImports(references, tsPath);
        const formattedJson = TokenProcessor.formatJson(content);
        const moduleName = `${brand}_${themeName}`;

        await utils.writeFile(
          tsPath,
          utils.formatTsContent(imports, moduleName, formattedJson)
        );
      }));
    }
  }
}

// Scanner for building token definitions
class TokenScanner {
  static scan(dir = CONFIG.jsonDir) {
    if (!fs.existsSync(dir)) {
      console.error(`❌ Directory not found: ${dir}`);
      fs.mkdirSync(dir, { recursive: true });
      return;
    }

    const files = fs.readdirSync(dir, { withFileTypes: true });
    
    for (const file of files) {
      const fullPath = path.join(dir, file.name);
      const relativePath = path.relative(CONFIG.jsonDir, dir);
      
      if (file.isDirectory()) {
        TokenScanner.scan(fullPath);
      } else if (file.name.endsWith('.json')) {
        TokenScanner.processFile(fullPath, relativePath, file.name);
      }
    }
  }

  static processFile(fullPath, relativePath, fileName) {
    if (relativePath === 'brand') {
      cache.brands.add(path.basename(fileName, '.json'));
    }

    const content = utils.readJsonFile(fullPath);
    if (!content) return;

    const moduleName = utils.getModuleName(fileName);
    const keys = new Set(
      Object.keys(content).filter(key => 
        !(relativePath === 'brand' && key === 'components')
      )
    );
    
    keys.forEach(key => {
      cache.tokenDefinitions.set(key, {
        path: relativePath,
        module: moduleName,
        isGlobal: relativePath.startsWith('globals'),
        isTheme: relativePath === 'theme'
      });
    });
  }
}

// Main conversion function
async function convertFiles() {
  console.log("🔍 Starting conversion process...");
  console.log(`📁 Looking for JSON files in: ${CONFIG.jsonDir}`);
  
  // Create output directory if it doesn't exist
  if (!fs.existsSync(CONFIG.tsDir)) {
    fs.mkdirSync(CONFIG.tsDir, { recursive: true });
  }
  
  // Build token definitions
  TokenScanner.scan();
  
  // Process all files
  const processFiles = async (dir = CONFIG.jsonDir) => {
    if (!fs.existsSync(dir)) return;
    
    const files = fs.readdirSync(dir, { withFileTypes: true });
    
    await Promise.all(files.map(async file => {
      const fullPath = path.join(dir, file.name);
      
      if (file.isDirectory()) {
        await processFiles(fullPath);
      } else if (file.name.endsWith('.json')) {
        await FileProcessor.processRegularFile(fullPath);
      }
    }));
  };

  await processFiles();
  await FileProcessor.processThemeFiles();
  
  console.log("✨ Conversion complete!");
}

// Start conversion
convertFiles().catch(console.error);
console.log("👀 Watching JSON files in:", CONFIG.jsonDir);