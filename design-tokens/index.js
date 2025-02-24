import { promises as fs } from "fs";
import fetch from "node-fetch";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";
import { extractCollectionAndMode, extractCollectionModes } from "./utils.js";

// Create a require function to import CommonJS modules
const require = createRequire(import.meta.url);

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
 * Returns Style Dictionary config
 *
 * @returns {object} Style Dictionary config to merge all tokens into one JSON file
 */
function getStyleDictionaryConfig() {
  return {
    source: [
      "json/theme/*.json",
      "json/brand/*.json",
      "json/globals/*.json",
    ],
    platforms: {
      json: {
        transformGroup: "tokens-studio", // Apply the tokens-studio transformation
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

  try {
    // Create the bridge file
    const bridgeFilePath = path.join(__dirname, 'sd-bridge.cjs');
    const bridgeContent = `
    const StyleDictionary = require('style-dictionary');
    const transforms = require('@tokens-studio/sd-transforms');

    // Register transforms
    transforms.register(StyleDictionary);

    // Export what we need
    module.exports = {
      // Create a function that builds tokens
      buildTokens: function(config) {
        const dictionary = StyleDictionary.extend(config);
        dictionary.buildAllPlatforms();
        return true;
      }
    };
    `;
    await fs.writeFile(bridgeFilePath, bridgeContent);
    console.log("✅ Created CommonJS bridge file");

    // Use the bridge to build tokens
    const config = getStyleDictionaryConfig();
    const sdBridge = require('./sd-bridge.cjs');
    
    sdBridge.buildTokens(config);
    console.log("✅ Merged tokens generated at: build/json/merged-tokens.json");
    
    // Clean up the bridge file
    await fs.unlink(bridgeFilePath);
    console.log("✅ Cleaned up bridge file");
  } catch (error) {
    console.error("❗️Error building tokens:", error);
    console.error("Stack trace:", error.stack);
  }
})();