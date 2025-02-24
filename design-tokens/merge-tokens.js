// merge-tokens.js
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const sdTransforms = require('@tokens-studio/sd-transforms');

// URLs to fetch
const urls = [
  'https://e-boks.zeroheight.com/api/token_management/token_set/10617/export?format=style-dictionary&collection_id=22009&mode_id=38483&collection_name=brand&mode_name=eboks',
  'https://e-boks.zeroheight.com/api/token_management/token_set/10617/export?format=style-dictionary&collection_id=22009&mode_id=38484&collection_name=brand&mode_name=postnl',
  'https://e-boks.zeroheight.com/api/token_management/token_set/10617/export?format=style-dictionary&collection_id=22009&mode_id=38485&collection_name=brand&mode_name=nykredit',
  'https://e-boks.zeroheight.com/api/token_management/token_set/10617/export?format=style-dictionary&collection_id=22010&mode_id=38486&collection_name=theme&mode_name=light',
  'https://e-boks.zeroheight.com/api/token_management/token_set/10617/export?format=style-dictionary&collection_id=22010&mode_id=38487&collection_name=theme&mode_name=dark',
  'https://e-boks.zeroheight.com/api/token_management/token_set/10617/export?format=style-dictionary&collection_id=22011&mode_id=38488&collection_name=globals&mode_name=value'
];

// Function to fetch and transform each token set
async function fetchTokens(url) {
  try {
    console.log(`Attempting to fetch from: ${url}`);
    const response = await axios.get(url);
    // Extract the collection and mode from the URL for naming
    const urlParams = new URL(url).searchParams;
    const collection = urlParams.get('collection_name');
    const mode = urlParams.get('mode_name');
    
    console.log(`Successfully fetched ${collection}/${mode} tokens`);
    console.log(`Data sample: ${JSON.stringify(response.data).substring(0, 100)}...`);
    
    // Return the data with metadata
    return {
      data: response.data,
      collection,
      mode
    };
  } catch (error) {
    console.error(`Error fetching from ${url}:`, error.message);
    console.error(`Full error: ${error.stack}`);
    return null;
  }
}

// Main function to fetch all tokens, apply transforms and merge them
async function mergeAllTokens() {
  try {
    console.log('Starting to fetch token sets...');
    
    // Fetch all token sets
    const tokenSets = await Promise.all(urls.map(fetchTokens));
    console.log(`Fetched ${tokenSets.length} token sets in total`);
    
    const validTokenSets = tokenSets.filter(set => set !== null);
    console.log(`${validTokenSets.length} valid token sets out of ${tokenSets.length}`);
    
    if (validTokenSets.length === 0) {
      throw new Error('No valid token sets were fetched');
    }
    
    // Create a merged token structure
    // Instead of merging brands together, we'll create separate outputs for each brand
    const brandModes = validTokenSets.filter(set => set.collection === 'brand').map(set => set.mode);
    console.log(`Found brand modes: ${brandModes.join(', ')}`);
    
    // Get the global and theme tokens
    const globalsTokens = validTokenSets.find(set => set.collection === 'globals')?.data || {};
    const lightThemeTokens = validTokenSets.find(set => set.collection === 'theme' && set.mode === 'light')?.data || {};
    const darkThemeTokens = validTokenSets.find(set => set.collection === 'theme' && set.mode === 'dark')?.data || {};
    
    // Process each brand separately
    for (const brandMode of brandModes) {
      console.log(`Processing brand: ${brandMode}`);
      
      const brandTokens = validTokenSets.find(set => set.collection === 'brand' && set.mode === brandMode)?.data || {};
      
      // Create the merged structure for this brand
      const mergedBrandTokens = {
        globals: globalsTokens,
        brand: brandTokens,
        theme: {
          light: lightThemeTokens,
          dark: darkThemeTokens
        }
      };
      
      // Apply transforms (using the method that works)
      console.log(`Applying transforms for ${brandMode}...`);
      let transformedTokens;
      
      if (typeof sdTransforms === 'function') {
        transformedTokens = sdTransforms(mergedBrandTokens);
      } else if (sdTransforms.default && typeof sdTransforms.default === 'function') {
        transformedTokens = sdTransforms.default(mergedBrandTokens);
      } else if (sdTransforms.transform && typeof sdTransforms.transform === 'function') {
        transformedTokens = sdTransforms.transform(mergedBrandTokens);
      } else {
        console.log('Could not find appropriate transform method. Using merged tokens without transformation.');
        transformedTokens = mergedBrandTokens;
      }
      
      // Save the result for this brand
      const outputDir = path.resolve('./output');
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir);
      }
      
      fs.writeFileSync(
        path.join(outputDir, `${brandMode}-tokens.json`),
        JSON.stringify(transformedTokens, null, 2)
      );
      
      console.log(`Saved tokens for ${brandMode} to ${path.join(outputDir, `${brandMode}-tokens.json`)}`);
    }
    
    // Save the merged and transformed result
    const outputDir = path.resolve('./output');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir);
    }
    
    // Also create a combined file with all brands (for reference)
    const allBrands = {};
    brandModes.forEach(brandMode => {
      const brandData = validTokenSets.find(set => set.collection === 'brand' && set.mode === brandMode)?.data || {};
      allBrands[brandMode] = brandData;
    });
    
    const allTokens = {
      globals: globalsTokens,
      brands: allBrands,
      theme: {
        light: lightThemeTokens,
        dark: darkThemeTokens
      }
    };
    
    fs.writeFileSync(
      path.join(outputDir, 'all-tokens.json'),
      JSON.stringify(allTokens, null, 2)
    );
    
    console.log(`Also saved combined reference file to ${path.join(outputDir, 'all-tokens.json')}`);
    
    console.log('Successfully processed all token sets!');
    console.log(`Output saved to ${outputDir}`);
    
  } catch (error) {
    console.error('Error merging tokens:', error.message);
  }
}

// Run the script
mergeAllTokens();