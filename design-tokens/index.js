import { promises as fs } from "fs";
import fetch from "node-fetch";
import path from "path";
import { fileURLToPath } from "url";
import { extractCollectionAndMode, extractCollectionModes } from "./utils.js";
import { createRequire } from "module";

// Use createRequire for importing Style Dictionary in ESM context
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
    // Create the CJS bridge file
    const bridgeFilePath = path.join(__dirname, 'sd-bridge.cjs');
    const bridgeContent = `
    // This is a CommonJS bridge file for Style Dictionary
    const StyleDictionary = require('style-dictionary');
    const TokenStudioTransforms = require('@tokens-studio/sd-transforms');

    // Register the tokens-studio transforms to Style Dictionary
    TokenStudioTransforms.register(StyleDictionary);

    // Export a function to build tokens using Style Dictionary
    module.exports = function buildTokens(config) {
      try {
        // Create Style Dictionary instance
        const styleDictionary = StyleDictionary.extend(config);
        
        // Build all platforms
        styleDictionary.buildAllPlatforms();
        
        return true;
      } catch (error) {
        console.error('Error in Style Dictionary build:', error);
        return false;
      }
    };
    `;
    
    await fs.writeFile(bridgeFilePath, bridgeContent);
    console.log("✅ Created CommonJS bridge file for Style Dictionary");
    
    // Create package.json that marks sd-bridge.cjs as CommonJS
    const packageJsonPath = path.join(__dirname, 'package-temp.json');
    const packageJsonContent = {
      "name": "style-dictionary-bridge",
      "version": "1.0.0",
      "type": "module",
      "imports": {
        "#internal/bridge": "./sd-bridge.cjs"
      }
    };
    
    await fs.writeFile(packageJsonPath, JSON.stringify(packageJsonContent, null, 2));
    console.log("✅ Created temporary package.json for module resolution");
    
    // Use the bridge
    try {
      const buildTokens = require('./sd-bridge.cjs');
      const success = buildTokens(getStyleDictionaryConfig());
      
      if (success) {
        console.log("✅ Merged tokens generated at: build/json/merged-tokens.json");
      } else {
        console.error("❗️Style Dictionary build failed");
      }
    } catch (error) {
      console.error("❗️Error running Style Dictionary:", error);
    }
    
    // Clean up
    try {
      await fs.unlink(bridgeFilePath);
      await fs.unlink(packageJsonPath);
      console.log("✅ Cleaned up temporary files");
    } catch (cleanupError) {
      console.warn("⚠️ Could not clean up temporary files:", cleanupError);
    }
  } catch (error) {
    console.error("❗️Error in main process:", error);
    console.error(error.stack);
  }
})();