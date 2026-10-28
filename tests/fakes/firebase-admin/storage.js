import { FILES } from './store.js';
export const getStorage = () => ({ bucket: () => ({ name: 'test-bucket', file: (n) => ({ save: async (data, opts) => FILES.set(n, opts ? { data, opts } : data) }) }) });
