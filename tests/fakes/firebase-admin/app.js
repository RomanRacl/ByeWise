const apps = [];
export const cert = (x) => x;
export const getApps = () => apps;
export const initializeApp = (o) => { const a = { o }; apps.push(a); return a; };
