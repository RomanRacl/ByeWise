export const getAuth = () => ({
  verifyIdToken: async (t) => {
    const m = /^tok-(\w+)-(.+)$/.exec(t);
    if (!m) throw new Error('bad token');
    return { uid: m[1], email: m[2], email_verified: true, name: m[1] };
  },
});
