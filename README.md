# BuyWise

**Kupuj chytře. Víš, kdy cena klesne.**

Webová aplikace, která ukazuje **10 nejžádanějších produktů ve 20 odvětvích**, jestli jejich **cena roste, klesá nebo se drží**, **skóre Kup teď / Počkej**, **odhad ceny na 30 dní**, **srovnání prodejců**, **nejlepší čas na nákup**, **falešné slevy** a **technické signály** pro investice.

Běží jako statický web + serverové funkce na **Vercelu**, data jsou ve **Firebase**, kód na **GitHubu**. Bez nastaveného Firebase běží v ukázkovém režimu, takže ji jde hned prohlédnout.

## Co umí

**Odvětví** (skupiny Nákupy, Domácnost, Investice): auta, ojeté vozy, PC hry, knihy, elektro, **mobily**, **sport**, **kosmetika**, mobilní tarify, vstupenky, dovolené, potraviny, pohonné hmoty, energie, nemovitosti, **nábytek**, **pojištění**, ropa a komodity, kryptoměny, akcie.

**Chytré nástroje BuyWise**
- **Skóre Kup teď / Počkej (0–100)** u každého spotřebního produktu – v žebříčku (řazení i filtr), v rychlém náhledu, na detailu s důvody a ročním rozpětím. Skládá se z odhadu ceny na 30 dní (35 %), polohy ceny v ročním rozpětí (25 %), sezónnosti (20 %), trendu (10 %) a kontroly slev (podezřelá sleva skóre sníží, cena na 30denním minimu zvýší). Nad 60 = dobrá chvíle, pod 40 = počkej; u „počkej“ řekne, dokdy (do 30 dní / v měsíci X).
- **Seznam přání** (`/prani`): srdíčko u produktu, cílová cena s ukazatelem, změna od přidání, doporučení kdy koupit, tipy na produkty se skóre nad 60. Upozornění v prohlížeči, po přihlášení e-mail při dosažení cílové ceny a synchronizace mezi zařízeními.
- **Nákupní kalendář** (`/kalendar`): 12 měsíců, akce a sezóny v Česku (Black Friday, výprodeje na Steamu, first/last minute, konec roku u dealerů…), nejlevnější odvětví a produkty v měsíci, co raději nekupovat, a roční mřížka odvětví × měsíce.
- **Pozor na tyto akce** (`/pozor`): nafouknuté slevy (zdražení těsně před „slevou“) s grafem, slevy, které nejsou nejnižší cenou za 30 dní (pravidlo Omnibus), prudké zdražení za týden a opravdu dobré ceny.
- **Rozpočtový poradce** (`/rozpocet`): „Mám 30 000 Kč na elektro, nespěchám“ → co se vejde, kdy koupit (teď / do 30 dní / v měsíci X), úspora a zbytek rozpočtu. Stav je v adrese, výsledek jde poslat odkazem.
- **Sdílecí obrázek** produktu 1200 × 630 (logo, cena, trend, graf s odhadem, skóre) – stažení PNG nebo sdílení přímo do aplikací v mobilu. Odkazy na web mají náhled `og.jpg`.
- **Týdenní e-mail „BuyWise týden“**: tvůj seznam přání se skóre, co se vyplatí koupit, co zlevnilo a zdražilo za týden, falešné slevy, co se vyplatí počkat, oblíbené.
- **Úvodní prohlídka** pro nové návštěvníky (spotlight, 6 kroků, klávesnice), znovu ji spustíš v Nastavení.

**Pro každého návštěvníka**
- žebříčky s posunem v pořadí, filtry (zlevňuje, zdražuje, ve slevě, cena od–do, oblíbené), řazení s animací, export do CSV
- detail produktu: graf ceny s odhadem a pásmem nejistoty, ceny prodejců v grafu, export grafu do PNG a historie do CSV
- odhad ceny (exponenciální vyhlazování s tlumeným trendem + sezónní korekce) a **zpětné ověření přesnosti**
- **sezónnost** a nejlepší měsíc na nákup (produkt i celé odvětví)
- **kalkulačka úspory** („když počkám N dní“), **celkové náklady vlastnictví auta**, **cena za jednotku** (Kč/GB, Kč/palec…)
- **odhalení nafouknutých slev** a nejnižší cena za posledních 30 dní
- srovnání s **inflací**, **korelace** s komoditami, kryptem a akciemi
- investice: klouzavé průměry, RSI, MACD, Bollingerova pásma a **zpětný test signálu**
- **teplotní mapa** všech odvětví, pořadí v čase, obrázky produktů
- **hledání** napříč vším, **porovnání** až 4 produktů (sdílitelný odkaz)
- **oblíbené**, **hlídače cen** (v prohlížeči, push notifikace, e-mail), **portfolio** se ziskem/ztrátou
- **přihlášení e-mailem a heslem** (registrace, ověření e-mailu, zapomenuté heslo) nebo **Googlem**, se synchronizací mezi zařízeními a **týdenním e-mailem „BuyWise týden“**
- čeština i **angličtina**, měna **Kč / € / $** (kurzy ČNB), světlý/tmavý vzhled
- **instalace do mobilu** (PWA), offline režim, sdílení odkazem s náhledem (SEO a OG značky, sitemap)

