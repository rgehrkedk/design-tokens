import { promises as fs } from "fs";
import fetch from "node-fetch";
import path from "path";
import { fileURLToPath } from "url";
import { extractCollectionAndMode, extractCollectionModes } from "./utils.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const styleDictionaryURL =
  "https://e-boks.zeroheight.com/api/token_management/token_set/10617/style_dictionary_links";

/**
 * Fetches links for each collection and mode
 *
 * @returns {string[]} list of URLs for each collection and mode
 */
async function fetchLinks() {
  try {
    const response = await fetch(styleDictionaryURL);
    if (!response.ok) throw new Error(`Failed to fetch links: ${response.statusText}`);

    const textResponse = await response.text();
    const links = textResponse.split("\n").filter(link => link.trim() !== ""); // Remove empty lines

    console.log("✅ Links fetched:", links);
    return links;
  } catch (error) {
    console.error("❗️Error fetching links:", error);
    return [];
  }
}

/**
 * Iterates links, fetches Style Dictionary JSON files, and saves them
 *
 * @param {string[]} links
 */
async function saveFiles(links) {
  try {
    for (const link of links) {
      const response = await fetch(link);
      if (!response.ok) throw new Error(`Failed to fetch JSON from ${link}: ${response.statusText}`);

      const jsonData = await response.json();
      const [collection, mode] = extractCollectionAndMode(link);

      if (!collection || !mode) {
        console.warn(`⚠️ Skipping invalid URL: ${link}`);
        continue;
      }

      const directory = path.join(__dirname, "json", collection);
      await fs.mkdir(directory, { recursive: true });

      const fileName = `${mode}.json`;
      const filePath = path.join(directory, fileName);
      await fs.writeFile(filePath, JSON.stringify(jsonData, null, 2));

      console.log(`✅ Saved: ${filePath}`);
    }
  } catch (error) {
    console.error("❗️Error saving files:", error);
  }
}

/**
 * Returns Style Dictionary config with the correct token order
 * for proper reference resolution:
 * 1. globals (foundational values)
 * 2. brand (brand-specific tokens that might reference globals)
 * 3. theme (context-specific tokens that might reference globals and brand)
 *
 * @returns {object} Style Dictionary config
 */
function getStyleDictionaryConfig() {
  return {
    source: [
      "json/globals/*.json", // Globals first - foundational tokens
      "json/brand/*.json",   // Brand second - might reference globals
      "json/theme/*.json",   // Theme last - might reference both globals and brand
    ],
    platforms: {
      json: {
        // Use standard JSON format without tokens-studio transforms
        buildPath: "build/json/",
        files: [
          {
            destination: "merged-tokens.json",
            format: "json",
          },
        ],
      },
    },
  };
}

/**
 * Checks if a file exists (Async alternative to fs.existsSync)
 *
 * @param {string} filePath
 * @returns {Promise<boolean>}
 */
async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Custom StyleDictionary implementation since direct imports are problematic
 * @param {Object} config - Style Dictionary config object
 */
async function buildStyleDictionary(config) {
  // Create build directory
  await fs.mkdir(path.join(__dirname, config.platforms.json.buildPath), { recursive: true });
  
  // Get all source files
  let allTokens = {};
  
  // Process source files in the specified order for proper reference resolution
  for (const sourceGlob of config.source) {
    const directory = path.dirname(sourceGlob);
    const files = await fs.readdir(directory);
    
    for (const file of files) {
      if (file.endsWith('.json')) {
        const filePath = path.join(directory, file);
        const content = await fs.readFile(filePath, 'utf8');
        
        try {
          const tokens = JSON.parse(content);
          // Merge tokens into allTokens
          allTokens = { ...allTokens, ...tokens };
        } catch (e) {
          console.error(`❗️Error parsing ${filePath}: ${e.message}`);
        }
      }
    }
  }
  
  // Write output file
  const outputPath = path.join(__dirname, config.platforms.json.buildPath, 
                               config.platforms.json.files[0].destination);
  
  await fs.writeFile(outputPath, JSON.stringify(allTokens, null, 2));
  console.log(`✅ Built tokens at: ${outputPath}`);
  
  return true;
}

/**
 * Main function that builds tokens
 */
(async () => {
  const links = await fetchLinks();
  if (!links.length) {
    console.error("❗️No links found, exiting...");
    return;
  }

  await saveFiles(links);

  const collectionModes = extractCollectionModes(links);
  console.log("✅ Collection modes extracted:", collectionModes);

  // Note the correct ordering here for proper reference resolution
  const globalsModes = collectionModes.globals || [];
  const brandModes = collectionModes.brand || [];
  const themeModes = collectionModes.theme || [];

  console.log("\n🚀 Build started...");
  console.log("🌍 Globals Mode:", globalsModes);  // Globals first
  console.log("🏢 Brand Modes:", brandModes);     // Brand second
  console.log("🎨 Theme Modes:", themeModes);     // Theme last

  // Ensure that required files exist
  const globalsFile = "json/globals/value.json";
  const globalsExists = await fileExists(globalsFile);

  if (themeModes.length === 0 || brandModes.length === 0 || !globalsExists) {
    console.error("❗️Missing theme, brand, or global modes, cannot continue.");
    return;
  }

  try {
    // Run custom Style Dictionary build without requiring the actual package
    const config = getStyleDictionaryConfig();
    await buildStyleDictionary(config);
  } catch (error) {
    console.error("❗️Error building tokens:", error);
    console.error(error.stack);
  }
})();