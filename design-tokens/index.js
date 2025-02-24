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
 * Manually merge all tokens into a single file
 * 
 * @param {Object} options - Options object
 * @param {string[]} options.themeModes - List of theme modes
 * @param {string[]} options.brandModes - List of brand modes 
 * @param {string[]} options.globalsModes - List of globals modes
 */
async function manuallyMergeTokens({ themeModes, brandModes, globalsModes }) {
  try {
    // Create build directory
    const buildPath = path.join(__dirname, "build", "json");
    await fs.mkdir(buildPath, { recursive: true });
    
    const mergedTokens = {};
    
    // Load and merge theme files
    for (const mode of themeModes) {
      const filePath = path.join(__dirname, "json", "theme", `${mode}.json`);
      const content = await fs.readFile(filePath, "utf8");
      const tokens = JSON.parse(content);
      
      // Add tokens to merged object
      Object.assign(mergedTokens, tokens);
    }
    
    // Load and merge brand files
    for (const mode of brandModes) {
      const filePath = path.join(__dirname, "json", "brand", `${mode}.json`);
      const content = await fs.readFile(filePath, "utf8");
      const tokens = JSON.parse(content);
      
      // Add tokens to merged object
      Object.assign(mergedTokens, tokens);
    }
    
    // Load and merge globals files
    for (const mode of globalsModes) {
      const filePath = path.join(__dirname, "json", "globals", `${mode}.json`);
      const content = await fs.readFile(filePath, "utf8");
      const tokens = JSON.parse(content);
      
      // Add tokens to merged object
      Object.assign(mergedTokens, tokens);
    }
    
    // Save merged tokens
    const outputPath = path.join(buildPath, "merged-tokens.json");
    await fs.writeFile(outputPath, JSON.stringify(mergedTokens, null, 2));
    
    console.log(`✅ Manually merged tokens saved to: ${outputPath}`);
    return true;
  } catch (error) {
    console.error("❗️Error merging tokens:", error);
    return false;
  }
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

  const brandModes = collectionModes.brand || [];
  const themeModes = collectionModes.theme || [];
  const globalsModes = collectionModes.globals || [];

  console.log("\n🚀 Build started...");
  console.log("🎨 Theme Modes:", themeModes);
  console.log("🏢 Brand Modes:", brandModes);
  console.log("🌍 Globals Mode:", globalsModes);

  // Ensure that at least one global token file exists
  const globalsFile = "json/globals/value.json";
  const globalsExists = await fileExists(globalsFile);

  if (themeModes.length === 0 || brandModes.length === 0 || !globalsExists) {
    console.error("❗️Missing theme, brand, or global modes, cannot continue.");
    return;
  }

  // Skip Style Dictionary entirely and just manually merge the tokens
  await manuallyMergeTokens({ themeModes, brandModes, globalsModes });
})();