**Pro tebe (administrace na `/admin`)**
- úprava produktů, **hromadná úprava** cen v tabulce, atributy pro kalkulačky (spotřeba, GB, EAN…)
- **nahrávání vlastních fotek** produktů i pozadí odvětví (prohlížeč je zmenší na 1920 px a uloží do Firebase Storage)
- **import**: CSV, **Excel (.xlsx)**, **textový žebříček** (např. knihy z webu), **tisková zpráva SDA** (auta – pořadí se načte samo)
- **XML feedy e-shopů** (Heureka, Google Merchant, CSV) – ceny prodejců se plní automaticky každý den
- nastavení inflace, **affiliate odkazů**, sponzora newsletteru, režimu **schvalování** změn pořadí
- **historie úprav**, **zálohy** (ruční stažení i automaticky každou neděli), obnova ze zálohy
- přístup heslem nebo Google účtem (**víc správců**)
- **upozornění na chyby** aktualizace na Discord nebo e-mail, stránka **Stav dat**
- **veřejné API** `/api/v1`

## Vzhled a ovládání

- **Fotky na pozadí podle sekce.** Auta ukazují auta, elektro elektroniku, investice burzu, zlato, krypto. Na detailu produktu je fotka toho produktu (vybraný řádek v žebříčku přepne pozadí také). Fotky se střídají každých 9 s s pomalým přiblížením (Ken Burns) a stmívačem, aby byl text čitelný. Při skrytém panelu se pauzují.
- **Zdroj fotek: Wikimedia Commons** (volné licence). U každé fotky je vpravo dole autor a licence s odkazem. Pořadí: vlastní fotky z administrace → fotka produktu (`photo`, `attrs.photoQuery`) → vybrané fotky odvětví → vyhledávání v kvalitních fotkách Commons. Výsledky se pamatují 7 dní (localStorage), soubory ukládá service worker (max. 60).
- **Vlastní fotky:** u produktu tlačítko **Nahrát fotku** (nebo odkaz), u odvětví Administrace → Nastavení → Fotky na pozadí → **Nahrát fotku do tohoto odvětví** (nebo řádek `https://…/foto.jpg | Autor, licence`, klíč `home` = přehled). Nahrané fotky jdou do Firebase Storage (složka `fotky/`), takže je potřeba `FIREBASE_STORAGE_BUCKET`. U produktu je i pole Hledat fotku (anglický dotaz pro Commons). V samostatné HTML verzi se nahraná fotka uloží zmenšená přímo v prohlížeči.
- **Master-detail:** v žebříčku klik na řádek ukáže rychlý náhled vedle (na mobilu ve spodním panelu), klik na název otevře celý detail. Šipky ↑↓ mění výběr, výběr je v adrese (`?vyber=`), stejně jako řazení a filtry (`?razeni=&filtr=&od=&do=`).
- **Drawer** pro nastavení, mobilní menu, filtry a rychlý náhled: Esc, klik vedle nebo stažení prstem dolů zavře, fokus zůstává uvnitř.
- **Accordion** na detailu produktu (konkurence, sezónnost, ukazatele, hlídač…), grafy se kreslí až při otevření.
- **Tooltipy** (`data-tip`) při najetí, fokusu klávesnicí i podržení prstu.
- **Routing** přes History API: tlačítko Zpět vrací i pozici na stránce, přechody používají View Transitions (cenovka a název „přeletí“ z žebříčku do detailu), fokus se po přechodu přesune na nadpis kvůli čtečkám.
- **Jeden click handler:** celá aplikace má jediný posluchač kliknutí (`public/js/ui.js`). Tlačítka mají `data-action="název"` a akce se registrují `action()` (globální) nebo `actions({...})` (platí pro aktuální stránku a při přechodu se zahodí).
- **Klávesové zkratky:** `/` hledání, `Esc` zavře panel, šipky v žebříčku i v nákupním kalendáři, šipky v úvodní prohlídce.
- **Značka:** logo „chytrá cenovka“ se sovíma očima (`public/icons/icon.svg`), dvoubarevný název Buy**Wise**, slogan „Kupuj chytře. Víš, kdy cena klesne.“, náhledový obrázek pro sociální sítě `public/og.jpg`.
- **Pohyb na pozadí** lze vypnout v Nastavení; při systémovém „omezit pohyb“ se animace vypnou samy.

