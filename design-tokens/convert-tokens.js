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
    this.dependencies = new Map();
  }

  async initialize(jsonDir) {
    await this.loadGlobalTokens(jsonDir);
    await this.loadBrandTokens(jsonDir);
  }

  async loadGlobalTokens(jsonDir) {
    const globalsDir = path.join(jsonDir, 'globals');
    if (fs.existsSync(globalsDir)) {
      const files = await fs.promises.readdir(globalsDir);
      for (const file of files) {
        if (file.endsWith('.json')) {
          const filePath = path.join(globalsDir, file);
          const content = JSON.parse(await fs.promises.readFile(filePath, 'utf8'));
          this.globalTokens.set('base', { content, filePath });
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
          const brandName = path.basename(file, '.json');
          const brandData = {
            base: await this.loadBrandBase(brandName, jsonDir),
            light: await this.loadBrandTheme(brandName, 'light', jsonDir),
            dark: await this.loadBrandTheme(brandName, 'dark', jsonDir),
            components: await this.loadBrandComponents(brandName, jsonDir)
          };
          this.brandTokens.set(brandName, brandData);
        }
      }
    }
  }

  async loadBrandBase(brand, jsonDir) {
    const filePath = path.join(jsonDir, 'brand', `${brand}.json`);
    return {
      content: JSON.parse(await fs.promises.readFile(filePath, 'utf8')),
      filePath
    };
  }

  async loadBrandTheme(brand, theme, jsonDir) {
    const filePath = path.join(jsonDir, 'theme', `${theme}.json`);
    if (fs.existsSync(filePath)) {
      return {
        content: JSON.parse(await fs.promises.readFile(filePath, 'utf8')),
        filePath
      };
    }
    return null;
  }

  async loadBrandComponents(brand, jsonDir) {
    const base = await this.loadBrandBase(brand, jsonDir);
    return base.content.components ? {
      content: base.content.components,
      filePath: base.filePath
    } : null;
  }

  findReferences(obj) {
    const references = new Set();
    
    const traverse = (value) => {
      if (typeof value === 'object' && value !== null) {
        if (value.value && typeof value.value === 'string' && value.value.startsWith('{') && value.value.endsWith('}')) {
          const ref = value.value.slice(1, -1);
          references.add(ref);
        }
        Object.values(value).forEach(traverse);
      }
    };

    traverse(obj);
    return references;
  }

  generateImports(references, currentPath) {
    const imports = new Set();
    const relativePath = (targetPath) => {
      return path.relative(
        path.dirname(currentPath),
        targetPath
      ).replace(/\\/g, '/');
    };

    // Add global imports
    imports.add(`import { globalTokens } from '${relativePath(path.join(this.config.outputDir, 'global', 'index'))}';`);

    return Array.from(imports).join('\n');
  }
}

class FileGenerator {
  constructor(config, registry) {
    this.config = config;
    this.registry = registry;
  }

  async generateFiles() {
    await this.generateGlobalFiles();
    await this.generateBrandFiles();
    await this.generateMainIndex();
    await this.generateUtils();
  }

  async generateGlobalFiles() {
    // Generate global/index.ts
    const globalIndexPath = path.join(this.config.outputDir, 'global', 'index.ts');
    const globalContent = `
import baseTokens from './baseTokens.json';

export const globalTokens = baseTokens;
`;
    await this.writeFile(globalIndexPath, globalContent);

    // Generate global tokens file
    const globalTokensPath = path.join(this.config.outputDir, 'global', 'baseTokens.json');
    await this.writeFile(globalTokensPath, JSON.stringify(this.registry.globalTokens.get('base').content, null, 2));
  }

  async generateBrandFiles() {
    for (const [brand, data] of this.registry.brandTokens) {
      const brandDir = path.join(this.config.outputDir, 'brands', brand);
      
      // Generate brand base tokens
      await this.writeFile(
        path.join(brandDir, 'baseTokens.json'),
        JSON.stringify(data.base.content, null, 2)
      );

      // Generate theme files
      if (data.light) {
        await this.writeFile(
          path.join(brandDir, 'light.json'),
          JSON.stringify(data.light.content, null, 2)
        );
      }
      if (data.dark) {
        await this.writeFile(
          path.join(brandDir, 'dark.json'),
          JSON.stringify(data.dark.content, null, 2)
        );
      }

      // Generate components file if exists
      if (data.components) {
        await this.writeFile(
          path.join(brandDir, 'components.json'),
          JSON.stringify(data.components.content, null, 2)
        );
      }

      // Generate brand index.ts
      const brandIndexContent = `
import baseTokens from './baseTokens.json';
import lightMode from './light.json';
import darkMode from './dark.json';
import componentTokens from './components.json';

export const ${brand}Tokens = {
  base: baseTokens,
  themes: {
    light: lightMode,
    dark: darkMode,
  },
  components: componentTokens
};
`;
      await this.writeFile(path.join(brandDir, 'index.ts'), brandIndexContent);
    }
  }

  async generateMainIndex() {
    const imports = Array.from(this.registry.brandTokens.keys())
      .map(brand => `import { ${brand}Tokens } from './brands/${brand}';`)
      .join('\n');

    const brandMap = Array.from(this.registry.brandTokens.keys())
      .map(brand => `  ${brand}: ${brand}Tokens,`)
      .join('\n');

    const content = `
import { globalTokens } from './global';
${imports}

const brandMap: Record<string, any> = {
${brandMap}
};

export const getTokens = (brand: string, mode: 'light' | 'dark') => {
  const brandTokens = brandMap[brand] || {};
  return {
    ...globalTokens, 
    ...brandTokens.base,
    ...brandTokens.themes[mode],
    components: brandTokens.components
  };
};
`;
    await this.writeFile(path.join(this.config.outputDir, 'index.ts'), content);
  }

  async generateUtils() {
    const resolverContent = `
import { getTokens } from '../tokens';

export const resolveTheme = (brand: string, mode: 'light' | 'dark') => {
  return getTokens(brand, mode);
};
`;
    await this.writeFile(path.join(this.config.outputDir, '..', 'utils', 'themeResolver.ts'), resolverContent);
  }

  async writeFile(filePath, content) {
    try {
      await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
      await fs.promises.writeFile(filePath, content, 'utf8');
      console.log(`Created: ${filePath}`);
    } catch (error) {
      console.error(`Error writing ${filePath}:`, error);
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
    
    console.log('Generating TypeScript files...');
    const generator = new FileGenerator(this.config, this.registry);
    await generator.generateFiles();
    
    console.log('Conversion completed successfully!');
  }
}

// Create and run converter
const converter = new TokenConverter();
converter.convert().catch(error => {
  console.error('Failed to run converter:', error);
  process.exit(1);
});