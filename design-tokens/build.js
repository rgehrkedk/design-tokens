/**
 * Build script til Style Dictionary
 */

const StyleDictionary = require('style-dictionary');
const config = require('./style-dictionary.config.js');

// Opsæt Style Dictionary med konfigurationen
const sd = StyleDictionary.extend(config);

// Byg alle platforme
console.log('Bygger tokens for alle brands...');
sd.buildAllPlatforms();

console.log('\nBygning færdig! Token-filer er gemt i build-mappen.');