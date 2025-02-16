import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const jsonDir = path.join(__dirname, "json");
const tsDir = path.join(__dirname, "ts");

// Helper to convert property names
function sanitizePropertyName(name) {
  return name.replace(/-./g, x => x[1].toUpperCase());
}

// Process JSON data
function processValue(data) {
  if (typeof data !== 'object' || data === null) return data;
  
  const result = Array.isArray(data) ? [] : {};
  
  for (const [key, value] of Object.entries(data)) {
    const sanitizedKey = sanitizePropertyName(key);
    result[sanitizedKey] = typeof value === 'object' ? processValue(value) : value;
  }
  
  return result;
}

// Generate TypeScript content
function generateTsContent(fileName, jsonData) {
  const baseName = path.basename(fileName, '.json');
  let tsContent = '';
  
  // Handle different file types
  if (fileName.includes('brand')) {
    tsContent = `export const ${baseName} = ${JSON.stringify(processValue(jsonData), null, 2)};\n`;
  } else if (fileName.includes('globals')) {
    tsContent = `export const ${baseName} = ${JSON.stringify(processValue(jsonData), null, 2)};\n`;
  } else {
    if (fileName.includes('default')) {
      tsContent = `export default ${JSON.stringify(processValue(jsonData), null, 2)};\n`;
    } else {
      tsContent = `export const theme = ${JSON.stringify(processValue(jsonData), null, 2)};\n`;
    }
  }
  
  return tsContent;
}

// Convert JSON to TypeScript
async function convertJsonToTs(jsonPath) {
  try {
    const jsonContent = await fs.readFile(jsonPath, 'utf8');
    const jsonData = JSON.parse(jsonContent);
    
    const relativePath = path.relative(jsonDir, jsonPath);
    const tsPath = path.join(tsDir, relativePath.replace('.json', '.ts'));
    
    await fs.mkdir(path.dirname(tsPath), { recursive: true });
    const tsContent = generateTsContent(jsonPath, jsonData);
    await fs.writeFile(tsPath, tsContent);
    
    console.log(`Converted: ${jsonPath} → ${tsPath}`);
  } catch (error) {
    console.error(`Error converting ${jsonPath}:`, error);
  }
}

// Process all JSON files
async function convertAllExistingJson(dir = jsonDir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await convertAllExistingJson(fullPath);
    } else if (entry.isFile() && entry.name.endsWith('.json')) {
      await convertJsonToTs(fullPath);
    }
  }
}

// Start conversion
convertAllExistingJson().catch(console.error);
console.log(`Watching JSON files in: ${jsonDir}`);