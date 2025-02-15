import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { watch } from 'chokidar';
import { basename, dirname, join, relative } from 'path';

// Hjælpefunktion til at konvertere JSON struktur til det ønskede TS format
function convertJsonToTs(jsonData) {
    let tsContent = `import { brand } from './brand';\n\n`;

    function processObject(obj, parentKey = '') {
        let result = {};

        for (const [key, value] of Object.entries(obj)) {
            if (value && typeof value === 'object') {
                if ('value' in value) {
                    // Håndter token referencer
                    let tokenValue = value.value;
                    // Fjern {} fra token referencen
                    tokenValue = tokenValue.replace(/[{}]/g, '');
                    // Konverter token path til den ønskede struktur
                    const parts = tokenValue.split('.');
                    
                    // Opbyg den korrekte reference
                    if (parts[0] === 'brand') {
                        result[key] = `brand.${parts.slice(1).join('.')}`;
                    } else if (parts[0] === 'neutrals') {
                        if (parts[1] === 'alpha') {
                            result[key] = `brand.neutrals.alpha['${parts[2]}']['${parts[3]}']`;
                        } else {
                            result[key] = `brand.neutrals['${parts[1]}']`;
                        }
                    }
                } else {
                    // Rekursivt process nested objekter
                    result[key] = processObject(value, key);
                }
            }
        }
        return result;
    }

    const convertedData = processObject(jsonData);
    
    // Konverter til TypeScript export syntax
    tsContent += `export const theme = ${JSON.stringify(convertedData, null, 2)};\n`;
    
    return tsContent;
}

// Opsæt watch på input directory
const watchDir = './json';
const outputDir = './ts';

// Sørg for at output directory eksisterer
if (!existsSync(outputDir)) {
    await mkdir(outputDir, { recursive: true });
}

// Start watching for nye JSON filer rekursivt i alle undermapper
console.log(`Søger efter JSON filer i ${watchDir}...`);

const watcher = watch(`${watchDir}/**/*.json`, {
    persistent: true,
    ignoreInitial: false,
    awaitWriteFinish: true
});

// Log alle events for at hjælpe med debugging
watcher.on('ready', () => {
    console.log('Initial scan complete. Ready for changes');
});

watcher.on('error', error => {
    console.error(`Watcher error: ${error}`);
});

watcher.on('add', async (filePath) => {
    console.log(`Ny JSON fil opdaget: ${filePath}`);
    
    try {
        // Læs JSON filen
        const jsonContent = await readFile(filePath, 'utf8');
        const jsonData = JSON.parse(jsonContent);
        
        // Konverter til TS format
        const tsContent = convertJsonToTs(jsonData);
        
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
});

// Funktion til at processere en fil
async function processFile(filePath) {
    console.log(`Processerer fil: ${filePath}`);
    try {
        // Læs JSON filen
        const jsonContent = await readFile(filePath, 'utf8');
        const jsonData = JSON.parse(jsonContent);
        
        // Konverter til TS format
        const tsContent = convertJsonToTs(jsonData);
        
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

// Lyt efter nye filer
watcher.on('add', processFile);

console.log(`Overvåger ${watchDir} for nye JSON filer...`);