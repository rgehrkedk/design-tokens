import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULT_CONFIG = {
  jsonDir: path.join(process.cwd(), 'json'),
  outputDir: path.join(process.cwd(), 'ts'),
  fileExtensions: {
    input: '.json',
    output: '.ts'
  }
};

// Token registry that handles hierarchical token resolution
class TokenRegistry {
  constructor() {
    this.tokens = new Map();
    this.references = new Map();
    this.resolvedTokens = new Map();
    this.dependencies = new Map();
    this.processingStack = new Set(); // For circular reference detection
    this.fileTokens = new Map(); // Maps files to their tokens
  }

  async buildRegistry(jsonDir) {
    // Load files in specific order
    await this.loadGlobalTokens(jsonDir);
    await this.loadBrandTokens(jsonDir);
    await this.loadThemeTokens(jsonDir);
    this.resolveAllReferences();
  }

  async loadGlobalTokens(jsonDir) {
    const globalsDir = path.join(jsonDir, 'globals');
    if (fs.existsSync(globalsDir)) {
      const files = await fs.promises.readdir(globalsDir);
      for (const file of files) {
        if (file.endsWith('.json')) {
          const filePath = path.join(globalsDir, file);
          const content = JSON.parse(await fs.promises.readFile(filePath, 'utf8'));
          this.fileTokens.set(filePath, content);
          this.registerTokens('globals', content, '', filePath);
        }
      }
    }
  }

  async loadBrandTokens(jsonDir) {
    const brandDir = path.join(jsonDir, 'brand');
    if (fs.existsSync(brandDir)) {
      const files = await fs.promises.readdir(brandDir);
      for (const file of files) {
        if (file.endsWith('.json')) {
          const content = JSON.parse(await fs.promises.readFile(path.join(brandDir, file), 'utf8'));
          const brandName = path.basename(file, '.json');
          this.registerTokens(`brand.${brandName}`, content);
        }
      }
    }
  }

  async loadThemeTokens(jsonDir) {
    const themeDir = path.join(jsonDir, 'theme');
    if (fs.existsSync(themeDir)) {
      const files = await fs.promises.readdir(themeDir);
      for (const file of files) {
        if (file.endsWith('.json')) {
          const content = JSON.parse(await fs.promises.readFile(path.join(themeDir, file), 'utf8'));
          const themeName = path.basename(file, '.json');
          this.registerTokens(`theme.${themeName}`, content);
        }
      }
    }
  }

  registerTokens(namespace, tokens, prefix = '', sourceFile = '') {
    for (const [key, value] of Object.entries(tokens)) {
      const fullKey = prefix ? `${prefix}.${key}` : key;
      
      if (typeof value === 'object' && value !== null) {
        if (value.value !== undefined) {
          const tokenKey = `${namespace}.${fullKey}`;
          this.tokens.set(tokenKey, { ...value, sourceFile });
          
          // Store reference if the value is a reference
          if (typeof value.value === 'string' && value.value.startsWith('{') && value.value.endsWith('}')) {
            const refKey = value.value.slice(1, -1);
            this.references.set(tokenKey, refKey);
            
            // Track dependencies
            if (!this.dependencies.has(sourceFile)) {
              this.dependencies.set(sourceFile, new Set());
            }
            this.dependencies.get(sourceFile).add(refKey);
          }
        } else {
          this.registerTokens(namespace, value, fullKey, sourceFile);
        }
      }
    }
  }

  resolveAllReferences() {
    // First pass: resolve global references
    for (const [tokenKey, reference] of this.references.entries()) {
      if (reference.startsWith('colors.') || reference.startsWith('numbers.') || reference.startsWith('typography.')) {
        this.resolveReference(tokenKey, `globals.${reference}`);
      }
    }

    // Second pass: resolve brand references
    for (const [tokenKey, reference] of this.references.entries()) {
      if (reference.startsWith('colors.brand.')) {
        const [brand] = tokenKey.split('.');
        this.resolveReference(tokenKey, `${brand}.${reference}`);
      }
    }

    // Third pass: resolve remaining references
    for (const [tokenKey, reference] of this.references.entries()) {
      if (!this.resolvedTokens.has(tokenKey)) {
        this.resolveReference(tokenKey, reference);
      }
    }
  }

  resolveReference(tokenKey, reference, stack = new Set()) {
    if (stack.has(tokenKey)) {
      console.error(`Circular reference detected: ${Array.from(stack).join(' -> ')} -> ${tokenKey}`);
      return this.tokens.get(tokenKey);
    }

    stack.add(tokenKey);

    const token = this.tokens.get(tokenKey);
    if (!token) return null;

    let value = token.value;
    if (typeof value === 'string' && value.startsWith('{') && value.endsWith('}')) {
      const ref = value.slice(1, -1);
      const resolvedToken = this.resolveReference(ref, ref, stack);
      if (resolvedToken) {
        value = resolvedToken.value;
        this.resolvedTokens.set(tokenKey, { ...token, value });
      }
    }

    stack.delete(tokenKey);
    return { ...token, value };
  }

  getResolvedToken(tokenKey) {
    return this.resolvedTokens.get(tokenKey) || this.tokens.get(tokenKey);
  }
}

