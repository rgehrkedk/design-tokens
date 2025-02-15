import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync, readdirSync } from 'fs';
import { watch } from 'chokidar';
import { basename, dirname, join, relative } from 'path';

// Hjælpefunktion til at konvertere JSON struktur til det ønskede TS format
function convertJsonToTs(jsonData, filePath) {
    let imports = new Set();
    let tsContent = '';

    function processValue(value) {
        if (typeof value === 'object' && value !== null) {
            if ('value' in value) {
                // Hvis værdien er en hex-farve, returner den direkte
                if (typeof value.value === 'string' && value.value.startsWith('#')) {
                    return `'${value.value}'`;
                }
                // Hvis værdien er en reference, håndter den
                if (typeof value.value === 'string' && value.value.startsWith('{')) {
                    const reference = value.value.replace(/[{}]/g, '');
                    const parts = reference.split('.');
                    
                    // Tilføj import hvis det er en reference til en anden fil
                    if (parts[0] === 'brand') {
                        imports.add("import { brand } from './brand';");
                    }
                    
                    if (parts[0] === 'neutrals') {
                        imports.add("import { brand } from './brand';");
                        return `brand.neutrals${parts.slice(1).map(p => `['${p}']`).join('')}`;
                    }
                    return reference;
                }
                return value.value;
            }
            
            // Rekursivt behandl objekter
            const processedObj = {};
            for (const [key, val] of Object.entries(value)) {
                processedObj[key] = processValue(val);
            }
            return processedObj;
        }
        return value;
    }

    const processedData = processValue(jsonData);
    
    // Tilføj imports
    if (imports.size > 0) {
        tsContent += Array.from(imports).join('\n') + '\n\n';
    }

    // Hvis det er en brand-fil, eksporter objektet direkte
    const fileName = basename(filePath, '.json');
    if (fileName.startsWith('brand-')) {
        tsContent += `export const brand = ${JSON.stringify(processedData.brand, null, 2)};\n`;
    } else {
        // Ellers eksporter som theme
        tsContent += `export const theme = ${JSON.stringify(processedData, null, 2)};\n`;
    }
    
    return tsContent;
}

// Funktion til at processere en fil
async function processFile(filePath) {
    console.log(`Processerer fil: ${filePath}`);
    try {
        // Læs JSON filen
        const jsonContent = await readFile(filePath, 'utf8');
        const jsonData = JSON.parse(jsonContent);
        
        // Konverter til TS format
        const tsContent = convertJsonToTs(jsonData, filePath);
        
        // Bevar mappestien relativt til json-mappen
        const relativePath = relative(watchDir, filePath);
        const relativeDir = dirname(relativePath);
        const fileName = basename(filePath, '.json');
        
        // Opret de nødvendige undermapper i ts-mappen
        const targetDir = join(outputDir, relativeDir);
        if (!existsSync(targetDir)) {
            await mkdir(targetDir, { recursive: true });
        }
        
        // Gem som .ts fil med samme relative sti
        const outputPath = join(targetDir, `${fileName}.ts`);
        
        await writeFile(outputPath, tsContent);
        console.log(`Konverteret til TypeScript: ${outputPath}`);
    } catch (error) {
        console.error(`Fejl ved konvertering af ${filePath}:`, error);
    }
}

// Hjælpefunktion til at rekursivt liste alle JSON filer
function listJsonFiles(dir) {
    const files = readdirSync(dir, { withFileTypes: true });
    let jsonFiles = [];
    
    for (const file of files) {
        const fullPath = join(dir, file.name);
        if (file.isDirectory()) {
            jsonFiles = [...jsonFiles, ...listJsonFiles(fullPath)];
        } else if (file.name.endsWith('.json')) {
            jsonFiles.push(fullPath);
        }
    }
    
    return jsonFiles;
}

// Opsæt watch på input directory
const watchDir = './json';
const outputDir = './ts';

// Sørg for at output directory eksisterer
if (!existsSync(outputDir)) {
    await mkdir(outputDir, { recursive: true });
}

// Check eksisterende filer først
console.log('Checking for existing JSON files...');
const existingFiles = listJsonFiles(watchDir);
console.log(`Found ${existingFiles.length} JSON files:`);
existingFiles.forEach(file => console.log(` - ${file}`));

// Proces eksisterende filer
for (const file of existingFiles) {
    await processFile(file);
}

// Start watching for nye JSON filer rekursivt i alle undermapper
console.log(`\nStarting watcher for ${watchDir}...`);

const watcher = watch(`${watchDir}/**/*.json`, {
    persistent: true,
    ignoreInitial: false,
    awaitWriteFinish: true
});

// Lyt efter nye filer
watcher.on('add', processFile);

// Log alle events for at hjælpe med debugging
watcher.on('ready', () => {
    console.log('Initial scan complete. Ready for changes');
});

watcher.on('error', error => {
    console.error(`Watcher error: ${error}`);
});