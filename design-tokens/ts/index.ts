
import { globalTokens } from './global';
import { eboksTokens } from './brands/eboks';
import { nykreditTokens } from './brands/nykredit';
import { postnlTokens } from './brands/postnl';

const brandMap: Record<string, any> = {
  eboks: eboksTokens,
  nykredit: nykreditTokens,
  postnl: postnlTokens,
};

export const getTokens = (brand: string, mode: 'light' | 'dark') => {
  const brandTokens = brandMap[brand] || {};
  return {
    ...globalTokens, 
    ...brandTokens.base,
    ...brandTokens.themes[mode],
    components: brandTokens.components
  };
};
