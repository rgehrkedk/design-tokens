/**
 * Style Dictionary konfiguration (ES modules version)
 * Bygger separate token filer for hvert brand (eboks, nykredit, postnl)
 */

export default {
  source: ['tokens/**/*.json'], // Inkluderer alle JSON-filer i tokens-mappen
  platforms: {
    eboks: {
      // Specifikke kilder for eboks
      source: [
        'tokens/globals/value.json',
        'tokens/theme/light.json',
        'tokens/theme/dark.json',
        'tokens/brand/eboks.json'
      ],
      transformGroup: 'js', // Standard transformgruppe
      buildPath: 'build/',
      files: [{
        destination: 'eboks-tokens.json',
        format: 'json/nested',
        options: {
          outputReferences: true // Bevar referencer i output
        }
      }]
    },
    nykredit: {
      // Specifikke kilder for nykredit
      source: [
        'tokens/globals/value.json',
        'tokens/theme/light.json',
        'tokens/theme/dark.json',
        'tokens/brand/nykredit.json'
      ],
      transformGroup: 'js',
      buildPath: 'build/',
      files: [{
        destination: 'nykredit-tokens.json',
        format: 'json/nested',
        options: {
          outputReferences: true
        }
      }]
    },
    postnl: {
      // Specifikke kilder for postnl
      source: [
        'tokens/globals/value.json',
        'tokens/theme/light.json',
        'tokens/theme/dark.json',
        'tokens/brand/postnl.json'
      ],
      transformGroup: 'js',
      buildPath: 'build/',
      files: [{
        destination: 'postnl-tokens.json',
        format: 'json/nested',
        options: {
          outputReferences: true
        }
      }]
    }
  }
};