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
    /** styleDictionaryURL value is generated per a token set at zeroheight.
     *
     * If you generate a private link, you need to generate access token and add additional headers to the request
     * X-API-CLIENT
     * X-API-KEY
     *
     * Learn more: https://zeroheight.com/help/article/documenting-figma-color-variables/
     */
    const response = await fetch(styleDictionaryURL);
    const textResponse = await response.text();
    const links = textResponse.split("\n");

    return links;
  } catch (error) {
    console.error("❗️Error fetching links:", error);
  }
}

/**
 * Iterates links, fetches Style Dictionary JSON files and saves them
 *
 * @param {string[]} links
 */
async function saveFiles(links) {
  try {
    for (const link of links) {
      const response = await fetch(link);

      if (!response.ok) {
        throw new Error(`Failed to fetch from ${link}: ${response.statusText}`);
      }

      const jsonData = await response.json();

      const [collection, mode] = extractCollectionAndMode(link);
      const directory = path.join(__dirname, "json", collection);

      await fs.mkdir(directory, { recursive: true });

      const fileName = `${mode}.json`;
      const filePath = path.join(directory, fileName);

      await fs.writeFile(filePath, JSON.stringify(jsonData, null, 2));
    }
  } catch (error) {
    console.error("❗️Error:", error);
  }
}

/**
 * Returns Style Dictionary config
 *
 * @param {string} mode1
 * @param {string} mode2
 * @returns {json} Style Dictionary config
 */
function getStyleDictionaryConfig(mode1, mode2) {
  const buildDir = [mode1, mode2].join("_");

  return {
    source: [`json/theme/${mode1}.json`, `json/brand/${mode2}.json`],
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
 * Main function that builds tokens
 */
(async () => {
  const links = await fetchLinks();
  
  if (!links || links.length === 0) {
    console.error("❗️No links found");
    return;
  }
  
  console.log("Links found:", links); // Add this debug line
  
  await saveFiles(links);

  const collectionModes = extractCollectionModes(links);
  console.log("Collection modes:", collectionModes); // Add this debug line
  
  // Check if collections exist
  if (!collectionModes || !collectionModes.brand) {
    console.error("❗️No token collections found");
    return;
  }

  const tokensCollectionModes = collectionModes.brand || [];
  const primitivesCollectionModes = collectionModes.theme || [];
  const platforms = ["web", "ios"];

  console.log("\n🚀 Build started...");
  console.log("Token modes:", tokensCollectionModes);
  console.log("Primitive modes:", primitivesCollectionModes);

  if (tokensCollectionModes.length > 0) {
    tokensCollectionModes.forEach((m1) => {
      primitivesCollectionModes.forEach((m2) => {
        platforms.forEach((platform) => {
          const sd = new StyleDictionary(getStyleDictionaryConfig(m1, m2));
          sd.buildPlatform(platform);
        });
      });
    });
  }
})();
