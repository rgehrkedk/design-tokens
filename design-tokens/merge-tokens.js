// merge-tokens.js
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const sdTransforms = require('@tokens-studio/sd-transforms');

// Base URL to fetch list of token URLs - this should be the only thing that needs to change
const STYLE_DICTIONARY_LINKS_URL = 'https://e-boks.zeroheight.com/api/token_management/token_set/10617/style_dictionary_links';

// Function to fetch the list of token URLs
async function fetchTokenUrls() {
  try {
    console.log(`Fetching token URLs from: ${STYLE_DICTIONARY_LINKS_URL}`);
    const response = await axios.get(STYLE_DICTIONARY_LINKS_URL);
    
    // Parse the response as newline-separated URLs
    if (typeof response.data === 'string') {
      const links = response.data.split('\n').filter(link => link.trim() !== '');
      console.log(`Found ${links.length} token URLs`);
      
      if (links.length === 0) {
        throw new Error('No URLs found in the response');
      }
      
      return links;
    } else {
      throw new Error(`Unexpected response format: ${typeof response.data}`);
    }
  } catch (error) {
    console.error(`Error fetching token URLs: ${error.message}`);
    throw error; // Re-throw to handle in the main function
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

// Apply the appropriate transform method
function applyTransforms(tokens) {
  if (typeof sdTransforms === 'function') {
    return sdTransforms(tokens);
  } else if (sdTransforms.default && typeof sdTransforms.default === 'function') {
    return sdTransforms.default(tokens);
  } else if (sdTransforms.transform && typeof sdTransforms.transform === 'function') {
    return sdTransforms.transform(tokens);
  } else {
    console.log('No transform method found in sd-transforms. Using tokens without transformation.');
    return tokens;
  }
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
        
        // Apply transforms
        console.log(`Applying transforms for ${brandMode}...`);
        const transformedTokens = applyTransforms(mergedTokens);
        
        // Save to file
        fs.writeFileSync(
          path.join(outputDir, `${brandMode}-tokens.json`),
          JSON.stringify(transformedTokens, null, 2)
        );
        
        console.log(`Saved ${brandMode} tokens to ${path.join(outputDir, `${brandMode}-tokens.json`)}`);
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
      
      fs.writeFileSync(
        path.join(outputDir, 'all-tokens.json'),
        JSON.stringify(allTokens, null, 2)
      );
      
      console.log(`Saved combined reference to ${path.join(outputDir, 'all-tokens.json')}`);
    } else {
      // If no brand collections were found, just save what we have
      console.log('No brand collections found. Saving all collections as-is.');
      
      fs.writeFileSync(
        path.join(outputDir, 'all-tokens.json'),
        JSON.stringify(collections, null, 2)
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