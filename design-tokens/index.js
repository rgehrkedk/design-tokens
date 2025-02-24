import { promises as fs } from "fs";
import fetch from "node-fetch";
import path from "path";
import { fileURLToPath } from "url";
import StyleDictionary from "style-dictionary";
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
 * Returns Style Dictionary config
 *
 * @param {string} themeMode - Theme mode (e.g., "light", "dark")
 * @param {string} brandMode - Brand mode (e.g., "eboks", "postnl")
 * @returns {object} Style Dictionary config
 */
function getStyleDictionaryConfig(themeMode, brandMode) {
  const buildDir = [themeMode, brandMode].join("_");

  return {
    source: [
      `json/theme/${themeMode}.json`,
      `json/brand/${brandMode}.json`,
      `json/globals/value.json` // Adding globals
    ],
    platforms: {
      web: {
        transformGroup: "web",
        buildPath: `build/web/${buildDir}/`,
        files: [
          {
            destination: "tokens.css",
            format: "css/variables",
          },
        ],
      },
      ios: {
        transformGroup: "ios",
        buildPath: `build/ios/${buildDir}/`,
        files: [
          {
            destination: "tokens.h",
            format: "ios/macros",
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
  const platforms = ["web", "ios"];

  console.log("\n🚀 Build started...");
  console.log("🎨 Theme Modes:", themeModes);
  console.log("🏢 Brand Modes:", brandModes);
  console.log("🌍 Globals Mode:", globalsModes);

  if (themeModes.length === 0 || brandModes.length === 0 || globalsModes.length === 0) {
    console.error("❗️Missing theme, brand, or global modes, cannot continue.");
    return;
  }

  for (const themeMode of themeModes) {
    for (const brandMode of brandModes) {
      for (const platform of platforms) {
        const themeFile = `json/theme/${themeMode}.json`;
        const brandFile = `json/brand/${brandMode}.json`;
        const globalsFile = `json/globals/value.json`;

        const themeExists = await fileExists(themeFile);
        const brandExists = await fileExists(brandFile);
        const globalsExists = await fileExists(globalsFile);

        if (!themeExists || !brandExists || !globalsExists) {
          console.error(`❗️Missing files: ${themeFile} or ${brandFile} or ${globalsFile}`);
          continue;
        }

        const sd = new StyleDictionary(getStyleDictionaryConfig(themeMode, brandMode));
        sd.buildPlatform(platform);
      }
    }
  }

  console.log("✅ Style Dictionary build completed!");
})();