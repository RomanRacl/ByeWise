import { S, categoryById, catName, productById, sum, money, pct, pctClass, esc, chip, priceText, productLink, link, ICON, dateFmt, toast, hero, sheet } from '../core.js';
import { actions } from '../ui.js';
import { sparkline } from '../chart.js';
import { favs, localAlerts, pushAlerts, serverAlerts, describeAlert, apiUser, reloadProfile, login, logout, authAvailable } from '../user.js';
import { t } from '../i18n.js';

export function renderFavorites(main) {
  document.title = `${t('Oblíbené a hlídače')} – BuyWise`;
  const list = favs.list().map(productById).filter(Boolean).map((p) => ({ p, s: sum(p) }));
  const alerts = [
    ...localAlerts.list().map((x) => ({ ...x, kind: 'local' })),
    ...pushAlerts.list().map((x) => ({ ...x, kind: 'push' })),
    ...serverAlerts().map((x) => ({ ...x, kind: 'server' })),
  ].filter((a) => productById(a.productId));
  const canDigest = !!(S.profile && S.profile.features?.email);

  const account = S.standalone
    ? `<p class="note">${t('Samostatná HTML verze ukládá oblíbené jen v tomto prohlížeči.')}</p>`
    : S.user
    ? `<div class="account"><div><strong>${esc(S.user.name || S.user.email)}</strong><span class="muted">${esc(S.user.email)}</span></div><button type="button" class="btn alt" data-action="logout">${t('Odhlásit')}</button></div>
       <p class="note">${t('Oblíbené, portfolio a hlídače se synchronizují mezi všemi tvými zařízeními.')}</p>
       ${S.user.verified === false ? `<p class="notice warn">${t('E-mail zatím není ověřený, upozornění e-mailem proto nechodí.')} <button type="button" class="btn link" data-action="verify-email">${t('Poslat ověřovací e-mail znovu')}</button></p>` : ''}
       ${canDigest ? `<label class="toggle"><input type="checkbox" id="digest" ${S.profile.weeklyDigest ? 'checked' : ''}> ${t('Posílat každé pondělí e-mail „BuyWise týden“ se souhrnem cen, seznamem přání a oblíbenými')}</label>` : ''}`
    : authAvailable()
    ? `<p>${t('Přihlas se e-mailem nebo účtem Google a oblíbené, seznam přání, portfolio i hlídače budeš mít na všech zařízeních. Dostaneš i e-mailová upozornění a týdenní souhrn.')}</p><button type="button" class="btn" data-action="open-login">${t('Přihlásit se')}</button>`
    : `<p class="note">${t('Oblíbené se ukládají v tomto prohlížeči.')}</p>`;

  main.innerHTML = hero({ crumb: `<a href="${link('/')}">${t('Přehled')}</a>`, title: t('Oblíbené a hlídače'), lead: t('Produkty, které sleduješ, a hlídače cen na jednom místě.') }) + sheet(`
    <section class="card account-card">${account}</section>
    <section class="section"><div class="section-head"><div><h2>${t('Oblíbené produkty')}</h2><p>${t('Hvězdičkou je přidáš na stránce žebříčku nebo produktu.')}</p></div>${list.length ? `<a class="btn alt" href="${link('/porovnat?ids=' + list.slice(0, 4).map((x) => encodeURIComponent(x.p.id)).join(','))}">${ICON.compare}${t('Porovnat první 4')}</a>` : ''}</div>
      ${
        list.length
          ? `<ul class="list fav-list">${list
              .map(
                (x) => `<li data-pid="${esc(x.p.id)}"><a class="item fav-item" href="${productLink(x.p.id)}" data-prefetch="${esc(x.p.id)}"><span class="nm">${esc(x.p.name)}</span><span class="spark">${sparkline(x.s.history, x.s.trend.dir, 100, 30)}</span><span class="val">${priceText(x.p, x.s)}<small class="${pctClass(x.s.ch30)}">${pct(x.s.ch30)} / 30 d</small></span><span class="sub">${esc(catName(categoryById(x.p.category)))} ${chip(x.s.trend)}</span></a><button type="button" class="star on" data-action="unfav" data-id="${esc(x.p.id)}" aria-label="${esc(t('Odebrat z oblíbených'))}" data-tip="${esc(t('Odebrat z oblíbených'))}">${ICON.star}</button></li>`
              )
              .join('')}</ul>`
          : `<p class="empty">${t('Zatím nemáš žádné oblíbené.')}</p>`
      }
    </section>
    <section class="section"><div class="section-head"><div><h2>${t('Moje hlídače cen')}</h2><p>${t('Nastavíš je na stránce produktu v sekci Hlídač ceny.')}</p></div>${'Notification' in window && Notification.permission === 'default' ? `<button type="button" class="btn alt" data-action="notif">${ICON.bell}${t('Povolit upozornění prohlížeče')}</button>` : ''}</div>
      ${
        alerts.length
          ? `<ul class="adm-list">${alerts
              .map((a) => {
                const p = productById(a.productId);
                const s = sum(p);
                return `<li><span class="nm"><a href="${productLink(p.id)}">${esc(p.name)}</a> ${esc(describeAlert(a))}<small>${t('teď')} ${priceText(p, s)}, ${a.kind === 'local' ? t('v prohlížeči') : a.kind === 'push' ? t('push') : (a.channels || []).join(', ')}${a.active ? '' : ', ' + t('splněno {d}', { d: dateFmt((a.triggeredAt || '').slice(0, 10)) })}</small></span><button type="button" class="btn danger" data-action="f-del" data-v="${esc(a.kind + ':' + a.id)}">${t('Smazat')}</button></li>`;
              })
              .join('')}</ul>`
          : `<p class="empty">${t('Žádné hlídače.')}</p>`
      }
    </section>`);

  actions({
    notif: async () => {
      await Notification.requestPermission();
      renderFavorites(main);
    },
    unfav: async (el) => {
      await favs.toggle(el.dataset.id);
      const li = el.closest('li');
      if (li && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        li.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateX(24px)' }], { duration: 220, easing: 'ease-in' }).onfinish = () => renderFavorites(main);
      } else renderFavorites(main);
    },
    'f-del': async (el) => {
      const [kind, id] = el.dataset.v.split(/:(.*)/s);
      try {
        if (kind === 'local') localAlerts.remove(id);
        else if (kind === 'push') await pushAlerts.remove(id);
        else {
          await apiUser('deleteAlert', { id });
          await reloadProfile();
        }
        renderFavorites(main);
      } catch (err) {
        toast(esc(err.message), 'err');
      }
    },
  });
  main.querySelector('#digest')?.addEventListener('change', async (e) => {
    try {
      await apiUser('setDigest', { on: e.target.checked });
      S.profile.weeklyDigest = e.target.checked;
      toast(e.target.checked ? t('Týdenní souhrn zapnutý.') : t('Týdenní souhrn vypnutý.'), 'ok');
    } catch (err) {
      e.target.checked = !e.target.checked;
      toast(esc(err.message), 'err');
    }
  });
  return true;
}
