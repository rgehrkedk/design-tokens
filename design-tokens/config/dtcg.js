export const dtcgFormat = {
    name: 'dtcg/css',
    formatter: function({ dictionary }) {
      return dictionary.allTokens.map(token => {
        // Transform to DTCG format
        const dtcgToken = {
          '$value': token.value,
          '$type': token.type || 'string',
          '$description': token.description || ''
        };
  
        return dtcgToken;
      });
    }
  };