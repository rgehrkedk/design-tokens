/**
 * Build script med fokus på korrekt håndtering af token-referencer
 */

import StyleDictionary from 'style-dictionary';

console.log('Style Dictionary Version:', StyleDictionary.VERSION);

// Definer en custom transform
StyleDictionary.registerTransform({
  name: 'attribute/cti',
  type: 'attribute',
  transformer: function(prop) {
    return {
      category: prop.path[0],
      type: prop.path[1],
      item: prop.path[2]
    };
  }
});

// Registrer custom format for mere detaljeret output
StyleDictionary.registerFormat({
  name: 'json/nested-with-references',
  formatter: function(dictionary, config) {
    // Få alle tokens og bevar deres fulde path
    return JSON.stringify(dictionary.tokens, null, 2);
  }
});

// Definer transformGroup for fuld reference-bevarelse
StyleDictionary.registerTransformGroup({
  name: 'js-with-references',
  transforms: [
    'attribute/cti',
    'name/cti/constant',
    'size/px',
    'color/css'
  ]
});

// Konfiguration for alle brands
const config = {
  source: [
    'tokens/**/*.json'
  ],
  platforms: {
    eboks: {
      transformGroup: 'js-with-references',
      buildPath: 'build/',
      files: [{
        destination: 'eboks-tokens.json',
        format: 'json/nested-with-references',
        options: {
          outputReferences: true
        },
        filter: (token) => {
          return token.filePath.includes('eboks.json') || 
                 !token.filePath.includes('brand/');
        }
      }]
    },
    nykredit: {
      transformGroup: 'js-with-references',
      buildPath: 'build/',
      files: [{
        destination: 'nykredit-tokens.json',
        format: 'json/nested-with-references',
        options: {
          outputReferences: true
        },
        filter: (token) => {
          return token.filePath.includes('nykredit.json') || 
                 !token.filePath.includes('brand/');
        }
      }]
    },
    postnl: {
      transformGroup: 'js-with-references',
      buildPath: 'build/',
      files: [{
        destination: 'postnl-tokens.json',
        format: 'json/nested-with-references',
        options: {
          outputReferences: true
        },
        filter: (token) => {
          return token.filePath.includes('postnl.json') || 
                 !token.filePath.includes('brand/');
        }
      }]
    }
  }
};

try {
  console.log('Building tokens with reference preservation...');
  const sd = StyleDictionary(config);
  sd.buildAllPlatforms();
  console.log('✅ Finished! Tokens are saved in the build folder.');
} catch (error) {
  console.error('❌ Build failed:', error);
}