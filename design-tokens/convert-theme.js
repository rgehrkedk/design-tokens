import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync, readdirSync } from 'fs';
import { watch } from 'chokidar';
import { basename, dirname, join, relative } from 'path';

// Hjælpefunktion til at konvertere JSON struktur til det ønskede TS format
function convertJsonToTs(jsonData, filePath) {
    const relativePath = relative(watchDir, filePath);
    const fileDir = dirname(relativePath);
    const fileName = basename(filePath, '.json');
    
    let tsContent = '';
    
    // Hvis det er en brand-fil
    if (fileDir === 'brand') {
        // Import fra globals/default.ts
        tsContent += `import { default as globals } from '../globals/default';\n\n`;
        
        // Udtræk konstant navn fra filnavnet (f.eks. 'e-boks' fra 'e-boks.ts')
        const constName = fileName.replace(/-/g, '');
        
        // Konverter json data til typescript objekt
        const processedData = processValue(jsonData);
        
        // Opbyg de individuelle konstanter
        const constants = [];
        for (const [key, value] of Object.entries(processedData)) {
            constants.push(`const ${key} = ${JSON.stringify(value, null, 2)};`);
        }
        
        // Tilføj alle konstant definitioner
        tsContent += constants.join('\n\n') + '\n\n';
        
        // Eksporter det samlede objekt
        tsContent += `export const ${constName} = {
    neutrals: globals.neutrals,
    brand: brand,
    feedback: feedback,
    thirdParty: thirdParty
};\n`;
    } else {
        // For non-brand files, keep the original logic
        if (fileName.includes('default')) {
            tsContent += `export default ${JSON.stringify(processValue(jsonData), null, 2)};\n`;
        } else {
            tsContent += `export const theme = ${JSON.stringify(processValue(jsonData), null, 2)};\n`;
        }
    }
    
    return tsContent;
}

// Funktion til at processere en fil
async function processFile(filePath) {
    console.log(`Processing file: ${filePath}`);
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