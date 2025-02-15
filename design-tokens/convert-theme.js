import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync, readdirSync } from 'fs';
import { watch } from 'chokidar';
import { basename, dirname, join, relative } from 'path';

// Hjælpefunktion til at formatere værdier korrekt med quotes
function formatValue(key, value) {
    // Hvis værdien er et objekt, håndter det rekursivt
    if (typeof value === 'object' && value !== null) {
        const entries = Object.entries(value).map(([k, v]) => {
            const formattedKey = k.includes('-') || k.includes(' ') ? `'${k}'` : k;
            return `${formattedKey}: ${formatValue(k, v)}`;
        });
        return `{\n${entries.join(',\n')}\n}`;
    }
    
    // Hvis værdien er en string
    if (typeof value === 'string') {
        // Hvis det er en reference til brand
        if (value.startsWith('brand.')) {
            return value;
        }
        // Hvis det er en hex farve eller anden string værdi
        return `'${value}'`;
    }
    
    // For alle andre typer værdier
    return value;
}

function customStringify(obj) {
    return formatValue(null, obj);
}

// Hjælpefunktion til at flattene værdier i brand filer
function flattenBrandValues(obj) {
    const result = {};
    
    function processValue(value) {
        if (typeof value === 'object' && value !== null) {
            if ('value' in value) {
                return value.value;
            }
            const processedObj = {};
            for (const [key, val] of Object.entries(value)) {
                processedObj[key] = processValue(val);
            }
            return processedObj;
        }
        return value;
    }
    
    return processValue(obj);
}

// Hjælpefunktion til at konvertere theme referencer
function convertThemeReferences(obj) {
    const result = {};
    
    function processValue(value) {
        if (typeof value === 'object' && value !== null) {
            if ('value' in value) {
                let refValue = value.value;
                if (typeof refValue === 'string' && refValue.startsWith('{')) {
                    // Fjern {} og konverter referencen
                    refValue = refValue.replace(/[{}]/g, '');
                    const parts = refValue.split('.');
                    
                    if (parts[0] === 'brand' || parts[0] === 'neutrals' || parts[0] === 'feedback') {
                        return `brand.${parts.join('.')}`;
                    }
                    // Håndter andre referencer (components, etc.)
                    return refValue;
                }
                return refValue;
            }
            const processedObj = {};
            for (const [key, val] of Object.entries(value)) {
                processedObj[key] = processValue(val);
            }
            return processedObj;
        }
        return value;
    }
    
    for (const [key, value] of Object.entries(obj)) {
        result[key] = processValue(value);
    }
    
    return result;
}

async function processFile(filePath) {
    console.log(`Processerer fil: ${filePath}`);
    try {
        // Læs JSON filen
        const jsonContent = await readFile(filePath, 'utf8');
        const jsonData = JSON.parse(jsonContent);
        
        // Bestem filtype baseret på sti og indhold
        const relativePath = relative(watchDir, filePath);
        const fileDir = dirname(relativePath);
        const fileName = basename(filePath, '.json');
        
        let tsContent = '';
        
        // Hvis det er en brand fil (ligger i brand mappen)
        if (fileDir === 'brand') {
            const flattenedData = flattenBrandValues(jsonData);
            tsContent = `export const ${fileName.replace(/-/g, '')} = ${customStringify(flattenedData)};\n`;
        } 
        // Hvis det er en globals fil
        else if (fileDir === 'globals') {
            const flattenedData = flattenBrandValues(jsonData);
            tsContent = `export default ${customStringify(flattenedData)};\n`;
        }
        // Hvis det er en theme fil
        else if (fileDir === 'theme') {
            tsContent = `import { brand } from '../brand/core';\n\n`;
            const processedData = convertThemeReferences(jsonData);
            const themeObject = {};
            
            // Opbyg theme objektet
            for (const [key, value] of Object.entries(processedData)) {
                themeObject[key] = value;
            }
            
            tsContent += `const ${fileName.replace(/-/g, '')} = ${customStringify(themeObject)};\n\n`;
            tsContent += `export const theme = ${fileName.replace(/-/g, '')};\n`;
        }
        
        // Opret de nødvendige undermapper i ts-mappen
        const targetDir = join(outputDir, fileDir);
        if (!existsSync(targetDir)) {
            await mkdir(targetDir, { recursive: true });
        }
        
        // Gem som .ts fil
        const outputPath = join(targetDir, `${fileName}.ts`);
        await writeFile(outputPath, tsContent);
        console.log(`Konverteret til TypeScript: ${outputPath}`);
    } catch (error) {
        console.error(`Fejl ved konvertering af ${filePath}:`, error);
    }
}

// Hjælpefunktion til at rekursivt liste alle JSON filer
function listJsonFiles(dir) {
    try {
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
    } catch (error) {
        console.error(`Fejl ved scanning af mappe ${dir}:`, error);
        return [];
    }
}

// Opsæt watch på input directory
const watchDir = './json';
const outputDir = './ts';

// Sørg for at output directory eksisterer
if (!existsSync(outputDir)) {
    await mkdir(outputDir, { recursive: true });
}

// Scan efter eksisterende filer først
console.log('Scanner efter eksisterende JSON filer...');
const existingFiles = listJsonFiles(watchDir);
console.log(`Fandt ${existingFiles.length} JSON filer:`);
existingFiles.forEach(file => {
    console.log(` - ${file}`);
    processFile(file);
});

// Start watching for nye JSON filer
console.log(`\nOvervåger ${watchDir} for JSON filer...`);

const watcher = watch(`${watchDir}/**/*.json`, {
    persistent: true,
    ignoreInitial: false,
    awaitWriteFinish: true
});

watcher.on('add', processFile);

watcher.on('ready', () => {
    console.log('Initial scan complete. Ready for changes');
});

watcher.on('error', error => {
    console.error(`Watcher error: ${error}`);
});