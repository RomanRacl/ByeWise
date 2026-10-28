// Denní běh AI cenového agenta – spouští Vercel Cron (viz vercel.json), chráněno CRON_SECRET.
// Každý den zpracuje několik odvětví (Nastavení → AI agent → odvětví za den) a pokračuje dokola.
import { hasFirebase, audit } from './_db.js';
import { runAgentDaily } from './_agent.js';
import { notifyAdmin } from './_notify.js';
import { safeEqual, publicError } from './_security.js';

export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 16 || !safeEqual(req.headers.authorization || '', `Bearer ${secret}`)) {
    return res.status(401).json({ error: 'Neoprávněný přístup' });
  }
  if (!hasFirebase()) return res.status(400).json({ error: 'Firebase není nastavený' });
  try {
    const r = await runAgentDaily();
    if (r.done?.length) await audit('cron', 'AI ceny', r.done.map((d) => d.category).join(', '), r.done.map((d) => `${d.category}: ${d.updated} cen, ${d.review} ke schválení`).join('; '));
    if (r.errors?.length) await notifyAdmin(`AI cenový agent skončil s chybami:\n${r.errors.join('\n')}`);
    res.status(200).json(r);
  } catch (e) {
    publicError(res, e, 'agent');
  }
}
