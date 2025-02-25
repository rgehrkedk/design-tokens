/**
 * Build script til Style Dictionary (ES modules version)
 */

import StyleDictionary from 'style-dictionary';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import config from './style-dictionary.config.js';

// Få den aktuelle filsti (erstatning for __dirname i ES modules)
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Opsæt Style Dictionary med konfigurationen
const sd = StyleDictionary.extend(config);

// Byg alle platforme
console.log('Bygger tokens for alle brands...');
sd.buildAllPlatforms();

console.log('\nBygning færdig! Token-filer er gemt i build-mappen.');