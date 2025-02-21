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

class TokenRegistry {
  constructor() {
    this.globalTokens = new Map();
    this.brandTokens = new Map();
    this.themeTokens = new Map();
    this.dependencies = new Map();
  }

  async initialize(jsonDir) {
    // Load tokens in correct order
    await this.loadGlobalTokens(jsonDir);
    await this.loadBrandTokens(jsonDir);
    await this.loadThemeTokens(jsonDir);
  }

  async loadGlobalTokens(jsonDir) {
    const globalsDir = path.join(jsonDir, 'globals');
    if (fs.existsSync(globalsDir)) {
      const files = await fs.promises.readdir(globalsDir);
      for (const file of files) {
        if (file.endsWith('.json')) {
          const filePath = path.join(globalsDir, file);
          const content = JSON.parse(await fs.promises.readFile(filePath, 'utf8'));
          const category = path.basename(file, '.json');
          this.globalTokens.set(category, { content, filePath });
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
          const filePath = path.join(brandDir, file);
          const content = JSON.parse(await fs.promises.readFile(filePath, 'utf8'));
          const brandName = path.basename(file, '.json');
          this.brandTokens.set(brandName, { content, filePath });
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
          const filePath = path.join(themeDir, file);
          const content = JSON.parse(await fs.promises.readFile(filePath, 'utf8'));
          const themeName = path.basename(file, '.json');
          this.themeTokens.set(themeName, { content, filePath });
        }
      }
    }
  }

  findReferences(obj, currentPath = []) {
    const references = new Set();
    
    const traverse = (value, path = []) => {
      if (typeof value === 'object' && value !== null) {
        if (value.value && typeof value.value === 'string' && value.value.startsWith('{') && value.value.endsWith('}')) {
          const ref = value.value.slice(1, -1);
          references.add(ref);
        }
        for (const [key, val] of Object.entries(value)) {
          traverse(val, [...path, key]);
        }
      }
    };

    traverse(obj);
    return references;
  }

  getReferencePath(ref) {
    const [category, ...rest] = ref.split('.');
    
    if (this.globalTokens.has(category)) {
      return {
        type: 'global',
        category,
        path: rest.join('.')
      };
    }

    // Handle brand-specific references
    if (category === 'colors' && rest[0] === 'brand') {
      return {
        type: 'brand',
        category: 'colors',
        path: rest.join('.')
      };
    }

    return null;
  }

  resolveDependencies(filePath, content) {
    const references = this.findReferences(content);
    const deps = {
      globals: new Set(),
      brands: new Set(),
      themes: new Set()
    };

    for (const ref of references) {
      const refPath = this.getReferencePath(ref);
      if (refPath) {
        if (refPath.type === 'global') {
          deps.globals.add(refPath.category);
        } else if (refPath.type === 'brand') {
          deps.brands.add(refPath.category);
        }
      }
    }

    this.dependencies.set(filePath, deps);
    return deps;
  }

  generateImports(filePath, deps) {
    const imports = [];
    const relativePath = (targetPath) => {
      return path.relative(
        path.dirname(filePath.replace('json', 'ts')),
        targetPath
      ).replace(/\\/g, '/');
    };

    // Add global imports
    for (const category of deps.globals) {
      const importPath = relativePath(path.join(DEFAULT_CONFIG.outputDir, 'globals', category));
      imports.push(`import { ${category} } from '${importPath.startsWith('.') ? importPath : './' + importPath}';`);
    }

    return imports.join('\n');
  }
}

class FileProcessor {
  constructor(config, registry) {
    this.config = config;
    this.registry = registry;
  }

  async processFile(filePath) {
    try {
      const content = JSON.parse(await fs.promises.readFile(filePath, 'utf8'));
      const deps = this.registry.resolveDependencies(filePath, content);
      const imports = this.registry.generateImports(filePath, deps);
      
      const outputPath = this.getOutputPath(filePath);
      const outputContent = this.generateOutput(content, filePath, imports);
      
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

  generateOutput(content, filePath, imports) {
    const moduleName = path.basename(filePath, this.config.fileExtensions.input)
      .replace(/[^a-zA-Z0-9_]/g, '_');
    
    return `// Generated from ${path.relative(process.cwd(), filePath)}
// Do not edit directly

${imports ? imports + '\n\n' : ''}export const ${moduleName} = ${JSON.stringify(content, null, 2)};
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
    await this.registry.initialize(this.config.jsonDir);
    
    console.log('Processing token files...');
    const fileProcessor = new FileProcessor(this.config, this.registry);
    
    // Process global tokens
    for (const [category, { filePath }] of this.registry.globalTokens) {
      await fileProcessor.processFile(filePath);
    }

    // Process brand tokens
    for (const [brand, { filePath }] of this.registry.brandTokens) {
      await fileProcessor.processFile(filePath);
    }

    // Process theme tokens
    for (const [theme, { filePath }] of this.registry.themeTokens) {
      await fileProcessor.processFile(filePath);
    }
    
    console.log('Conversion completed successfully!');
  }
}

// Create and run converter
const converter = new TokenConverter();
converter.convert().catch(error => {
  console.error('Failed to run converter:', error);
  process.exit(1);
});