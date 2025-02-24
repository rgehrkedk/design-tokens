
    // Direct import of Core module
    import { Core } from 'style-dictionary/lib/Core.js';
    import { register } from '@tokens-studio/sd-transforms';
    
    // Export a function to build tokens
    export async function buildTokens(config) {
      // Create a new Core instance with our config
      const styleDictionary = new Core(config);
      
      // Register transforms
      register(styleDictionary);
      
      // Build all platforms
      styleDictionary.buildAllPlatforms();
      
      return true;
    }
    