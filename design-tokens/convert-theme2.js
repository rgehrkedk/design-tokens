import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const jsonDir = path.join(__dirname, "json");
const tsDir = path.join(__dirname, "ts");

// Track what properties each brand defines
const brandDefinitions = new Map();

function ensureDirectoryExistence(filePath) {
  const dirname = path.dirname(filePath);
  if (!fs.existsSync(dirname)) {
    fs.mkdirSync(dirname, { recursive: true });
  }
}

/**
 * Scans brand files to determine what properties they define
 */
function scanBrandDefinitions() {
  const brandFiles = fs.readdirSync(path.join(jsonDir, 'brand'))
    .filter(f => f.endsWith('.json'));

  for (const brandFile of brandFiles) {
    const brandName = path.basename(brandFile, '.json').replace(/-/g, '');
    const content = JSON.parse(
      fs.readFileSync(path.join(jsonDir, 'brand', brandFile), 'utf8')
    );

    brandDefinitions.set(brandName, new Set(Object.keys(content)));
  }
}

/**
 * Determines if a property path is defined in a brand
 */
function isDefinedInBrand(brandName, propertyPath) {
  const brandProps = brandDefinitions.get(brandName);
  if (!brandProps) return false;

  const topLevel = propertyPath.split('.')[0];
  return brandProps.has(topLevel);
}

/**
 * Formats a property accessor for TypeScript
 * Returns proper bracket or dot notation
 */
function formatPropertyAccessor(part) {
  // If numeric or contains special characters, use bracket notation
  if (/^\d+$/.test(part) || part.includes('-') || part.includes(' ')) {
    return `['${part}']`;
  }
  return `.${part}`;
}

/**
 * Processes a token reference (e.g. "{brand.primary.300}")
 */
function processTokenReference(reference, options = {}) {
  const { currentBrand = '' } = options;
  
  // Remove the curly braces and split into parts
  const parts = reference.slice(1, -1).split('.');
  const [firstPart, ...rest] = parts;

  // Determine the base reference
  let baseReference;
  if (['background', 'foreground', 'components'].includes(firstPart)) {
    baseReference = firstPart;
  } else if (firstPart === 'brand') {
    baseReference = `${currentBrand}.brand`;
  } else if (firstPart === 'feedback') {
    baseReference = 'globalvalue.feedback';
  } else if (isDefinedInBrand(currentBrand, firstPart)) {
    baseReference = currentBrand;
  } else {
    baseReference = 'globalvalue';
  }

  // Build the full reference
  const propertyPath = firstPart === 'brand' ? rest : parts;
  const accessors = propertyPath.map(formatPropertyAccessor).join('');
  
  return `${baseReference}${accessors}`;
}

/**
 * Processes a value, handling both direct values and references
 */
function processValue(value, options = {}) {
  if (value && typeof value === 'object' && 'value' in value) {
    if (typeof value.value === 'string' && value.value.startsWith('{')) {
      return processTokenReference(value.value, options);
    }
    return JSON.stringify(value.value);
  }

  if (typeof value === 'string' && value.startsWith('{')) {
    return processTokenReference(value, options);
  }

  return JSON.stringify(value);
}

/**
 * Processes an object's values recursively
 */
function processTokenObject(obj, options = {}) {
  const result = {};

  for (const [key, value] of Object.entries(obj)) {
    if (value && typeof value === 'object' && !('value' in value)) {
      result[key] = processTokenObject(value, options);
    } else {
      const processed = processValue(value, options);
      // If it's a reference (not wrapped in quotes), keep it as is
      result[key] = processed.startsWith('"') ? processed : processed;
    }
  }

  return result;
}

/**
 * Creates TypeScript content with proper imports and formatting
 */
function createTypeScriptContent(data, options) {
  const { imports = [], exportName, additionalImports = '' } = options;
  
  const importStatements = imports
    .map(imp => `import { ${imp.name} } from '${imp.path}';`)
    .join('\n');

  const processedData = processTokenObject(data, options);
  
  // Convert to string with proper formatting
  const content = JSON.stringify(processedData, null, 2)
    // Format property names
    .replace(/"([^"]+)":/g, (_, p1) => p1.includes('-') ? `'${p1}':` : `${p1}:`)
    // Remove quotes from references
    .replace(/"([^"]+\.[^"]+(?:\['[^']+'\])*)"(?=,?\n)/g, '$1');

  return `${importStatements}
${additionalImports}

export const ${exportName} = ${content};
`;
}

/**
 * Converts all theme files
 */
function convertFiles() {
  console.log("🔍 Starting conversion process...");
  scanBrandDefinitions();

  // Process each brand
  const brandFiles = fs.readdirSync(path.join(jsonDir, 'brand'))
    .filter(f => f.endsWith('.json'));

  for (const brandFile of brandFiles) {
    const brandName = path.basename(brandFile, '.json').replace(/-/g, '');
    console.log(`📦 Processing brand: ${brandName}`);

    // Read brand content
    const brandContent = JSON.parse(
      fs.readFileSync(path.join(jsonDir, 'brand', brandFile), 'utf8')
    );

    // Split components into separate file
    const { components, ...brandBase } = brandContent;

    // Write brand base file
    const basePath = path.join(tsDir, 'brand', `${brandName}.ts`);
    ensureDirectoryExistence(basePath);
    fs.writeFileSync(
      basePath,
      createTypeScriptContent(brandBase, {
        exportName: brandName,
        currentBrand: brandName
      })
    );

    // Write components file
    const componentsPath = path.join(tsDir, 'brand', `${brandName}components.ts`);
    fs.writeFileSync(
      componentsPath,
      createTypeScriptContent(components, {
        exportName: `${brandName}components`,
        currentBrand: brandName,
        imports: [
          { name: `${brandName}light`, path: `../theme/${brandName}light` },
          { name: `${brandName}dark`, path: `../theme/${brandName}dark` }
        ]
      })
    );

    // Process theme variations
    ['light', 'dark'].forEach(variation => {
      const themeContent = JSON.parse(
        fs.readFileSync(path.join(jsonDir, 'theme', `${variation}.json`), 'utf8')
      );
      
      const themePath = path.join(tsDir, 'theme', `${brandName}${variation}.ts`);
      ensureDirectoryExistence(themePath);
      fs.writeFileSync(
        themePath,
        createTypeScriptContent(themeContent, {
          exportName: `${brandName}${variation}`,
          currentBrand: brandName,
          imports: [
            { name: 'globalvalue', path: '../globals/globalvalue' },
            { name: brandName, path: `../brand/${brandName}` },
            { name: `${brandName}components`, path: `../brand/${brandName}components` }
          ]
        })
      );
    });
  }

  // Process global values
  const globalContent = JSON.parse(
    fs.readFileSync(path.join(jsonDir, 'globals', 'globalvalue.json'), 'utf8')
  );
  
  const globalOutput = path.join(tsDir, 'globals', 'globalvalue.ts');
  ensureDirectoryExistence(globalOutput);
  fs.writeFileSync(
    globalOutput,
    createTypeScriptContent(globalContent, {
      exportName: 'globalvalue'
    })
  );

  console.log("✨ Conversion complete!");
}

// Start conversion
convertFiles();