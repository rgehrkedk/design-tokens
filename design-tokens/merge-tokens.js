// merge-tokens.js
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const sdTransforms = require('@tokens-studio/sd-transforms');

// Base URL to fetch list of token URLs
const STYLE_DICTIONARY_LINKS_URL = 'https://e-boks.zeroheight.com/api/token_management/token_set/10617/style_dictionary_links';

// Function to fetch the list of token URLs
async function fetchTokenUrls() {
  try {
    console.log(`Fetching token URLs from: ${STYLE_DICTIONARY_LINKS_URL}`);
    const response = await axios.get(STYLE_DICTIONARY_LINKS_URL);
    
    // Log what we got back for debugging
    console.log('Response type:', typeof response.data);
    console.log('Response preview:', typeof response.data === 'string' 
      ? response.data.substring(0, 200) + '...' 
      : JSON.stringify(response.data).substring(0, 200) + '...');
    
    // Handle plain text response with URLs
    if (typeof response.data === 'string') {
      // Extract URLs using regex - this will find all URLs in the response
      const urlRegex = /(https?:\/\/[^\s"'<>]+)/g;
      const matches = response.data.match(urlRegex);
      
      if (matches && matches.length > 0) {
        // Filter to only include style dictionary URLs
        const styleUrls = matches.filter(url => 
          url.includes('format=style-dictionary') || 
          url.includes('token_set') || 
          url.includes('export')
        );
        
        if (styleUrls.length > 0) {
          console.log(`Found ${styleUrls.length} token URLs using regex`);
          return styleUrls;
        }
      }
      
      // If no matches found with regex, check if it's a direct URL
      if (response.data.trim().startsWith('http') && 
          (response.data.includes('format=style-dictionary') || 
           response.data.includes('token_set'))) {
        // Split by newlines in case there are multiple URLs
        const urls = response.data.trim().split(/\r?\n/).filter(line => 
          line.trim().startsWith('http')
        );
        
        if (urls.length > 0) {
          console.log(`Found ${urls.length} token URLs by line splitting`);
          return urls;
        }
      }
    }
    
    // If we're here, try to parse as JSON
    if (typeof response.data === 'object' && response.data !== null) {
      // The response might be a JSON object with URLs
      const extractedUrls = extractUrlsFromResponse(response.data);
      if (extractedUrls.length > 0) {
        console.log(`Extracted ${extractedUrls.length} URLs from JSON response`);
        return extractedUrls;
      }
    }
    
    // Last resort: use hardcoded URLs
    console.warn('Could not extract URLs from response, using hardcoded URLs');
    return [
      'https://e-boks.zeroheight.com/api/token_management/token_set/10617/export?format=style-dictionary&collection_id=22009&mode_id=38483&collection_name=brand&mode_name=eboks',
      'https://e-boks.zeroheight.com/api/token_management/token_set/10617/export?format=style-dictionary&collection_id=22009&mode_id=38484&collection_name=brand&mode_name=postnl',
      'https://e-boks.zeroheight.com/api/token_management/token_set/10617/export?format=style-dictionary&collection_id=22009&mode_id=38485&collection_name=brand&mode_name=nykredit',
      'https://e-boks.zeroheight.com/api/token_management/token_set/10617/export?format=style-dictionary&collection_id=22010&mode_id=38486&collection_name=theme&mode_name=light',
      'https://e-boks.zeroheight.com/api/token_management/token_set/10617/export?format=style-dictionary&collection_id=22010&mode_id=38487&collection_name=theme&mode_name=dark',
      'https://e-boks.zeroheight.com/api/token_management/token_set/10617/export?format=style-dictionary&collection_id=22011&mode_id=38488&collection_name=globals&mode_name=value'
    ];
  } catch (error) {
    console.error(`Error fetching token URLs: ${error.message}`);
    
    // Fallback to hardcoded URLs
    console.warn('Using hardcoded URLs due to error');
    return [
      'https://e-boks.zeroheight.com/api/token_management/token_set/10617/export?format=style-dictionary&collection_id=22009&mode_id=38483&collection_name=brand&mode_name=eboks',
      'https://e-boks.zeroheight.com/api/token_management/token_set/10617/export?format=style-dictionary&collection_id=22009&mode_id=38484&collection_name=brand&mode_name=postnl',
      'https://e-boks.zeroheight.com/api/token_management/token_set/10617/export?format=style-dictionary&collection_id=22009&mode_id=38485&collection_name=brand&mode_name=nykredit',
      'https://e-boks.zeroheight.com/api/token_management/token_set/10617/export?format=style-dictionary&collection_id=22010&mode_id=38486&collection_name=theme&mode_name=light',
      'https://e-boks.zeroheight.com/api/token_management/token_set/10617/export?format=style-dictionary&collection_id=22010&mode_id=38487&collection_name=theme&mode_name=dark',
      'https://e-boks.zeroheight.com/api/token_management/token_set/10617/export?format=style-dictionary&collection_id=22011&mode_id=38488&collection_name=globals&mode_name=value'
    ];
  }
}

// Function to extract URLs from different response structures
function extractUrlsFromResponse(data) {
  const urls = [];
  
  // Check if it's directly an array of strings
  if (Array.isArray(data)) {
    const stringUrls = data.filter(item => typeof item === 'string' && item.includes('format=style-dictionary'));
    if (stringUrls.length > 0) {
      return stringUrls;
    }
  }
  
  // Try to find URLs in the object (recursively search for strings that look like URLs)
  function findUrlsInObject(obj, path = '') {
    if (typeof obj === 'string' && obj.includes('format=style-dictionary')) {
      urls.push(obj);
    } else if (typeof obj === 'object' && obj !== null) {
      for (const key in obj) {
        findUrlsInObject(obj[key], `${path}.${key}`);
      }
    }
  }
  
  findUrlsInObject(data);
  return urls;
}

// Main function to fetch all tokens, apply transforms and merge them
async function mergeAllTokens() {
  try {
    // First, fetch the list of token URLs
    const tokenUrls = await fetchTokenUrls();
    
    if (!tokenUrls || tokenUrls.length === 0) {
      throw new Error('No token URLs found');
    }
    
    console.log('Starting to fetch token sets...');
    
    // Fetch all token sets
    const tokenSets = await Promise.all(tokenUrls.map(fetchTokens));
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