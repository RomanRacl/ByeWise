// Denní aktualizace – spouští Vercel Cron (viz vercel.json). Chráněno tajným klíčem CRON_SECRET.
import { hasFirebase } from './_db.js';
import { runUpdate } from './_update.js';
import { safeEqual, publicError } from './_security.js';

export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 16 || !safeEqual(req.headers.authorization || '', `Bearer ${secret}`)) {
    return res.status(401).json({ error: 'Neoprávněný přístup' });
  }
  if (!hasFirebase()) return res.status(400).json({ error: 'Firebase není nastavený' });
  try {
    const status = await runUpdate({ trigger: 'cron' });
    res.status(200).json(status);
  } catch (e) {
    publicError(res, e, 'cron');
  }
}
