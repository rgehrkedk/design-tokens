
    // ESM bridge for Style Dictionary
    import StyleDictionary from 'style-dictionary';
    import { register } from '@tokens-studio/sd-transforms';
    
    // Register the transforms
    register(StyleDictionary);
    
    // Export a function to build tokens
    export function buildTokens(config) {
      try {
        const dictionary = StyleDictionary.extend(config);
        dictionary.buildAllPlatforms();
        return true;
      } catch (error) {
        console.error('Error in Style Dictionary build:', error);
        return false;
      }
    }
    