class TokenProcessor {
  constructor(registry) {
    this.registry = registry;
  }

  processTokens(tokens, namespace) {
    const processValue = (value) => {
      if (typeof value !== 'string') return value;
      
      if (value.startsWith('{') && value.endsWith('}')) {
        const reference = value.slice(1, -1);
        const resolved = this.registry.getResolvedToken(`${namespace}.${reference}`);
        if (!resolved) {
          console.warn(`Warning: Unresolved reference "${reference}" in namespace "${namespace}"`);
          return value;
        }
        return resolved.value;
      }
      
      return value;
    };

    const processed = JSON.parse(JSON.stringify(tokens));
    this.traverseObject(processed, processValue);
    return processed;
  }

  traverseObject(obj, processor) {
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        const value = obj[key];
        if (typeof value === 'object' && value !== null) {
          if (value.value !== undefined) {
            obj[key].value = processor(value.value);
          } else {
            this.traverseObject(value, processor);
          }
        }
      }
    }
  }
}

class FileProcessor {
  constructor(config, registry) {
    this.config = config;
    this.registry = registry;
    this.processor = new TokenProcessor(registry);
    this.importMap = new Map();
  }

  addImport(fromFile, toFile, importName) {
    if (!this.importMap.has(fromFile)) {
      this.importMap.set(fromFile, new Map());
    }
    const fileImports = this.importMap.get(fromFile);
    if (!fileImports.has(toFile)) {
      fileImports.set(toFile, new Set());
    }
    fileImports.get(toFile).add(importName);
  }

  async processFile(filePath) {
    try {
      const content = await fs.promises.readFile(filePath, 'utf8');
      const tokens = JSON.parse(content);
      
      const relativePath = path.relative(this.config.jsonDir, filePath);
      const namespace = path.dirname(relativePath) === '.' ? 'globals' : path.dirname(relativePath);
      
      const processedTokens = this.processor.processTokens(tokens, namespace);
      const outputPath = this.getOutputPath(filePath);
      const outputContent = this.generateOutput(processedTokens, filePath);
      
      await this.writeOutput(outputPath, outputContent);
    } catch (error) {
      console.error(`Error processing ${filePath}:`, error);
    }
  }

  getOutputPath(filePath) {
    const relativePath = path.relative(this.config.jsonDir, filePath);
    return path.join(
      this.config.outputDir,
      relativePath.replace(
        this.config.fileExtensions.input,
        this.config.fileExtensions.output
      )
    );
  }

  generateOutput(tokens, filePath) {
    const moduleName = path.basename(filePath, this.config.fileExtensions.input)
      .replace(/[^a-zA-Z0-9_]/g, '_');
    
    // Get dependencies for this file
    const dependencies = this.registry.dependencies.get(filePath) || new Set();
    const imports = new Set();
    
    // Generate imports
    for (const dep of dependencies) {
      const [category, ...rest] = dep.split('.');
      const importPath = category === 'colors' ? 'globals/colors' :
                        category === 'numbers' ? 'globals/numbers' :
                        category === 'typography' ? 'globals/typography' :
                        null;
      
      if (importPath) {
        const relativePath = path.relative(
          path.dirname(this.getOutputPath(filePath)),
          path.join(this.config.outputDir, importPath)
        ).replace(/\\/g, '/');
        
        imports.add(`import { ${category} } from '${relativePath.startsWith('.') ? relativePath : './' + relativePath}';`);
      }
    }
    
    const importStatements = Array.from(imports).join('\n');
    
    return `// Generated from ${path.relative(process.cwd(), filePath)}
// Do not edit directly

${importStatements ? importStatements + '\n\n' : ''}export const ${moduleName} = ${JSON.stringify(tokens, null, 2)};
`;
  }

  async writeOutput(outputPath, content) {
    try {
      await fs.promises.mkdir(path.dirname(outputPath), { recursive: true });
      await fs.promises.writeFile(outputPath, content, 'utf8');
      console.log(`Created: ${outputPath}`);
    } catch (error) {
      console.error(`Error writing ${outputPath}:`, error);
    }
  }
}

class TokenConverter {
  constructor(userConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...userConfig };
    this.registry = new TokenRegistry();
  }

  async convert() {
    console.log('Building token registry...');
    await this.registry.buildRegistry(this.config.jsonDir);
    
    console.log('Processing token files...');
    const fileProcessor = new FileProcessor(this.config, this.registry);
    
    const processDirectory = async (dir) => {
      const entries = await fs.promises.readdir(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        
        if (entry.isDirectory()) {
          await processDirectory(fullPath);
        } else if (entry.isFile() && entry.name.endsWith(this.config.fileExtensions.input)) {
          await fileProcessor.processFile(fullPath);
        }
      }
    };
    
    try {
      await processDirectory(this.config.jsonDir);
      console.log('Conversion completed successfully!');
    } catch (error) {
      console.error('Conversion failed:', error);
      throw error;
    }
  }
}

// Create and run converter
const converter = new TokenConverter();
converter.convert().catch(error => {
  console.error('Failed to run converter:', error);
  process.exit(1);
});