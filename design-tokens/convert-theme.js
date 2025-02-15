import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import chokidar from "chokidar";

// Håndter __dirname i ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const jsonDir = path.join(__dirname, "json");
const tsDir = path.join(__dirname, "ts");

// Sikrer at outputmappen eksisterer
function ensureDirectoryExistence(filePath) {
  const dirname = path.dirname(filePath);
  if (!fs.existsSync(dirname)) {
    fs.mkdirSync(dirname, { recursive: true });
  }
}

// Konverter JSON til TypeScript format
function convertJsonToTs(jsonPath) {
  const relativePath = path.relative(jsonDir, jsonPath);
  const tsPath = path.join(tsDir, relativePath.replace(/\.json$/, ".ts"));

  fs.readFile(jsonPath, "utf8", (err, data) => {
    if (err) {
      console.error(`❌ Fejl ved læsning af ${jsonPath}:`, err);
      return;
    }

    try {
      const jsonData = JSON.parse(data);
      const tsContent = `export const tokens = ${JSON.stringify(jsonData, null, 2)};`;

      ensureDirectoryExistence(tsPath);

      fs.writeFile(tsPath, tsContent, "utf8", (err) => {
        if (err) {
          console.error(`❌ Fejl ved skrivning af ${tsPath}:`, err);
        } else {
          console.log(`✅ Konverteret: ${jsonPath} → ${tsPath}`);
        }
      });
    } catch (parseError) {
      console.error(`❌ Fejl ved parsing af JSON i ${jsonPath}:`, parseError);
    }
  });
}

// 🚀 **Konverter eksisterende JSON-filer ved opstart**
function convertAllExistingJson() {
  function scanDir(dir) {
    fs.readdirSync(dir, { withFileTypes: true }).forEach(dirent => {
      const fullPath = path.join(dir, dirent.name);
      if (dirent.isDirectory()) {
        scanDir(fullPath);
      } else if (dirent.isFile() && dirent.name.endsWith(".json")) {
        convertJsonToTs(fullPath);
      }
    });
  }
  console.log("🔄 Konverterer eksisterende JSON-filer...");
  scanDir(jsonDir);
}

// Start konvertering af eksisterende filer
convertAllExistingJson();

// Overvåg ændringer i JSON-mappen
chokidar.watch(`${jsonDir}/**/*.json`, { persistent: true })
  .on("add", convertJsonToTs)     // Når en ny fil tilføjes
  .on("change", convertJsonToTs); // Når en eksisterende fil ændres

console.log("👀 Overvåger JSON-filer i:", jsonDir);