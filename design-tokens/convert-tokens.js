import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { EventEmitter } from 'events';

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

// Global token registry to store all tokens
class TokenRegistry {
  constructor() {
    this.tokens = new Map();
    this.aliasMap = new Map();
  }

  async buildRegistry(jsonDir) {
    // First pass: Load all tokens
    await this.loadAllTokens(jsonDir);
    // Second pass: Build alias map
    this.buildAliasMap();
  }

  async loadAllTokens(dir) {
    const entries = await fs.promises.readdir(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      
      if (entry.isDirectory()) {
        await this.loadAllTokens(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.json')) {
        const content = JSON.parse(await fs.promises.readFile(fullPath, 'utf8'));
        const relativePath = path.relative(DEFAULT_CONFIG.jsonDir, fullPath);
        const namespace = path.dirname(relativePath) === '.' ? 'globals' : path.dirname(relativePath);
        
        this.registerTokens(namespace, content);
      }
    }
  }

  registerTokens(namespace, tokens, prefix = '') {
    for (const [key, value] of Object.entries(tokens)) {
      const fullKey = prefix ? `${prefix}.${key}` : key;
      
      if (typeof value === 'object' && value !== null && !value.value) {
        this.registerTokens(namespace, value, fullKey);
      } else {
        const tokenKey = `${namespace}.${fullKey}`;
        this.tokens.set(tokenKey, value);
      }
    }
  }

  buildAliasMap() {
    for (const [key, value] of this.tokens.entries()) {
      if (typeof value === 'object' && value.value) {
        const aliasValue = value.value;
        if (typeof aliasValue === 'string' && aliasValue.startsWith('{') && aliasValue.endsWith('}')) {
          const reference = aliasValue.slice(1, -1);
          this.aliasMap.set(key, reference);
        }
      }
    }
  }

  resolveReference(reference) {
    // Handle direct references
    let value = this.tokens.get(reference);
    if (value && typeof value === 'object' && value.value) {
      value = value.value;
    }
    
    // Handle aliases
    if (typeof value === 'string' && value.startsWith('{') && value.endsWith('}')) {
      const nestedRef = value.slice(1, -1);
      return this.resolveReference(nestedRef);
    }
    
    return value;
  }
}

class TokenProcessor {
  constructor(registry) {
    this.registry = registry;
  }

  processTokens(tokens, filePath) {
    const processValue = (value) => {
      if (typeof value !== 'string') return value;
      
      if (value.startsWith('{') && value.endsWith('}')) {
        const reference = value.slice(1, -1);
        const resolved = this.registry.resolveReference(reference);
        if (resolved === undefined) {
          console.warn(`Warning: Unresolved reference "${reference}" in ${filePath}`);
          return value;
        }
        return resolved;
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
  }

  async processFile(filePath) {
    try {
      const content = await fs.promises.readFile(filePath, 'utf8');
      const tokens = JSON.parse(content);
      const processedTokens = this.processor.processTokens(tokens, filePath);
      
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
      
    return `// Generated from ${path.relative(process.cwd(), filePath)}
// Do not edit directly

export const ${moduleName} = ${JSON.stringify(tokens, null, 2)};
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