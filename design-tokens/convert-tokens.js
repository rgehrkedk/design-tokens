// @ts-check
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { EventEmitter } from 'events';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Default configuration
const DEFAULT_CONFIG = {
  jsonDir: path.join(process.cwd(), 'json'),
  outputDir: path.join(process.cwd(), 'ts'),
  fileExtensions: {
    input: '.json',
    output: '.ts'
  },
  referencePatterns: [
    { pattern: /\{([^}]+)\}/, format: (token) => `{${token}}` },
    { pattern: /\$([^\/\s]+)/, format: (token) => `$${token}` }
  ],
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

// Utility functions
const utils = {
  async ensureDir(dir) {
    try {
      await fs.promises.mkdir(dir, { recursive: true });
    } catch (error) {
      console.error(`Failed to create directory ${dir}:`, error);
      throw error;
    }
  },

  async readJsonFile(filePath) {
    try {
      const content = await fs.promises.readFile(filePath, 'utf8');
      return JSON.parse(content);
    } catch (error) {
      console.error(`Failed to read/parse ${filePath}:`, error);
      throw error;
    }
  },

  async writeFile(filePath, content) {
    try {
      await utils.ensureDir(path.dirname(filePath));
      await fs.promises.writeFile(filePath, content, 'utf8');
      console.log(`Created: ${filePath}`);
    } catch (error) {
      console.error(`Failed to write ${filePath}:`, error);
      throw error;
    }
  }
};

// Token processor class
class TokenProcessor {
  constructor(config) {
    this.config = config;
    this.tokenCache = new Map();
  }

  async processTokens(tokens, filePath) {
    // Process references
    const processedTokens = this.processReferences(tokens);
    
    // Validate references
    if (this.config.validation.validateReferences) {
      this.validateReferences(processedTokens, filePath);
    }

    return processedTokens;
  }

  processReferences(tokens) {
    const processValue = (value) => {
      if (typeof value !== 'string') return value;

      for (const pattern of this.config.referencePatterns) {
        value = value.replace(pattern.pattern, (match, token) => {
          const resolvedToken = this.resolveTokenReference(tokens, token);
          return resolvedToken !== undefined ? resolvedToken : match;
        });
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
        if (typeof obj[key] === 'object' && obj[key] !== null) {
          this.traverseObject(obj[key], processor);
        } else {
          obj[key] = processor(obj[key]);
        }
      }
    }
  }

  resolveTokenReference(tokens, path) {
    const parts = path.split('.');
    let current = tokens;

    for (const part of parts) {
      if (current === undefined || current === null) return undefined;
      current = current[part];
    }

    return current;
  }

  validateReferences(tokens, filePath) {
    const references = new Set();
    JSON.stringify(tokens, (_, value) => {
      if (typeof value === 'string') {
        for (const pattern of this.config.referencePatterns) {
          const matches = value.match(pattern.pattern);
          if (matches) {
            references.add(matches[1]);
          }
        }
      }
      return value;
    });

    for (const ref of references) {
      const resolved = this.resolveTokenReference(tokens, ref);
      if (resolved === undefined) {
        console.warn(`Warning: Unresolved reference "${ref}" in ${filePath}`);
      }
    }
  }
}

// File processor class
class FileProcessor {
  constructor(config) {
    this.config = config;
    this.processor = new TokenProcessor(config);
  }

  async processFile(filePath) {
    try {
      const tokens = await utils.readJsonFile(filePath);
      const processedTokens = await this.processor.processTokens(tokens, filePath);
      
      const outputPath = this.getOutputPath(filePath);
      const outputContent = this.generateOutput(processedTokens, filePath);
      
      await utils.writeFile(outputPath, outputContent);
    } catch (error) {
      console.error(`Error processing ${filePath}:`, error);
      throw error;
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
}

// Main converter class
class TokenConverter {
  constructor(userConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...userConfig };
    this.fileProcessor = new FileProcessor(this.config);
    this.emitter = new EventEmitter();
    this.watcher = null;
  }

  async initialize() {
    // Only ensure output directory exists, since input directory should already exist
    await utils.ensureDir(this.config.outputDir);
  }

  async processDirectory(dir) {
    const entries = await fs.promises.readdir(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      
      if (entry.isDirectory()) {
        await this.processDirectory(fullPath);
      } else if (entry.isFile() && entry.name.endsWith(this.config.fileExtensions.input)) {
        await this.fileProcessor.processFile(fullPath);
      }
    }
  }

  async convert() {
    try {
      await this.initialize();
      
      // Process all files in the json directory and its subdirectories
      await this.processDirectory(this.config.jsonDir);

      if (this.config.watch.enabled) {
        this.startWatching();
      }
      
      console.log('Conversion completed successfully!');
    } catch (error) {
      console.error('Conversion failed:', error);
      throw error;
    }
  }

  startWatching() {
    console.log(`Watching for changes in ${this.config.jsonDir}...`);
    
    this.watcher = fs.watch(this.config.jsonDir, { recursive: true }, 
      async (eventType, filename) => {
        if (!filename.endsWith(this.config.fileExtensions.input)) return;
        
        const filePath = path.join(this.config.jsonDir, filename);
        console.log(`File ${filename} changed, processing...`);
        
        // Ensure the containing directory exists in the output
        const outputDir = path.dirname(this.fileProcessor.getOutputPath(filePath));
        await utils.ensureDir(outputDir);
        
        try {
          await this.fileProcessor.processFile(filePath);
        } catch (error) {
          console.error(`Error processing ${filename}:`, error);
        }
      }
    );
  }

  stop() {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
  }
}

// Create and run converter
const converter = new TokenConverter();
converter.convert().catch(error => {
  console.error('Failed to run converter:', error);
  process.exit(1);
});