## Rychlé vyzkoušení

- **Bez instalace:** otevři `buywise.html` v prohlížeči (samostatná verze, viz níže).
- **Na počítači:** potřebuješ Node.js 22+.

```bash
npm install
npm run dev        # http://localhost:3000
npm test           # 30 testů (výpočty, skóre, rozpočet, feedy, bezpečnost, celý server se simulovaným Firebase)
```

Pro připojení k Firebase zkopíruj `.env.example` do `.env.local` a vyplň hodnoty.

## Nasazení krok za krokem

### 1. Firebase
1. Na https://console.firebase.google.com vytvoř projekt.
2. **Build → Firestore Database → Create database** (režim *production*, lokace `eur3` nebo `europe-west3`).
3. V záložce **Rules** vlož obsah souboru `firestore.rules` a publikuj (prohlížeč do databáze nesmí, všechno jde přes server). **Důležité:** nový projekt v „test mode“ má databázi 30 dní otevřenou celému internetu – pravidla nastav hned.
4. Volitelně **Firestore → TTL policies**: kolekce `ratelimit`, pole `expireAt` (staré záznamy o pokusech se mažou samy).
5. **Storage** (pro zálohy a nahrané fotky): v záložce **Rules** vlož obsah `storage.rules` a publikuj.
6. **Project settings → Service accounts → Generate new private key.** Stáhne se JSON. Nikdy ho nedávej na GitHub (`.gitignore` ho vynechá).

### 2. GitHub
```bash
git init
git add .
git commit -m "BuyWise"
git branch -M main
git remote add origin https://github.com/TVUJ-UCET/buywise.git
git push -u origin main
```

### 3. Vercel
1. https://vercel.com → **Add New → Project** → vyber repozitář.
2. Framework Preset: **Other**. Build ani output nenastavuj.
3. V **Environment Variables** vyplň aspoň povinné proměnné z `.env.example`:
   `FIREBASE_SERVICE_ACCOUNT` (celý obsah staženého JSON klíče – nejspolehlivější, klíč se tak nepoškodí kopírováním), `ADMIN_PASSWORD`, `CRON_SECRET`, a doporučeně `SITE_URL`.
   Místo `FIREBASE_SERVICE_ACCOUNT` jdou použít i tři proměnné `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`.
   Když něco nesedí, administrace po přihlášení ukáže tabulku, která proměnná je špatně a proč.
4. **Deploy.** Vlastní doménu nastavíš v **Settings → Domains**.

### 4. První naplnění
1. Otevři `https://tvoje-domena/admin` a přihlas se heslem.
2. **Data a zálohy → Naplnit výchozími daty** (ruční odvětví s orientačními cenami označenými „ukázka“).
3. **Aktualizovat živá data teď** – stáhne hry, komodity, akcie a krypto.
4. Přepiš ceny v ručních odvětvích (nejrychleji **Produkty → Hromadná úprava cen**). Uložením zmizí štítek „ukázka“.

Automatická aktualizace pak běží **každý den v 15:40** (Vercel Cron). Pošle upozornění hlídačů a seznamů přání (cílová cena), v pondělí e-mail „BuyWise týden“, v neděli udělá zálohu.

## Volitelné funkce – co zapnout a jak

