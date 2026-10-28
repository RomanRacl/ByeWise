// Denní aktualizace – spouští Vercel Cron (viz vercel.json). Chráněno tajným klíčem CRON_SECRET.
import { hasFirebase } from './_db.js';
import { runUpdate } from './_update.js';

export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.authorization !== `Bearer ${secret}`) {
    return res.status(401).json({ error: 'Neoprávněný přístup' });
  }
  if (!hasFirebase()) return res.status(400).json({ error: 'Firebase není nastavený' });
  try {
    const status = await runUpdate({ trigger: 'cron' });
    res.status(200).json(status);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
