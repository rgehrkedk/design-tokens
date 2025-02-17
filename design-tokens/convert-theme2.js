import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const jsonDir = path.join(__dirname, "json");
const tsDir = path.join(__dirname, "ts");

// Map to store all token definitions and their locations
const tokenDefinitionMap = new Map();

/**
 * Ensure directory exists (create if not)
 */
function ensureDirectoryExistence(filePath) {
  const dirname = path.dirname(filePath);
  if (!fs.existsSync(dirname)) {
    fs.mkdirSync(dirname, { recursive: true });
  }
}

/**
 * Scans all JSON files to build a complete token definition map
 * - Læser alle top-level nøgler fra hver fil og gemmer i map
 */
function buildTokenDefinitionMap(dir = jsonDir) {
  const files = fs.readdirSync(dir, { withFileTypes: true });

  for (const file of files) {
    const fullPath = path.join(dir, file.name);
    if (file.isDirectory()) {
      buildTokenDefinitionMap(fullPath);
    } else if (file.name.endsWith(".json")) {
      const content = JSON.parse(fs.readFileSync(fullPath, "utf8"));
      const relativePath = path.relative(jsonDir, dir);
      const moduleName = path
        .basename(file.name, ".json")
        .replace(/-/g, "_");

      // Store file location + top-level keys
      const fileInfo = {
        path: relativePath,       // fx "globals"
        module: moduleName,       // fx "typography"
        keys: new Set(Object.keys(content)), // fx {"typography", "colors", ...}
      };
      tokenDefinitionMap.set(fullPath, fileInfo);
    }
  }
}

/**
 * Find the source file that defines a token
 * - Returnerer info om den fil, der har en top-level nøgle lig med `token`.
 */
function findTokenDefinition(token) {
  for (const [filePath, info] of tokenDefinitionMap) {
    if (info.keys.has(token)) {
      return {
        filePath,
        ...info,
      };
    }
  }
  return null;
}

/**
 * Gennemløber et JSON-objekt for at finde alle referencer af typen "{token.something}"
 * Returnerer et array af unikke filer, vi skal importere fra.
 */
function processTokenReferences(obj) {
  const references = new Set();

  JSON.stringify(obj, (key, value) => {
    // Leder efter strings som "{...}"
    if (typeof value === "string" && value.startsWith("{") && value.endsWith("}")) {
      const token = value.slice(1, -1).split(".")[0]; // før første punktum
      const definition = findTokenDefinition(token);
      if (definition) {
        references.add(definition);
      }
    }
    return value;
  });

  return Array.from(references);
}

/**
 * Danner import-linjer til alle fundne references
 */
function generateImports(references, currentPath) {
  const imports = new Set();

  for (const ref of references) {
    // regn relativ sti til TypeScript output
    const relativePath = path.relative(
      path.dirname(currentPath),
      path.join(tsDir, ref.path)
    );

    // Sørg for korrekt syntaks i import-sti
    const importPath = relativePath.startsWith(".")
      ? relativePath
      : "./" + relativePath;

    // fx: import { typography } from '../globals/typography';
    imports.add(`import { ${ref.module} } from '${importPath}/${ref.module}';`);
  }

  return Array.from(imports).join("\n");
}

/**
 * Konverter JSON-struktur til en TypeScript-venlig streng,
 * hvor token-referencer oversættes til modulnavn + property.
 *
 * Ændringen her er, at vi *kun* bruger `definition.module` som "prefix"
 * (altså filens navn, fx "typography") – og undlader at sætte token-navnet igen,
 * så man undgår fx "typography.typography[...]".
 */
function formatJsonForTs(obj) {
  return JSON.stringify(obj, null, 2)
    // 1) Skift anførselstegn om nøgler – TypeScript tillader "bare" nøgler uden quotes,
    //    men hvis der er bindestreg i nøglen, bliver vi nødt til at beholde dem som '...'.
    .replace(/"([^"]+)":/g, (match, p1) =>
      p1.includes("-") ? `'${p1}':` : `${p1}:`
    )

    // 2) Erstat token-referencer "{token.something}" med <modulnavn>["something"]
    //    Ligger token i filen <modulnavn>.json, hentes import { modulnavn }
    .replace(/"\{([^}]+)\}"/g, (match, p1) => {
      const parts = p1.split(".");
      const token = parts[0]; // fx "typography"
      const definition = findTokenDefinition(token);

      // Hvis vi ved, hvilken fil token kommer fra...
      if (definition) {
        // definition.module = fx "typography"
        // Sæt "prefix" = modulnavnet (uden at gentage token).
        const prefix = definition.module;
        // alt efter antallet af punkter "typography.heading.color":
        // => "typography['heading']['color']"
        if (parts.length >= 2) {
          // Lav resten om til property-kæde
          const subpath = parts
            .slice(1)
            .map((segment) => `['${segment}']`)
            .join("");
          return `${prefix}${subpath}`;
        }
      }
      // Hvis vi ikke finder en definition, lad det stå som originalt
      return match;
    })

    // 3) Erstat generelle strings "foo" med 'foo' (TypeScript string-literals)
    .replace(/"([^"]+)"/g, "'$1'");
}

/**
 * Konverterer en konkret JSON-fil til en .ts-fil
 */
function convertJsonToTs(jsonPath) {
  const relativePath = path.relative(jsonDir, jsonPath);
  const tsPath = path.join(tsDir, relativePath.replace(/\.json$/, ".ts"));
  const moduleName = path.basename(tsPath, ".ts").replace(/-/g, "_");

  fs.readFile(jsonPath, "utf8", (err, data) => {
    if (err) {
      console.error(`❌ Error reading ${jsonPath}:`, err);
      return;
    }

    try {
      const jsonData = JSON.parse(data);

      // Find alle referencer og generer imports
      const references = processTokenReferences(jsonData);
      const imports = generateImports(references, tsPath);

      // Formater JSON-objektet til en TS-const
      const formattedJson = formatJsonForTs(jsonData);
      const tsContent = `${imports}\n\nexport const ${moduleName} = ${formattedJson};`;

      ensureDirectoryExistence(tsPath);

      fs.writeFile(tsPath, tsContent, "utf8", (writeErr) => {
        if (writeErr) {
          console.error(`❌ Error writing ${tsPath}:`, writeErr);
        } else {
          console.log(`✅ Converted: ${jsonPath} → ${tsPath}`);
        }
      });
    } catch (parseError) {
      console.error(`❌ Error parsing JSON in ${jsonPath}:`, parseError);
    }
  });
}

/**
 * Konverterer alle JSON-filer rekursivt fra /json til /ts
 */
function convertAllFiles(dir = jsonDir) {
  // 1) Byg oversigtsmap over tokens, så vi ved hvor de defineres
  buildTokenDefinitionMap();

  // 2) Gennemløb filer og konverter én for én
  fs.readdirSync(dir, { withFileTypes: true }).forEach((dirent) => {
    const fullPath = path.join(dir, dirent.name);
    if (dirent.isDirectory()) {
      convertAllFiles(fullPath);
    } else if (dirent.isFile() && dirent.name.endsWith(".json")) {
      convertJsonToTs(fullPath);
    }
  });
}

// Kør konverteringen
convertAllFiles();
console.log("👀 Watching JSON files in:", jsonDir);