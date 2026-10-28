const sent = globalThis.__PUSH__ ||= [];
export default { setVapidDetails() {}, async sendNotification(sub, payload) { if (sub.endpoint.includes('gone')) { const e = new Error('gone'); e.statusCode = 410; throw e; } sent.push({ sub, payload: JSON.parse(payload) }); } };
