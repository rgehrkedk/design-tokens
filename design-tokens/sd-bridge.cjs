
    const StyleDictionary = require('style-dictionary');
    const transforms = require('@tokens-studio/sd-transforms');

    // Register transforms
    transforms.register(StyleDictionary);

    // Export what we need
    module.exports = {
      // Create a function that builds tokens
      buildTokens: function(config) {
        const dictionary = StyleDictionary.extend(config);
        dictionary.buildAllPlatforms();
        return true;
      }
    };
    