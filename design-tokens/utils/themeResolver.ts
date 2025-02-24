
import { getTokens } from '../tokens';

export const resolveTheme = (brand: string, mode: 'light' | 'dark') => {
  return getTokens(brand, mode);
};