| Funkce | Co udělat |
|---|---|
| Přihlášení (e-mail + heslo i Google), synchronizace, e-mailové hlídače | Firebase → **Authentication → Sign-in method → Email/Password** a **Google** zapnout. V **Templates** si můžeš počeštit e-maily pro ověření adresy a nové heslo. **Settings → Authorized domains** přidat svou doménu. **Project settings → Your apps → Web app** a hodnoty dát do `FIREBASE_WEB_API_KEY`, `FIREBASE_AUTH_DOMAIN`, `FIREBASE_APP_ID`. |
| Další správci | Jejich Google e-maily do `ADMIN_EMAILS` (čárkami). |
| E-maily (hlídače, týdenní souhrn, chyby) | Účet na https://resend.com (zdarma 3 000 e-mailů/měsíc), ověřit doménu, vyplnit `RESEND_API_KEY` a `MAIL_FROM`. |
| Push notifikace | `npm run vapid` a výstup vložit do `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`. |
| Upozornění na chyby aktualizace | Discord: kanál → Integrace → Webhook → URL do `DISCORD_WEBHOOK_URL`. Nebo e-mail do `ADMIN_ALERT_EMAIL`. |
| Automatické zálohy a nahrávání fotek | Firebase → **Storage** → Get started, název bucketu do `FIREBASE_STORAGE_BUCKET`. Nahrané fotky se zobrazují přes odkaz se stahovacím tokenem, bucket nemusí být veřejný. |
| Návštěvnost | Vercel → projekt → **Analytics → Enable** (skript se načítá sám). |
| Affiliate odkazy | Administrace → Nastavení: `alza.cz \| {url}?idp=TVOJE_ID` (programy mají Alza, Heureka, Datart, CK…). |
| Ceny z e-shopů | Viz kapitola **Feedy e-shopů** níže. |

## Jak se data plní

| Odvětví | Zdroj | Jak často |
|---|---|---|
| PC hry | Steam – nejprodávanější v ČR, ceny v Kč, hráči online | denně automaticky |
| Ropa a komodity | Yahoo Finance futures × kurz ČNB, pořadí podle objemu obchodů | denně automaticky |
| Akcie | Yahoo Finance (Praha, USA, Evropa) × kurz ČNB | denně automaticky |
| Kryptoměny | CoinGecko, ceny přímo v Kč, bez stablecoinů | denně automaticky |
| Auta | Tisková zpráva SDA → Import → „Tisková zpráva SDA“ | měsíčně |
| Knihy | Žebříček SČKN/knihkupectví → Import → „Textový žebříček“ | měsíčně |
| Elektro, mobily, sport, kosmetika, potraviny, energie… | Feedy e-shopů, CSV/Excel nebo ručně | podle feedů denně |
| Nábytek, pojištění | CSV/Excel nebo hromadná úprava (pojištění = průměrné roční pojistné) | měsíčně |
| Dovolené, tarify, vstupenky, nemovitosti, ojeté vozy, pohonné hmoty | CSV/Excel nebo hromadná úprava | týdně až měsíčně |

**Každé uložení ceny přidá dnešní záznam do historie.** Odhad potřebuje aspoň 6 záznamů za aspoň 10 dní, sezónnost aspoň rok.

## Feedy e-shopů (mobily, sport, kosmetika, elektro)

Ceny prodejců a u těchto odvětví i **hlavní cena** (nejnižší dnešní cena z feedů) se plní každý den samy.

