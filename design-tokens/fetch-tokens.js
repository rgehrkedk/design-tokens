// fetch-tokens.js (forenklet pseudo-kode)

const fs = require('fs');
const path = require('path');
const axios = require('axios');

// URL med oversigt over alle links
const STYLE_DICTIONARY_LINKS_URL = 'https://e-boks.zeroheight.com/api/token_management/token_set/10617/style_dictionary_links';

async function run() {
  // 1. Hent listen af links (newline-separeret)
  const { data: linksText } = await axios.get(STYLE_DICTIONARY_LINKS_URL);
  const links = linksText.split('\n').filter(Boolean);

  for (const url of links) {
    // 2a. Hent selve JSON-data
    const { data: tokenData } = await axios.get(url);

    // 2b. Bestem filnavn + placering ved at kigge på URL (collection_name, mode_name)
    //     "collection_name=brand&mode_name=eboks" => brand/eboks.json
    //     "collection_name=theme&mode_name=light" => theme/light.json
    //     "collection_name=globals&mode_name=value" => globals/value.json
    const urlObj = new URL(url);
    const collection = urlObj.searchParams.get('collection_name'); // fx "brand"
    const mode = urlObj.searchParams.get('mode_name');             // fx "eboks"

    // Byg sti fx "tokens/brand/eboks.json"
    const folder = path.join('tokens', collection);
    if (!fs.existsSync(folder)) {
      fs.mkdirSync(folder, { recursive: true });
    }
    const outPath = path.join(folder, `${mode}.json`);

    // 2c. Skriv JSON til fil
    fs.writeFileSync(outPath, JSON.stringify(tokenData, null, 2));
    console.log(`Saved: ${outPath}`);
  }

  console.log('Done fetching all tokens!');
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});