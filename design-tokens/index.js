import { promises as fs } from "fs";
import fetch from "node-fetch";
import path from "path";
import { fileURLToPath } from "url";
import { extractCollectionAndMode, extractCollectionModes } from "./utils.js";
import { execSync } from "child_process";

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
 * Temporarily modify package.json to allow CommonJS execution
 */
async function setupCommonJS() {
  const packageJsonPath = path.join(__dirname, 'package.json');
  
  // Read current package.json
  const packageJsonContent = await fs.readFile(packageJsonPath, 'utf8');
  const originalPackageJson = JSON.parse(packageJsonContent);
  
  // Save original for later restoration
  await fs.writeFile(
    path.join(__dirname, '.package.json.bak'), 
    packageJsonContent
  );
  
  // Modify package.json to use CommonJS
  const commonJSPackage = {
    ...originalPackageJson,
    type: "commonjs" // Change to CommonJS
  };
  
  // Write modified package.json
  await fs.writeFile(
    packageJsonPath, 
    JSON.stringify(commonJSPackage, null, 2)
  );
  
  return true;
}

/**
 * Restore original package.json
 */
async function restorePackageJson() {
  const packageJsonPath = path.join(__dirname, 'package.json');
  const backupPath = path.join(__dirname, '.package.json.bak');
  
  // Read backup
  const originalContent = await fs.readFile(backupPath, 'utf8');
  
  // Restore original
  await fs.writeFile(packageJsonPath, originalContent);
  
  // Remove backup
  await fs.unlink(backupPath);
  
  return true;
}

/**
 * Create CommonJS build script
 */
async function createBuildScript() {
  const scriptPath = path.join(__dirname, 'build-tokens.cjs');
  const scriptContent = `
// build-tokens.cjs
// This file MUST use .cjs extension to be treated as CommonJS

const fs = require('fs');
const path = require('path');
const StyleDictionary = require('style-dictionary');
const { register } = require('@tokens-studio/sd-transforms');

// Register tokens-studio transforms
register(StyleDictionary);

/**
 * Returns Style Dictionary config with the correct token order
 * for proper reference resolution:
 * 1. globals (foundational values)
 * 2. brand (brand-specific tokens that might reference globals)
 * 3. theme (context-specific tokens that might reference globals and brand)
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

// Create Style Dictionary instance
const config = getStyleDictionaryConfig();
const SD = StyleDictionary.extend(config);

// Build all platforms
try {
  SD.buildAllPlatforms();
  console.log("✅ Tokens built successfully with Style Dictionary transformations");
} catch (error) {
  console.error("❗️Error building tokens:", error);
}`;

  await fs.writeFile(scriptPath, scriptContent);
  return scriptPath;
}

/**
 * Run the CommonJS build script
 */
function runBuildScript(scriptPath) {
  try {
    execSync(`node ${scriptPath}`, { stdio: 'inherit' });
    return true;
  } catch (error) {
    console.error('❗️Error running build script:', error);
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
    console.log("🔄 Setting up CommonJS environment...");
    await setupCommonJS();
    
    console.log("🔄 Creating build script...");
    const scriptPath = await createBuildScript();
    
    console.log("🔄 Running Style Dictionary with transforms...");
    const buildSuccess = runBuildScript(scriptPath);
    
    if (buildSuccess) {
      console.log("✅ Tokens built successfully with all transformations applied");
    }
    
    console.log("🔄 Restoring ESM environment...");
    await restorePackageJson();
    
    console.log("🔄 Cleaning up build script...");
    await fs.unlink(scriptPath);
    
    console.log("✅ Process completed");
  } catch (error) {
    console.error("❗️Error in build process:", error);
    
    // Attempt to restore package.json even if there was an error
    try {
      await restorePackageJson();
      console.log("✅ Package.json restored after error");
    } catch (restoreError) {
      console.error("❗️Error restoring package.json:", restoreError);
    }
  }
})();