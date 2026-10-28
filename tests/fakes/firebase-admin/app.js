const apps = [];
// Jako skutečný firebase-admin: neplatný soukromý klíč vyhodí chybu už při cert().
// Testy používají FIREBASE_PRIVATE_KEY='k' (zkratka) – ta projde; cokoli jiného musí vypadat jako PEM.
export const cert = (x) => {
  if (x.privateKey !== 'k' && !/-----BEGIN PRIVATE KEY-----[\s\S]+-----END PRIVATE KEY-----/.test(x.privateKey || '')) {
    throw new Error('Failed to parse private key: Error: Invalid PEM formatted message.');
  }
  return x;
};
export const getApps = () => apps;
export const initializeApp = (o) => { const a = { o }; apps.push(a); return a; };
