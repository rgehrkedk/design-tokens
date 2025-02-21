import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { EventEmitter } from 'events';
import { Worker } from 'worker_threads';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Default configuration with all options
const DEFAULT_CONFIG = {
  jsonDir: path.join(__dirname, 'json'),
  outputDir: path.join(__dirname, 'ts'),
  fileExtensions: {
    input: '.json',
    output: '.ts'
  },
  referencePatterns: [
    { pattern: /\{([^}]+)\}/, format: (token) => `{${token}}` },
    { pattern: /\$([^\/\s]+)/, format: (token) => `$${token}` }
  ],
  processors: {
    pre: [],
    post: []
  },
  validation: {
    checkCircularDeps: true,
    validateReferences: true,
    requireFallbacks: false
  },
  cache: {
    enabled: true,
    directory: '.token-cache'
  },
  watch: {
    enabled: false,
    debounceMs: 100
  }
};

// Cache manager for token definitions and processing results
class CacheManager {
  constructor(config) {
    this.config = config;
    this.tokenCache = new Map();
    this.fileCache = new Map();
    this.referenceCache = new Map();
    this.cacheDir = path.join(process.cwd(), config.cache.directory);
    
    if (config.cache.enabled) {
      this.initializeCache();
    }
  }

  initializeCache() {
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
    }
    this.loadCacheFromDisk();
  }

  loadCacheFromDisk() {
    try {
      const cacheFile = path.join(this.cacheDir, 'token-cache.json');
      if (fs.existsSync(cacheFile)) {
        const cache = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
        this.tokenCache = new Map(cache.tokens);
        this.referenceCache = new Map(cache.references);
      }
    } catch (error) {
      console.warn('Failed to load cache from disk:', error);
    }
  }

  saveCache() {
    if (!this.config.cache.enabled) return;
    
    try {
      const cacheFile = path.join(this.cacheDir, 'token-cache.json');
      const cache = {
        tokens: Array.from(this.tokenCache.entries()),
        references: Array.from(this.referenceCache.entries())
      };
      fs.writeFileSync(cacheFile, JSON.stringify(cache, null, 2));
    } catch (error) {
      console.warn('Failed to save cache to disk:', error);
    }
  }

  getCachedToken(key) {
    return this.tokenCache.get(key);
  }

  setCachedToken(key, value) {
    this.tokenCache.set(key, value);
    this.saveCache();
  }

  invalidateCache(filePath) {
    const key = this.getCacheKey(filePath);
    this.tokenCache.delete(key);
    this.referenceCache.delete(key);
    this.saveCache();
  }

  getCacheKey(filePath) {
    return path.relative(this.config.jsonDir, filePath);
  }
}

// Token validator for checking references and dependencies
class TokenValidator {
  constructor(config) {
    this.config = config;
    this.errors = [];
    this.warnings = [];
  }

  validateTokens(tokens, filePath) {
    this.errors = [];
    this.warnings = [];
    
    if (this.config.validation.checkCircularDeps) {
      this.checkCircularDependencies(tokens, filePath);
    }
    
    if (this.config.validation.validateReferences) {
      this.validateReferences(tokens, filePath);
    }
    
    return {
      isValid: this.errors.length === 0,
      errors: this.errors,
      warnings: this.warnings
    };
  }

  checkCircularDependencies(tokens, filePath, visited = new Set()) {
    const references = this.findReferences(tokens);
    
    for (const ref of references) {
      if (visited.has(ref.path)) {
        this.errors.push({
          type: 'CircularDependency',
          message: `Circular dependency detected: ${Array.from(visited).join(' -> ')} -> ${ref.path}`,
          file: filePath
        });
        return;
      }
      
      visited.add(ref.path);
      const referencedToken = this.getReferencedToken(ref.path);
      if (referencedToken) {
        this.checkCircularDependencies(referencedToken, filePath, new Set(visited));
      }
      visited.delete(ref.path);
    }
  }

  validateReferences(tokens, filePath) {
    const references = this.findReferences(tokens);
    
    for (const ref of references) {
      const referencedToken = this.getReferencedToken(ref.path);
      
      if (!referencedToken) {
        this.errors.push({
          type: 'InvalidReference',
          message: `Invalid token reference: ${ref.path}`,
          file: filePath
        });
      }
      
      if (this.config.validation.requireFallbacks && !ref.fallback) {
        this.warnings.push({
          type: 'MissingFallback',
          message: `Missing fallback value for reference: ${ref.path}`,
          file: filePath
        });
      }
    }
  }

  findReferences(tokens) {
    const references = new Set();
    
    JSON.stringify(tokens, (_, value) => {
      if (typeof value === 'string') {
        for (const pattern of this.config.referencePatterns) {
          const matches = value.match(pattern.pattern);
          if (matches) {
            references.add({
              path: matches[1],
              pattern: pattern.format,
              value: value
            });
          }
        }
      }
      return value;
    });
    
    return Array.from(references);
  }

  getReferencedToken(path) {
    // Implementation to get referenced token
    // This would need to be connected to the token registry
    return null;
  }
}

