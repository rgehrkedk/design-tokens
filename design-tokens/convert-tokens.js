import { readFile, readdir, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join, dirname, relative, basename } from 'path';
import { fileURLToPath } from 'url';

// Token Registry for managing definitions and dependencies
class TokenRegistry {
  constructor() {
    this.definitions = new Map();
    this.brands = new Set();
  }

  addDefinition(key, path, module, isGlobal, isTheme) {
    this.definitions.set(key, {
      path,
      module,
      isGlobal,
      isTheme,
      dependencies: new Set()
    });
  }

  addBrand(brand) {
    this.brands.add(brand);
  }

  getDefinition(key) {
    return this.definitions.get(key);
  }

  getBrands() {
    return this.brands;
  }

  addDependency(from, to) {
    const def = this.definitions.get(from);
    if (def) {
      def.dependencies.add(to);
    }
  }
}

// Token Processor handles the conversion logic
class TokenProcessor {
  constructor(config) {
    this.registry = new TokenRegistry();
    this.config = config;
  }

  formatModuleName(name) {
    return name.replace(/[-\.]/g, '_').toLowerCase();
  }

  async ensureDirectory(path) {
    if (!existsSync(dirname(path))) {
      await mkdir(dirname(path), { recursive: true });
    }
  }

  resolveReferences(content) {
    const references = new Set();
    
    JSON.stringify(content, (_, value) => {
      if (typeof value === 'string' && 
          value.startsWith('{') && 
          value.endsWith('}')) {
        const token = value.slice(1, -1).split('.')[0];
        const def = this.registry.getDefinition(token);
        if (def) {
          references.add(token);
        }
      }
      return value;
    });

    return references;
  }

  generateImports(references, currentPath) {
    const imports = new Set();

    for (const ref of references) {
      const def = this.registry.getDefinition(ref);
      if (!def) continue;

      const relativePath = relative(
        dirname(currentPath),
        join(this.config.outDir, def.path)
      );

      const importPath = relativePath.startsWith('.') 
        ? relativePath 
        : './' + relativePath;

      imports.add(
        `import { ${def.module} } from '${importPath}/${def.module}';`
      );
    }

    return Array.from(imports);
  }

  async scanTokens(dir = this.config.rootDir) {
    const entries = await readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      const relativePath = relative(this.config.rootDir, dir);

      if (entry.isDirectory()) {
        await this.scanTokens(fullPath);
        continue;
      }

      if (!entry.name.endsWith(this.config.extensions.source)) continue;

      // Handle brand files
      if (relativePath === 'brand') {
        this.registry.addBrand(
          basename(entry.name, this.config.extensions.source)
        );
      }

      const content = await this.loadJson(fullPath);
      if (!content) continue;

      const moduleName = this.formatModuleName(entry.name);
      
      // Register token definitions
      Object.keys(content)
        .filter(key => !(relativePath === 'brand' && key === 'components'))
        .forEach(key => {
          this.registry.addDefinition(
            key,
            relativePath,
            moduleName,
            relativePath.startsWith('globals'),
            relativePath === 'theme'
          );
        });
    }
  }

  async loadJson(path) {
    try {
      const content = await readFile(path, 'utf8');
      return JSON.parse(content);
    } catch (error) {
      console.error(`Error loading ${path}:`, error);
      return null;
    }
  }

  async processToken(content, excludeTheme = false) {
    const references = this.resolveReferences(content);
    
    if (excludeTheme) {
      for (const ref of references) {
        const def = this.registry.getDefinition(ref);
        if (def?.isTheme) {
          references.delete(ref);
        }
      }
    }

    return {
      content,
      imports: references
    };
  }

  async writeTokenFile(path, content, imports) {
    console.log(`Writing token file: ${path}`);
    const moduleName = this.formatModuleName(
      basename(path, this.config.extensions.output)
    );

    const importStatements = this.generateImports(imports, path).join('\n');
    const formattedContent = JSON.stringify(content, null, 2)
      .replace(/"([^"]+)":/g, (_, key) => 
        key.includes('-') ? `'${key}':` : `${key}:`)
      .replace(/"\{([^}]+)\}"/g, (_, ref) => {
        const parts = ref.split('.');
        const def = this.registry.getDefinition(parts[0]);
        
        if (!def) return `{${ref}}`;

        return parts.length === 2
          ? `${def.module}.${parts[0]}['${parts[1]}']`
          : `${def.module}.${parts[0]}.${parts[1]}${
              parts.slice(2).map(p => `['${p}']`).join('')
            }`;
      });

    const output = `${importStatements}\n\nexport const ${moduleName} = ${formattedContent};\n`;

    await this.ensureDirectory(path);
    await writeFile(path, output);
  }

  async convert() {
    console.log('Starting token conversion...');
    console.log(`Looking for tokens in: ${this.config.rootDir}`);
    
    await this.scanTokens();

    const processDirectory = async (dir = this.config.rootDir) => {
      const entries = await readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const sourcePath = join(dir, entry.name);
        
        if (entry.isDirectory()) {
          await processDirectory(sourcePath);
          continue;
        }

        if (!entry.name.endsWith(this.config.extensions.source)) continue;

        const content = await this.loadJson(sourcePath);
        if (!content) continue;

        const relativePath = relative(this.config.rootDir, dir);
        const outputPath = join(
          this.config.outDir,
          relativePath,
          entry.name.replace(
            this.config.extensions.source,
            this.config.extensions.output
          )
        );

        // Process theme files
        if (relativePath === 'theme') {
          for (const brand of this.registry.getBrands()) {
            const processed = await this.processToken(content, true);
            await this.writeTokenFile(
              outputPath.replace(
                this.config.extensions.output,
                `_${brand}${this.config.extensions.output}`
              ),
              processed.content,
              processed.imports
            );
          }
          continue;
        }

        // Process regular files
        const processed = await this.processToken(content);
        await this.writeTokenFile(
          outputPath,
          processed.content,
          processed.imports
        );
      }
    };

    await processDirectory();
    console.log('Token conversion complete!');
  }
}

// Configuration
const config = {
  rootDir: join(dirname(fileURLToPath(import.meta.url)), 'tokens'),
  outDir: join(dirname(fileURLToPath(import.meta.url)), 'dist'),
  extensions: {
    source: '.json',
    output: '.ts'
  }
};

// Run the conversion
const processor = new TokenProcessor(config);
processor.convert().catch(console.error);