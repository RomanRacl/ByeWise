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
npm test           # 24 testů (výpočty, skóre, rozpočet, importy, celý server se simulovaným Firebase)
```

Pro připojení k Firebase zkopíruj `.env.example` do `.env.local` a vyplň hodnoty.

## Nasazení krok za krokem

### 1. Firebase
1. Na https://console.firebase.google.com vytvoř projekt.
2. **Build → Firestore Database → Create database** (režim *production*, lokace `eur3` nebo `europe-west3`).
3. V záložce **Rules** vlož obsah souboru `firestore.rules` a publikuj (prohlížeč do databáze nesmí, všechno jde přes server).
4. **Project settings → Service accounts → Generate new private key.** Stáhne se JSON. Nikdy ho nedávej na GitHub.

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
   `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`, `ADMIN_PASSWORD`, `CRON_SECRET`, a doporučeně `SITE_URL`.
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
| Ceny z e-shopů | Administrace → Nastavení → Feedy: odvětví, prodejce a URL feedu (Heureka XML, Google Merchant nebo CSV `název;cena;odkaz;ean`). Tlačítko **Otestovat** ukáže, kolik produktů se spárovalo. Limit 30 MB na feed. |

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
api/_*.js           sdílené: databáze, zdroje dat, aktualizace, oznámení, ověření
tests/              testy + simulovaný Firebase
build-html.js       sestavení samostatné HTML verze
scripts/vapid.js    generátor klíčů pro push
```
