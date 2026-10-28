const MAP = {
  'firebase-admin/app': 'fakes/firebase-admin/app.js',
  'firebase-admin/firestore': 'fakes/firebase-admin/firestore.js',
  'firebase-admin/auth': 'fakes/firebase-admin/auth.js',
  'firebase-admin/storage': 'fakes/firebase-admin/storage.js',
  'web-push': 'fakes/web-push/index.js',
};
export async function resolve(specifier, context, next) {
  if (MAP[specifier]) return { url: new URL(MAP[specifier], import.meta.url).href, shortCircuit: true, format: 'module' };
  return next(specifier, context);
}
