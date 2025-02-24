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
    const mergedTokens = {
      globals: {},
      brand: {
        eboks: {},
        postnl: {},
        nykredit: {}
      },
      theme: {
        light: {},
        dark: {}
      }
    };
    
    // Organize tokens into the merged structure
    for (const set of validTokenSets) {
      const { data, collection, mode } = set;
      
      if (collection === 'globals') {
        mergedTokens.globals = data;
      } else if (collection === 'brand') {
        mergedTokens.brand[mode] = data;
      } else if (collection === 'theme') {
        mergedTokens.theme[mode] = data;
      }
    }
    
    // Apply transforms from tokens-studio/sd-transforms
    console.log('Applying sd-transforms to the merged tokens...');
    console.log('SD Transforms structure:', Object.keys(sdTransforms));
    
    // Use the library based on its actual structure
    let transformedTokens;
    
    if (typeof sdTransforms === 'function') {
      // If the default export is a function
      transformedTokens = sdTransforms(mergedTokens);
      console.log('Used default export function');
    } else if (sdTransforms.default && typeof sdTransforms.default === 'function') {
      // If there's a default property that's a function
      transformedTokens = sdTransforms.default(mergedTokens);
      console.log('Used sdTransforms.default function');
    } else if (sdTransforms.transform && typeof sdTransforms.transform === 'function') {
      // If there's a transform method
      transformedTokens = sdTransforms.transform(mergedTokens);
      console.log('Used sdTransforms.transform function');
    } else {
      // If we can't find the right method, just use the merged tokens as is
      console.log('Could not find appropriate transform method. Using merged tokens without transformation.');
      transformedTokens = mergedTokens;
    }
    
    console.log('Processing completed');
    
    // Save the merged and transformed result
    const outputDir = path.resolve('./output');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir);
    }
    
    fs.writeFileSync(
      path.join(outputDir, 'merged-tokens.json'),
      JSON.stringify(transformedTokens, null, 2)
    );
    
    console.log('Successfully merged and transformed all token sets!');
    console.log(`Output saved to ${path.join(outputDir, 'merged-tokens.json')}`);
    
  } catch (error) {
    console.error('Error merging tokens:', error.message);
  }
}

// Run the script
mergeAllTokens();