// Vygeneruje klíče pro push notifikace (VAPID): `npm run vapid`
// Výstup vlož do proměnných prostředí na Vercelu (VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY).
import { generateKeyPairSync } from 'node:crypto';

const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const pub = publicKey.export({ format: 'jwk' });
const priv = privateKey.export({ format: 'jwk' });
const b64u = (buf) => Buffer.from(buf).toString('base64url');
const raw = Buffer.concat([Buffer.from([4]), Buffer.from(pub.x, 'base64url'), Buffer.from(pub.y, 'base64url')]);

console.log('Vlož do Vercel → Settings → Environment Variables:\n');
console.log(`VAPID_PUBLIC_KEY=${b64u(raw)}`);
console.log(`VAPID_PRIVATE_KEY=${priv.d}`);
console.log('VAPID_SUBJECT=mailto:tvuj@email.cz');
