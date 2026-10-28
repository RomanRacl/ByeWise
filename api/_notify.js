// Oznámení: e-mail (Resend), push (Web Push / VAPID), upozornění administrátorovi (Discord / e-mail).
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export const emailEnabled = () => !!(process.env.RESEND_API_KEY && process.env.MAIL_FROM);
export const pushEnabled = () => !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
export const siteUrl = () => (process.env.SITE_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : '')).replace(/\/$/, '');

export async function sendEmail({ to, subject, html }) {
  if (!emailEnabled()) throw new Error('E-maily nejsou nastavené (RESEND_API_KEY, MAIL_FROM)');
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: process.env.MAIL_FROM, to: Array.isArray(to) ? to : [to], subject, html }),
  });
  if (!r.ok) throw new Error(`Resend ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return true;
}

let webpush = null;
export async function sendPush(subscription, payload) {
  if (!pushEnabled()) throw new Error('Push není nastavený (VAPID klíče)');
  if (!webpush) {
    webpush = (await import('web-push')).default;
    webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:admin@example.com', process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);
  }
  try {
    await webpush.sendNotification(subscription, JSON.stringify(payload));
    return { ok: true };
  } catch (e) {
    // 404/410 = odběr už neexistuje
    return { ok: false, gone: e.statusCode === 404 || e.statusCode === 410, error: e.message };
  }
}

export async function notifyAdmin(text) {
  const tasks = [];
  if (process.env.DISCORD_WEBHOOK_URL) {
    tasks.push(
      fetch(process.env.DISCORD_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: `**BuyWise:** ${text}`.slice(0, 1900) }),
      })
    );
  }
  if (process.env.ADMIN_ALERT_EMAIL && emailEnabled()) {
    tasks.push(sendEmail({ to: process.env.ADMIN_ALERT_EMAIL, subject: 'BuyWise: problém s aktualizací', html: `<p>${esc(text).replace(/\n/g, '<br>')}</p>` }));
  }
  await Promise.allSettled(tasks);
}

// Jednoduchá šablona e-mailu.
export function emailLayout(title, bodyHtml, footerHtml = '') {
  return `<!doctype html><html lang="cs"><body style="margin:0;background:#eef1ec;font-family:Arial,Helvetica,sans-serif;color:#16222b">
  <div style="max-width:560px;margin:0 auto;padding:24px 16px">
    <div style="font-weight:800;font-size:20px;margin-bottom:16px">Buy<span style="color:#d9a400">Wise</span> <span style="font-weight:400;font-size:13px;color:#6f7d86">Kupuj chytře. Víš, kdy cena klesne.</span></div>
    <div style="background:#fff;border-radius:10px;padding:20px">
      <h1 style="font-size:20px;margin:0 0 12px">${esc(title)}</h1>
      ${bodyHtml}
    </div>
    <p style="font-size:12px;color:#6f7d86;margin-top:16px">${footerHtml}Odhady vznikají statisticky z historie cen a nejsou finančním poradenstvím.</p>
  </div></body></html>`;
}

export { esc };
