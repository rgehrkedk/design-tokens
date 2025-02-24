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
    // Now let's use Style Dictionary
    const StyleDictionary = (await import('style-dictionary')).default;
    
    // Define config in proper order
    const config = {
      source: [
        "json/globals/*.json", // Globals first
        "json/brand/*.json",   // Brand second
        "json/theme/*.json",   // Theme last
      ],
      platforms: {
        json: {
          // We can't use tokens-studio transform due to ESM/CommonJS issues
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
    
    // Try to extend Style Dictionary or use direct Core API
    try {
      console.log("Trying to extend Style Dictionary...");
      const sd = StyleDictionary.extend(config);
      sd.buildAllPlatforms();
      console.log("✅ Tokens built with Style Dictionary");
    } catch (extendError) {
      console.error("❗️Error extending Style Dictionary:", extendError);
      
      // Fallback: direct merge without Style Dictionary
      console.log("Falling back to direct merge...");
      await mergeTokensManually(config);
    }
  } catch (error) {
    console.error("❗️Error:", error);
    
    // Final fallback: direct merge without Style Dictionary
    console.log("Falling back to direct merge...");
    await mergeTokensManually({
      source: [
        "json/globals/*.json",
        "json/brand/*.json",
        "json/theme/*.json",
      ],
      platforms: {
        json: {
          buildPath: "build/json/",
          files: [
            { destination: "merged-tokens.json" }
          ]
        }
      }
    });
  }
})();

/**
 * Manually merge tokens without Style Dictionary if all else fails
 */
async function mergeTokensManually(config) {
  try {
    // Create build directory
    const buildPath = path.join(__dirname, config.platforms.json.buildPath);
    await fs.mkdir(buildPath, { recursive: true });
    
    const mergedTokens = {};
    
    // Process files in the specified order
    for (const sourceGlob of config.source) {
      const folderPath = path.dirname(sourceGlob);
      const pattern = path.basename(sourceGlob);
      const extension = path.extname(pattern);
      
      try {
        const files = await fs.readdir(folderPath);
        for (const file of files) {
          if (file.endsWith(extension)) {
            const filePath = path.join(folderPath, file);
            console.log(`Processing ${filePath}`);
            
            const content = await fs.readFile(filePath, 'utf8');
            const tokens = JSON.parse(content);
            
            // Deep merge tokens
            Object.assign(mergedTokens, tokens);
          }
        }
      } catch (readError) {
        console.error(`❗️Error reading ${folderPath}:`, readError);
      }
    }
    
    // Write output file
    const outputPath = path.join(buildPath, config.platforms.json.files[0].destination);
    await fs.writeFile(outputPath, JSON.stringify(mergedTokens, null, 2));
    console.log(`✅ Manually merged tokens saved to: ${outputPath}`);
    
    return true;
  } catch (error) {
    console.error("❗️Error merging tokens manually:", error);
    return false;
  }
}