1. **Získej odkaz na feed.** Nejschůdnější cesta je affiliate síť ([eHUB](https://ehub.cz/en/publishers-manual), Dognet, CJ, Awin): zaregistruješ se, požádáš o kampaň e-shopu a v rozhraní sítě najdeš odkaz na produktový XML feed (obvykle už s tvým partnerským odkazem, takže z prokliků máš provizi). Jinak vlastní partnerský program e-shopu nebo přímo e-mail e-shopu s prosbou o jejich Heureka/Zboží/Google feed.
2. **Administrace → Nastavení → Feedy e-shopů → „+ feed“** u Mobilů, Sportu nebo Kosmetiky, vyplň prodejce a odkaz.
3. **Otestovat** ukáže formát, počet položek, co se spárovalo (i jestli podle EAN) a **které produkty se nenašly**.
4. U nenalezených doplň v editoru produktu **EAN** (nejspolehlivější), případně uprav název/podtitul tak, aby odpovídal feedu (podtitul nese kapacitu nebo objem: „256 GB“, „EDT 100 ml“).
5. **Uložit nastavení.** Od další denní aktualizace (15:40) se ceny plní samy; výsledek každého feedu je na stránce **Stav dat**.

**Jak párování funguje:** EAN má přednost. Jinak musí položka feedu obsahovat všechna slova z názvu produktu i všechna čísla z názvu a podtitulu (256 GB, 100 ml, 55"). Vynechá se příslušenství (kryt, sklo, řemínek, tester, náplně…), jiné varianty modelu (Pro, Max, Ultra, FE, Lite…) i nabídky s nesmyslnou cenou (pod 45 % nebo nad 220 % poslední ceny). Zboží „out of stock“ z Google feedu se přeskočí.

**Formáty:** Heureka/Zboží XML (`SHOPITEM`), Google Merchant (RSS/Atom s `g:`), XML affiliate sítí (`<product>` s name/price/url nebo deeplink), CSV/TSV s hlavičkou (název, cena, odkaz, ean) i bez ní. Feed může být i zabalený `.gz`; limit 30 MB.

**Hlavní cena z feedů** platí pro elektro, mobily, sport a kosmetiku. U konkrétního feedu ji vypneš zaškrtávátkem „hlavní cena“ (pak plní jen ceny prodejce).

## Zabezpečení

Aplikace prošla bezpečnostní kontrolou (30 automatických testů včetně simulovaných útoků v `tests/security.test.js`).

| Hrozba | Ochrana |
|---|---|
| Hádání hesla do administrace | Heslo se posílá jen při přihlášení; po **8 špatných pokusech** je IP na **15 minut zablokovaná** (i pro správné heslo). Neúspěšné pokusy jsou v Historii úprav. Při heslu kratším než 12 znaků administrace ukáže varování. |
| Krádež přihlášení (XSS) | Heslo se v prohlížeči **neukládá**. Přihlášení drží podepsaný token v **HttpOnly cookie** (JavaScript ho nevidí), platí 8 hodin, změnou `ADMIN_PASSWORD` se zneplatní všechna. |
| CSRF (podvržený požadavek z cizího webu) | Cookie `SameSite=Strict` + povinná hlavička `x-bw-admin` + API přijímá jen `application/json` (formulář z cizí stránky neprojde). |
| XSS – vložení skriptu | Veškerý text se escapuje; odkazy jen `http(s)` (odkaz `javascript:` z feedu, importu nebo nastavení se zahodí na serveru i v prohlížeči); **Content-Security-Policy** zakazuje cizí a vložené skripty, inline obsluhy událostí i cizí rámy. |
| SSRF – zneužití stahování feedů | Server nestáhne adresy do vnitřní sítě (localhost, 10.x, 192.168.x, 169.254.169.254 metadata cloudu, IPv6 lokální), kontroluje i DNS a **každé přesměrování**, jen porty 80/443/8080/8443, časový limit 25 s, limit 30 MB i bez Content-Length. |
| Podvržené soubory | Nahraná fotka se kontroluje podle **skutečného obsahu** (JPEG/PNG/WebP), ne podle přípony; HTML/SVG převlečené za obrázek neprojde. Max. 3,5 MB. |
| Přístup do databáze z internetu | Firestore i Storage mají pravidla „vše zakázáno“ (`firestore.rules`, `storage.rules`); data čte a zapisuje jen server. |
| Zahlcení / spam | Omezení počtu požadavků: push hlídače bez přihlášení 20/h na IP, přihlášení uživatelé 300/10 min. Limity délek a počtů (seznamy, importy, zálohy, feedy). |
| Neplatná ID a vstupy | ID produktů jen `a-z0-9-` (žádné cesty v databázi), čísla v rozumných mezích, texty zkrácené, nastavení a obnova ze zálohy procházejí stejnou kontrolou. |
| Únik informací | Chyby pro veřejnost bez podrobností (ty jsou v logu Vercelu); porovnání tajných klíčů v konstantním čase (cron, API klíče); SEO stránka nevěří hlavičce `Host`. |
| Clickjacking, sniffing, HTTPS | `frame-ancestors 'none'` + `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Strict-Transport-Security`, `Permissions-Policy`, `Referrer-Policy`. |
| Zranitelné knihovny | `.github/dependabot.yml` každý týden zkontroluje balíčky a otevře pull request s opravou. Ručně: `npm audit`. |

**Co udělat po nasazení (5 minut):**
1. Silné `ADMIN_PASSWORD` (4–5 náhodných slov) a `CRON_SECRET` (aspoň 16 znaků) – nikdy je nikomu neposílej a nedávej do GitHubu.
2. Pravidla `firestore.rules` a `storage.rules` ve Firebase (viz Nasazení).
3. Firebase → Authentication → Settings: zapnout **Email enumeration protection** (útočník nezjistí, které e-maily mají účet) a v **Authorized domains** nechat jen svou doménu.
4. Vercel → Settings → Security: **Attack Challenge Mode** zapni, pokud by web někdo zahlcoval.
5. Na GitHubu u repozitáře zapni **Dependabot alerts** a **Secret scanning**.
6. Ověření hlaviček: https://securityheaders.com a https://observatory.mozilla.org (zadej svou doménu).

**Co zabezpečení neřeší:** odkazy na feedy s osobním klíčem jsou uložené ve Firestore (vidí je jen administrátor, ne návštěvníci) – kdo má přístup k Firebase projektu, vidí vše. Do Firebase konzole a na Vercel si zapni dvoufázové ověření.

## Samostatná HTML verze

`buywise.html` je celá aplikace v jednom souboru – stačí ho otevřít v prohlížeči.
- Běží s ukázkovými daty. Úpravy, importy (CSV, Excel, text, SDA), oblíbené, hlídače a portfolio se ukládají v prohlížeči.
- Zálohu stáhneš a nahraješ v sekci **Úpravy dat → Data a zálohy**.
- Živá data, přihlášení, e-maily a push má jen verze na Vercelu (prohlížeč z lokálního souboru nesmí stahovat cizí data).
- Po změně kódu ji vygeneruješ znovu: `npm run build:html`.

## Veřejné API

```
GET /api/v1                         seznam odvětví
GET /api/v1?category=elektro        žebříček se statistikami a odhadem
GET /api/v1?id=elektro-apple-iphone-17   produkt s celou historií
```
Když nastavíš `API_KEYS`, API vyžaduje hlavičku `x-api-key`.

## Jak funguje analytika

- **Trend:** sklon lineární regrese za 60 dní + skutečná změna za 30 dní, hranice ±1,5 %.
- **Odhad:** Holtovo exponenciální vyhlazování s tlumeným trendem (parametry se hledají automaticky), u spotřebního zboží navíc sezónní korekce. Pásmo nejistoty ~90 %.
- **Přesnost:** odhad z dat do data X se porovná se skutečnou cenou o 30 dní později (až 6 testů na produkt).
- **Sezónnost:** průměrná odchylka od dlouhodobého trendu podle kalendářního měsíce (u investic vypnutá – byl by to šum).
- **Podezřelá sleva:** cena v posledních 60 dnech zvednutá o 8 % a víc nad medián předchozích dnů a pak „zlevněná“ zpátky.
- **Signály:** klouzavé průměry 20/50, RSI(14), MACD(12,26,9), Bollinger(20,2) a trend; zpětný test ukazuje, jak by signál fungoval v minulosti.

Jde o statistické odhady, ne o investiční poradenství.

## Co aplikace neumí a proč

- **Google Trends** – Google nemá veřejné API.
- **Historická data z Hlídače cen** – bez veřejného API.
- **Heureka API** – jen pro smluvní partnery; náhradou jsou XML feedy e-shopů.
- **Automatické stahování z webů Invie, Alzy apod.** – porušuje jejich podmínky a weby ho blokují.
- **Placená prémiová verze** – potřebuje platební bránu (např. Stripe) a obchodní rozhodnutí; dá se doplnit později.

## Struktura projektu

```
public/             web (index.html, app.js, styles.css, sw.js, manifest, ikony)
public/lib/         výpočty a data sdílené s serverem: analytics, categories, seed, dataops
public/js/          jádro webu, grafy, uživatel, překlady (en.js), administrace
public/js/ui.js     click handler, drawer, accordion, tooltip, přechody
public/js/photos.js fotky na pozadí (Wikimedia Commons, vlastní fotky)
public/js/share.js  sdílecí obrázek produktu (canvas 1200 × 630)
public/js/tour.js   úvodní prohlídka
public/js/views/    … + wishlist (přání), calendar (kalendář), deals (pozor na akce), budget (rozpočet)
public/js/views/    stránky: přehled, odvětví, produkt, porovnání, oblíbené, portfolio, stav, admin
api/data.js         data pro web (lehká verze, detail, konfigurace, stav)
api/admin.js        administrace
api/user.js         účet, oblíbené, portfolio, hlídače, push
api/cron.js         denní aktualizace (Vercel Cron)
api/v1.js           veřejné API
api/page.js         SEO náhledy stránek produktů a odvětví
api/sitemap.js      sitemap.xml a robots.txt
api/_*.js           sdílené: databáze, zdroje dat, aktualizace, oznámení, ověření, _security.js (zabezpečení)
firestore.rules     pravidla databáze (vše zakázáno, přístup jen přes server)
storage.rules       pravidla úložiště souborů
tests/              testy + simulovaný Firebase
build-html.js       sestavení samostatné HTML verze
scripts/vapid.js    generátor klíčů pro push
```