// Token processor for handling references and transformations
class TokenProcessor {
  constructor(config, validator, cache) {
    this.config = config;
    this.validator = validator;
    this.cache = cache;
    this.processors = {
      pre: [...(config.processors.pre || [])],
      post: [...(config.processors.post || [])]
    };
  }

  async processTokens(tokens, filePath) {
    const cacheKey = this.cache.getCacheKey(filePath);
    const cachedResult = this.cache.getCachedToken(cacheKey);
    
    if (cachedResult) {
      return cachedResult;
    }

    // Run pre-processors
    let processedTokens = tokens;
    for (const processor of this.processors.pre) {
      processedTokens = await processor(processedTokens, filePath);
    }

    // Validate tokens
    const validationResult = this.validator.validateTokens(processedTokens, filePath);
    if (!validationResult.isValid) {
      throw new Error(`Token validation failed: ${JSON.stringify(validationResult.errors)}`);
    }

    // Process references
    processedTokens = this.processReferences(processedTokens);

    // Run post-processors
    for (const processor of this.processors.post) {
      processedTokens = await processor(processedTokens, filePath);
    }

    // Cache result
    this.cache.setCachedToken(cacheKey, processedTokens);

    return processedTokens;
  }

  processReferences(tokens) {
    const processValue = (value) => {
      if (typeof value !== 'string') return value;

      for (const pattern of this.config.referencePatterns) {
        value = value.replace(pattern.pattern, (match, token) => {
          const resolvedToken = this.resolveTokenReference(token);
          return resolvedToken !== undefined ? resolvedToken : match;
        });
      }

      return value;
    };

    return JSON.parse(
      JSON.stringify(tokens, (key, value) => {
        if (Array.isArray(value)) {
          return value.map(processValue);
        }
        return processValue(value);
      })
    );
  }

  resolveTokenReference(tokenPath) {
    const parts = tokenPath.split('.');
    let current = this.cache.getCachedToken(parts[0]);

    for (let i = 1; i < parts.length && current !== undefined; i++) {
      current = current[parts[i]];
    }

    return current;
  }
}

// File manager for handling file operations
class FileManager {
  constructor(config) {
    this.config = config;
    this.watcher = null;
    this.emitter = new EventEmitter();
  }

  async readFile(filePath) {
    try {
      const content = await fs.promises.readFile(filePath, 'utf8');
      return JSON.parse(content);
    } catch (error) {
      throw new Error(`Failed to read file ${filePath}: ${error.message}`);
    }
  }

  async writeFile(filePath, content) {
    try {
      const dir = path.dirname(filePath);
      await fs.promises.mkdir(dir, { recursive: true });
      await fs.promises.writeFile(filePath, content, 'utf8');
    } catch (error) {
      throw new Error(`Failed to write file ${filePath}: ${error.message}`);
    }
  }

  async processDirectory(dir = this.config.jsonDir) {
    const entries = await fs.promises.readdir(dir, { withFileTypes: true });
    
    const tasks = entries.map(async (entry) => {
      const fullPath = path.join(dir, entry.name);
      
      if (entry.isDirectory()) {
        return this.processDirectory(fullPath);
      }
      
      if (entry.isFile() && entry.name.endsWith(this.config.fileExtensions.input)) {
        return this.processFile(fullPath);
      }
    });

    await Promise.all(tasks);
  }

  async processFile(filePath) {
    const tokens = await this.readFile(filePath);
    const processor = new TokenProcessor(this.config, new TokenValidator(this.config), new CacheManager(this.config));
    const processedTokens = await processor.processTokens(tokens, filePath);
    
    const outputPath = this.getOutputPath(filePath);
    const outputContent = this.generateOutput(processedTokens, filePath);
    await this.writeFile(outputPath, outputContent);
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

  startWatching() {
    if (!this.config.watch.enabled) return;

    const watcher = fs.watch(this.config.jsonDir, { recursive: true });
    let timeout;

    watcher.on('change', (eventType, filename) => {
      if (timeout) clearTimeout(timeout);
      
      timeout = setTimeout(() => {
        const filePath = path.join(this.config.jsonDir, filename);
        this.processFile(filePath).catch(console.error);
      }, this.config.watch.debounceMs);
    });

    this.watcher = watcher;
  }

  stopWatching() {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
  }
}

// Main converter class
class TokenConverter {
  constructor(userConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...userConfig };
    this.fileManager = new FileManager(this.config);
    this.cache = new CacheManager(this.config);
  }

  async convert() {
    console.log('Starting token conversion...');
    
    try {
      await this.fileManager.processDirectory();
      
      if (this.config.watch.enabled) {
        console.log('Watching for changes...');
        this.fileManager.startWatching();
      }
      
      console.log('Token conversion completed successfully!');
    } catch (error) {
      console.error('Token conversion failed:', error);
      throw error;
    }
  }

  stop() {
    this.fileManager.stopWatching();
    this.cache.saveCache();
  }
}

// Export the converter
export default TokenConverter;

// Example usage:
const converter = new TokenConverter({
  jsonDir: './tokens',
  outputDir: './dist',
  watch: {
    enabled: true,
    debounceMs: 300
  }
});

converter.convert().catch(console.error);