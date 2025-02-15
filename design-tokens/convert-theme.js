import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import chokidar from "chokidar";

// Håndter __dirname i ESM
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
      console.error(`Fejl ved læsning af ${jsonPath}:`, err);
      return;
    }

    try {
      const jsonData = JSON.parse(data);
      const tsContent = `export const tokens = ${JSON.stringify(jsonData, null, 2)};`;

      ensureDirectoryExistence(tsPath);

      fs.writeFile(tsPath, tsContent, "utf8", (err) => {
        if (err) {
          console.error(`Fejl ved skrivning af ${tsPath}:`, err);
        } else {
          console.log(`✅ Konverteret: ${jsonPath} → ${tsPath}`);
        }
      });
    } catch (parseError) {
      console.error(`Fejl ved parsing af JSON i ${jsonPath}:`, parseError);
    }
  });
}

// Overvåg ændringer i JSON-mappen
chokidar.watch(`${jsonDir}/**/*.json`, { persistent: true })
  .on("add", convertJsonToTs)
  .on("change", convertJsonToTs);

console.log("👀 Overvåger JSON-filer i:", jsonDir);