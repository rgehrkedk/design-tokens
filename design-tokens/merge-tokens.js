// merge-tokens.js
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const StyleDictionary = require('style-dictionary');

// Base URL to fetch list of token URLs - this should be the only thing that needs to change
const STYLE_DICTIONARY_LINKS_URL = 'https://e-boks.zeroheight.com/api/token_management/token_set/10617/style_dictionary_links';

// In case we need to convert hex to HSL manually
function hexToHSL(hex) {
  // Remove the # if present
  hex = hex.replace(/^#/, '');
  
  // Parse the hex values
  let r, g, b;
  if (hex.length === 3) {
    r = parseInt(hex.charAt(0) + hex.charAt(0), 16) / 255;
    g = parseInt(hex.charAt(1) + hex.charAt(1), 16) / 255;
    b = parseInt(hex.charAt(2) + hex.charAt(2), 16) / 255;
  } else {
    r = parseInt(hex.substring(0, 2), 16) / 255;
    g = parseInt(hex.substring(2, 4), 16) / 255;
    b = parseInt(hex.substring(4, 6), 16) / 255;
  }
  
  // Find the min and max values to calculate saturation
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  
  // Calculate lightness
  let l = (max + min) / 2;
  
  // Calculate saturation
  let s = 0;
  if (max !== min) {
    s = l > 0.5 ? (max - min) / (2 - max - min) : (max - min) / (max + min);
  }
  
  // Calculate hue
  let h = 0;
  if (max !== min) {
    if (max === r) {
      h = (g - b) / (max - min) + (g < b ? 6 : 0);
    } else if (max === g) {
      h = (b - r) / (max - min) + 2;
    } else {
      h = (r - g) / (max - min) + 4;
    }
    h /= 6;
  }
  
  // Convert to degrees, and percentages
  h = Math.round(h * 360);
  s = Math.round(s * 100);
  l = Math.round(l * 100);
  
  return `hsl(${h}, ${s}%, ${l}%)`;
}

// Function to recursively convert hex colors in token objects
function convertHexToHSL(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  
  // Handle arrays
  if (Array.isArray(obj)) {
    return obj.map(item => convertHexToHSL(item));
  }
  
  // Create a copy of the object
  const result = {...obj};
  
  // Process each property
  for (const key in result) {
    if (key === 'value' && result['type'] === 'color' && typeof result[key] === 'string' && result[key].startsWith('#')) {
      // Convert hex color values to HSL
      result[key] = hexToHSL(result[key]);
    } else if (typeof result[key] === 'object' && result[key] !== null) {
      // Recursively process nested objects
      result[key] = convertHexToHSL(result[key]);
    }
  }
  
  return result;
}

// Load the sd-transforms package - try different import methods
let sdTransforms;
try {
  // Try the main import first
  sdTransforms = require('@tokens-studio/sd-transforms');
  console.log('SD Transforms imported successfully');
  
  // Check for registration function
  if (typeof sdTransforms.registerTransforms === 'function') {
    sdTransforms.registerTransforms(StyleDictionary);
    console.log('Registered transforms with registerTransforms()');
  } else if (sdTransforms.transformers && typeof sdTransforms.transformers.registerTransforms === 'function') {
    sdTransforms.transformers.registerTransforms(StyleDictionary);
    console.log('Registered transforms with transformers.registerTransforms()');
  } else {
    console.log('Could not find registerTransforms function. Looking for alternative API...');
    
    // Check if the package exports transforms directly
    if (Array.isArray(sdTransforms.transforms)) {
      // Register each transform individually
      sdTransforms.transforms.forEach(transform => {
        if (transform.name && transform.transformer) {
          StyleDictionary.registerTransform(transform);
          console.log(`Registered transform: ${transform.name}`);
        }
      });
    } else {
      console.log('No transforms array found. Using manual HSL conversion.');
    }
  }
} catch (error) {
  console.warn('Error importing sd-transforms:', error.message);
  console.log('Will use manual color conversion instead');
  sdTransforms = null;
}

// Function to fetch the list of token URLs
async function fetchTokenUrls() {
  try {
    console.log(`Fetching token URLs from: ${STYLE_DICTIONARY_LINKS_URL}`);
    const response = await axios.get(STYLE_DICTIONARY_LINKS_URL);
    
    // Based on the ZeroHeight demo script, we need to split by newlines
    if (typeof response.data === 'string') {
      const links = response.data.split('\n').filter(link => link.trim() !== '');
      console.log(`Found ${links.length} token URLs`);
      return links;
    }
    
    throw new Error('Unexpected response format from links endpoint');
  } catch (error) {
    console.error(`Error fetching token URLs: ${error.message}`);
    throw error;
  }
}

// Function to parse collection and mode from a URL
function parseCollectionAndMode(url) {
  try {
    const urlObj = new URL(url);
    const params = urlObj.searchParams;
    
    // Try to get from URL parameters first - this is the most reliable method
    let collection = params.get('collection_name');
    let mode = params.get('mode_name');
    
    if (collection && mode) {
      return { collection, mode };
    }
    
    // If parameters aren't available, we'll use generic detection
    // without any hardcoded brand names or collection types
    
    // Extract collection and mode from path segments if possible
    const urlPath = urlObj.pathname.toLowerCase();
    const urlParts = urlPath.split('/').filter(part => part.length > 0);
    
    // Look for collection or mode indicators in the path or parameters
    // without assuming specific collection or mode names
    for (let i = 0; i < urlParts.length; i++) {
      if (urlParts[i].includes('collection')) {
        collection = urlParts[i+1] || 'unknown-collection';
      }
      if (urlParts[i].includes('mode')) {
        mode = urlParts[i+1] || 'unknown-mode';
      }
    }
    
    // If we still don't have values, use generic identifiers
    if (!collection) {
      collection = `collection-${params.get('collection_id') || 'unknown'}`;
    }
    
    if (!mode) {
      mode = `mode-${params.get('mode_id') || 'unknown'}`;
    }
    
    return { collection, mode };
  } catch (error) {
    console.warn(`Error parsing collection and mode from URL: ${url}`);
    return { collection: 'unknown', mode: 'unknown' };
  }
}

// Function to infer collection and mode from token data
function inferCollectionAndMode(data, url) {
  // Try to detect collection type from data structure
  let collection = 'unknown';
  let mode = 'unknown';
  
  // Extract any hints from the URL
  const urlString = url.toLowerCase();
  
  // Check for typical structures in each collection type
  if (data.colors?.brand) {
    collection = 'brand';
    
    // Try to extract mode from URL without hardcoding specific brand names
    // This extracts whatever mode name appears in the URL
    const modeMatch = urlString.match(/[&?]mode_name=([^&]+)/i);
    if (modeMatch && modeMatch[1]) {
      mode = modeMatch[1];
    }
  } else if (data.bg?.brand) {
    collection = 'theme';
    
    // Check if it's light or dark theme generically
    if (urlString.includes('light')) {
      mode = 'light';
    } else if (urlString.includes('dark')) {
      mode = 'dark';
    }
    
    // Also check if the data has a mode property
    if (data.bg?.mode) {
      mode = data.bg.mode;
    }
  } else if (data.colors) {
    collection = 'globals';
    mode = 'value'; // Default for globals
    
    // Look for mode in URL
    const modeMatch = urlString.match(/[&?]mode_name=([^&]+)/i);
    if (modeMatch && modeMatch[1]) {
      mode = modeMatch[1];
    }
  }
  
  return { collection, mode };
}

// Function to fetch and classify each token set
async function fetchTokens(url) {
  try {
    console.log(`Fetching from: ${url}`);
    const response = await axios.get(url);
    
    // First try to get collection and mode from URL
    let { collection, mode } = parseCollectionAndMode(url);
    
    // If we couldn't determine from URL, try to infer from the data
    if (collection === 'unknown' || mode === 'unknown' || 
        collection.startsWith('collection-') || mode.startsWith('mode-')) {
      const inferred = inferCollectionAndMode(response.data, url);
      
      if (collection === 'unknown' || collection.startsWith('collection-')) {
        collection = inferred.collection;
      }
      
      if (mode === 'unknown' || mode.startsWith('mode-')) {
        mode = inferred.mode;
      }
      
      console.log(`Inferred collection "${collection}" and mode "${mode}" from data and URL`);
    } else {
      console.log(`Parsed collection "${collection}" and mode "${mode}" from URL`);
    }
    
    return {
      data: response.data,
      collection,
      mode,
      url // Keep the URL for reference
    };
  } catch (error) {
    console.error(`Error fetching from ${url}:`, error.message);
    return null;
  }
}

// Function to apply Style Dictionary transforms
function transformWithStyleDictionary(tokens, brandMode) {
  try {
    // Create a temporary file to store the tokens
    const tempDir = path.resolve('./temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir);
    }
    
    const tempFile = path.join(tempDir, `${brandMode}-tokens-temp.json`);
    fs.writeFileSync(tempFile, JSON.stringify(tokens, null, 2));
    
    // Create Style Dictionary config - with fallbacks if sd-transforms isn't available
    const sdConfig = {
      source: [tempFile],
      platforms: {
        json: {
          // If sd-transforms was loaded, try to use tokens-studio transformGroup
          // Otherwise use a simple color-hsl transform
          transformGroup: sdTransforms ? 'tokens-studio' : undefined,
          transforms: sdTransforms ? [
            'ts/color/modifiers',
            'ts/size/px',
            'ts/opacity',
            'ts/size/lineheight',
            'ts/typography/fontWeight',
            'ts/resolveMath',
            'ts/size/css/letterspacing',
            'ts/typography/css/fontFamily',
            'ts/typography/css/shorthand',
            'ts/border/css/shorthand',
            'ts/shadow/css/shorthand',
            'ts/color/css/hexrgba',
            'ts/color/css/hsl', // Use HSL format for colors
            'name/cti/kebab'
          ] : [
            // Fallback transform will be registered separately
            'color/css/hsl'
          ],
          buildPath: path.resolve('./output/') + '/',
          files: [
            {
              destination: `${brandMode}-tokens.json`,
              format: 'json/nested'
            }
          ]
        }
      }
    };
    
    // If sd-transforms wasn't loaded, register the HSL color transform
    if (!sdTransforms) {
      StyleDictionary.registerTransform({
        name: 'color/css/hsl',
        type: 'value',
        matcher: token => token.type === 'color',
        transformer: token => {
          const hex = token.value.toString();
          return hexToHSL(hex);
        }
      });
    }
    
    // Build with Style Dictionary
    const sd = StyleDictionary.extend(sdConfig);
    sd.buildAllPlatforms();
    
    console.log(`Applied Style Dictionary transforms for ${brandMode}`);
    
    // Clean up temp file
    if (fs.existsSync(tempFile)) {
      fs.unlinkSync(tempFile);
    }
    
    // Return the path to the output file
    return path.resolve(`./output/${brandMode}-tokens.json`);
  } catch (error) {
    console.error(`Error applying Style Dictionary transforms for ${brandMode}:`, error.message);
    
    // Fallback: use simple hexToHSL conversion
    return null;
  }
}

// Function to handle the fallback conversion if Style Dictionary fails
function manuallyTransformTokens(tokens, brandMode) {
  console.log(`Using manual HSL conversion for ${brandMode}`);
  
  // Do manual conversion of hex colors to HSL
  const transformedTokens = convertHexToHSL(tokens);
  
  // Save to file
  const outputFile = path.resolve(`./output/${brandMode}-tokens.json`);
  fs.writeFileSync(outputFile, JSON.stringify(transformedTokens, null, 2));
  
  return outputFile;
}

// Main function to process all tokens
async function processTokens() {
  try {
    // Get the token URLs
    const tokenUrls = await fetchTokenUrls();
    console.log('Starting to fetch and process token sets...');
    
    // Fetch all token sets
    const tokenSets = [];
    for (const url of tokenUrls) {
      const tokenSet = await fetchTokens(url);
      if (tokenSet) tokenSets.push(tokenSet);
    }
    
    console.log(`Successfully fetched ${tokenSets.length} token sets`);
    
    if (tokenSets.length === 0) {
      throw new Error('No valid token sets were fetched');
    }
    
    // Group by collection and mode
    const collections = {};
    tokenSets.forEach(set => {
      if (!collections[set.collection]) {
        collections[set.collection] = {};
      }
      collections[set.collection][set.mode] = set.data;
    });
    
    console.log('Collections found:', Object.keys(collections).join(', '));
    
    // Create output directory
    const outputDir = path.resolve('./output');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir);
    }
    
    // Process brand-specific outputs
    if (collections.brand) {
      const brandModes = Object.keys(collections.brand);
      console.log(`Processing ${brandModes.length} brands: ${brandModes.join(', ')}`);
      
      // For each brand, create a merged token set with globals and theme
      for (const brandMode of brandModes) {
        console.log(`Creating tokens for brand: ${brandMode}`);
        
        const brandTokens = collections.brand[brandMode];
        const globalsTokens = collections.globals?.value || {};
        const themeTokens = {
          light: collections.theme?.light || {},
          dark: collections.theme?.dark || {}
        };
        
        // Merge tokens for this brand
        const mergedTokens = {
          globals: globalsTokens,
          brand: brandTokens,
          theme: themeTokens
        };
        
        // Apply Style Dictionary transforms
        console.log(`Applying transforms for ${brandMode}...`);
        
        // Try Style Dictionary first
        const outputPath = transformWithStyleDictionary(mergedTokens, brandMode);
        
        // If Style Dictionary failed, use manual transformation
        if (!outputPath) {
          const manualOutputPath = manuallyTransformTokens(mergedTokens, brandMode);
          console.log(`Saved ${brandMode} tokens to ${manualOutputPath} (manual conversion)`);
        } else {
          console.log(`Saved ${brandMode} tokens to ${outputPath}`);
        }
      }
      
      // Also create a combined reference file
      const allTokens = {
        globals: collections.globals?.value || {},
        brands: collections.brand,
        theme: {
          light: collections.theme?.light || {},
          dark: collections.theme?.dark || {}
        }
      };
      
      // Convert colors in the combined file too
      const transformedAllTokens = convertHexToHSL(allTokens);
      
      fs.writeFileSync(
        path.join(outputDir, 'all-tokens.json'),
        JSON.stringify(transformedAllTokens, null, 2)
      );
      
      console.log(`Saved combined reference to ${path.join(outputDir, 'all-tokens.json')}`);
    } else {
      // If no brand collections were found, just save what we have
      console.log('No brand collections found. Saving all collections as-is.');
      
      // Convert colors in this file too
      const transformedCollections = convertHexToHSL(collections);
      
      fs.writeFileSync(
        path.join(outputDir, 'all-tokens.json'),
        JSON.stringify(transformedCollections, null, 2)
      );
      
      console.log(`Saved all tokens to ${path.join(outputDir, 'all-tokens.json')}`);
    }
    
    console.log('Token processing completed successfully!');
    
  } catch (error) {
    console.error('Error processing tokens:', error.message);
    process.exit(1); // Exit with error code
  }
}

// Run the main function
processTokens();