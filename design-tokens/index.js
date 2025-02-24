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
 * Downgrade Style Dictionary to a version that works with CommonJS
 */
async function downgradeStyleDictionary() {
  console.log("🔄 Downgrading Style Dictionary to compatible version...");
  const { execSync } = await import('child_process');
  
  try {
    execSync('npm uninstall style-dictionary');
    execSync('npm install style-dictionary@3.7.0');
    return true;
  } catch (error) {
    console.error("❗️Error downgrading Style Dictionary:", error);
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

  // Temporarily downgrade Style Dictionary to a compatible version
  await downgradeStyleDictionary();
  
  try {
    // Create a temporary ESM bridge file
    const bridgeFilePath = path.join(__dirname, 'sd-bridge.js');
    const bridgeContent = `
    // ESM bridge for Style Dictionary
    import StyleDictionary from 'style-dictionary';
    import { register } from '@tokens-studio/sd-transforms';
    
    // Register the transforms
    register(StyleDictionary);
    
    // Export a function to build tokens
    export function buildTokens(config) {
      try {
        const dictionary = StyleDictionary.extend(config);
        dictionary.buildAllPlatforms();
        return true;
      } catch (error) {
        console.error('Error in Style Dictionary build:', error);
        return false;
      }
    }
    `;
    
    await fs.writeFile(bridgeFilePath, bridgeContent);
    console.log("✅ Created ESM bridge file");
    
    // Import and use the bridge
    const bridge = await import('./sd-bridge.js');
    const success = bridge.buildTokens(getStyleDictionaryConfig());
    
    if (success) {
      console.log("✅ Merged tokens generated at: build/json/merged-tokens.json");
    } else {
      console.error("❗️Style Dictionary build failed");
    }
    
    // Clean up
    await fs.unlink(bridgeFilePath);
    console.log("✅ Cleaned up bridge file");
    
  } catch (error) {
    console.error("❗️Error running Style Dictionary:", error);
    console.error(error.stack);
  }
})();