// Výchozí (ukázková) data. Pořadí aut vychází ze statistik SDA za 1–4/2026, destinace a knihy
// z veřejných žebříčků 2025/2026. Ceny jsou ORIENTAČNÍ – po nasazení je přepiš v administraci
// (uložení zruší štítek „ukázka“). Krypto, akcie, komodity, hry a paliva (Natural 95, nafta, LPG – ČSÚ)
// se po nasazení plní samy. Ceny paliv odpovídají průměru ČR podle ČSÚ za 43. týden 2026.

export const slug = (s) =>
  s
    .toString()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);

const steamImg = (id) => `https://cdn.cloudflare.steamstatic.com/steam/apps/${id}/header.jpg`;

// Položka: [název, podtitul, cena, poptávka (text), hodnota poptávky, konkurence [[prodejce, odchylka %]], demo drift % za 90 dní, doplňky]
// Sezónní profil: odchylka ceny v % pro leden…prosinec (jen pro ukázková data).
const RAW = {
  auta: {
    unit: 'Kč', vol: 0.002, season: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -1, -2],
    items: [
      ['Škoda Octavia', 'Liftback / Combi', 649900, '6 370 registrací (1–4/2026)', 6370, [['Autorizovaný dealer', 0], ['Autoesa', -2], ['Porsche Inter Auto', -1]], 2, { attrs: { consumption: 5.6, energy: 'benzin' } }],
      ['Škoda Kodiaq', 'SUV', 899900, '5 129 registrací (1–4/2026)', 5129, [['Autorizovaný dealer', 0], ['Autoesa', -2]], 1, { attrs: { consumption: 6.8, energy: 'benzin' } }],
      ['Škoda Scala', 'Hatchback', 479900, '4 108 registrací (1–4/2026)', 4108, [], -2, { attrs: { consumption: 5.4, energy: 'benzin' } }],
      ['Škoda Kamiq', 'Malé SUV', 529900, '4 063 registrací (1–4/2026)', 4063, [], 0, { attrs: { consumption: 5.6, energy: 'benzin' } }],
      ['Škoda Karoq', 'SUV', 699900, '3 990 registrací (1–4/2026)', 3990, [], -1, { attrs: { consumption: 6.2, energy: 'benzin' } }],
      ['Škoda Fabia', 'Hatchback', 399900, '3 975 registrací (1–4/2026)', 3975, [], 3, { attrs: { consumption: 5.0, energy: 'benzin' } }],
      ['Škoda Superb', 'Liftback / Combi', 999900, '7. místo (SDA)', 0, [], 1.5, { attrs: { consumption: 5.4, energy: 'nafta' } }],
      ['Toyota Corolla', 'Hatchback / Combi', 619900, 'doplň v administraci', 0, [], -3, { attrs: { consumption: 4.5, energy: 'benzin' } }],
      ['Hyundai Tucson', 'SUV', 789990, 'doplň v administraci', 0, [], -4, { attrs: { consumption: 6.5, energy: 'benzin' } }],
      ['Škoda Elroq', 'Elektromobil SUV', 799900, 'doplň v administraci', 0, [], -6, { attrs: { consumption: 16, energy: 'elektro', metric: 'km dojezdu', metricValue: 560 } }],
    ],
  },
  mobily: {
    unit: 'Kč', vol: 0.005, season: [1, 0, 0, 0, 0, 0, 0, 0, 3, 1, -5, -2],
    items: [
      ['Apple iPhone 17 Pro', '256 GB', 33990, 'Nejprodávanější prémiový telefon', 0, [['Alza', 0], ['iStyle', 1], ['Datart', 1], ['Mobil Pohotovost', -2]], -3, { attrs: { metric: 'GB', metricValue: 256 } }],
      ['Apple iPhone 16e', '128 GB', 16990, 'Nejlevnější iPhone', 0, [['Alza', 0], ['iStyle', 2], ['Mobil Pohotovost', -3]], -6, { attrs: { metric: 'GB', metricValue: 128 } }],
      ['Samsung Galaxy S25', '256 GB', 22990, 'Nejprodávanější Samsung vlajka', 0, [['Alza', 0], ['Datart', -2], ['CZC', 0], ['Mobil Pohotovost', -4]], -12, { attrs: { metric: 'GB', metricValue: 256 }, demo: 'dip', discount: 10 }],
      ['Samsung Galaxy A36', '128 GB', 7990, 'TOP střední třída', 0, [['Alza', 0], ['Datart', -1], ['CZC', 1]], -8, { attrs: { metric: 'GB', metricValue: 128 } }],
      ['Samsung Galaxy A16', '128 GB', 4290, 'Nejprodávanější levný telefon', 0, [['Alza', 0], ['Datart', 0], ['Mobil Pohotovost', -3]], -5, { attrs: { metric: 'GB', metricValue: 128 } }],
      ['Google Pixel 10', '128 GB', 21990, 'TOP fotomobil', 0, [['Alza', 0], ['CZC', -2], ['Mobil Pohotovost', -4]], -10, { attrs: { metric: 'GB', metricValue: 128 } }],
      ['Xiaomi 15T', '256 GB', 14990, 'TOP poměr cena/výkon', 0, [['Alza', 0], ['Datart', 1], ['Mobil Pohotovost', -3]], -9, { attrs: { metric: 'GB', metricValue: 256 } }],
      ['Motorola moto g85', '256 GB', 5490, 'Levný s velkou baterií', 0, [['Alza', 0], ['CZC', -2]], -7, { attrs: { metric: 'GB', metricValue: 256 } }],
      ['Honor 400 Lite', '256 GB', 6990, 'TOP do 7 000 Kč', 0, [['Alza', 0], ['Datart', 0]], -6, { attrs: { metric: 'GB', metricValue: 256 } }],
      ['Apple iPhone 15', '128 GB', 15990, 'Starší iPhone za nižší cenu', 0, [['Alza', 0], ['iStyle', 1], ['Mobil Pohotovost', -4]], -8, { attrs: { metric: 'GB', metricValue: 128 } }],
    ],
  },
  sport: {
    unit: 'Kč', vol: 0.005, season: [-6, -4, 2, 5, 5, 3, 0, -2, -4, -1, 1, 2],
    items: [
      ['Garmin Forerunner 265', 'Běžecké hodinky', 9990, 'Nejprodávanější sporttester', 0, [['Alza', 0], ['Sportisimo', 2], ['Top4Running', -1]], -6, { demo: 'dip', discount: 15 }],
      ['Nike Pegasus 41', 'Běžecké boty', 3490, 'Nejprodávanější běžecké boty', 0, [['Sportisimo', 0], ['Top4Running', -4], ['Zalando', -2]], -5],
      ['Author Solution', 'Horské kolo 29"', 21990, 'TOP horské kolo', 0, [['Bikeshop', 0], ['Sportisimo', 3]], -4],
      ['Elektrokolo Crussis e-Atland', 'Horské elektrokolo', 59990, 'Nejžádanější elektrokolo', 0, [['Crussis', 0], ['Alza', -3]], -8],
      ['Atomic Redster', 'Sjezdové lyže', 13990, 'TOP lyže na sezónu', 0, [['Sportisimo', 0], ['Snowbitch', -3], ['Hervis', 1]], 6],
      ['Xiaomi Electric Scooter 4', 'Elektrokoloběžka', 11990, 'Nejprodávanější koloběžka', 0, [['Alza', 0], ['Datart', -2]], -5],
      ['Adidas Ultraboost 5', 'Běžecké boty', 4590, 'Oblíbené běžecké boty', 0, [['Zalando', 0], ['Sportisimo', 1], ['Top4Running', -5]], -6],
      ['Insportline jednoruční činky', 'Sada 2 × 20 kg', 2490, 'TOP domácí posilovna', 0, [['Insportline', 0], ['Alza', 2]], -2],
      ['Coleman Darwin 3', 'Stan pro 3 osoby', 2990, 'Nejprodávanější stan', 0, [['Hudy', 0], ['Sportisimo', -2], ['Alza', 1]], -3],
      ['Apple Watch Series 11', '42 mm', 11990, 'Nejprodávanější chytré hodinky', 0, [['Alza', 0], ['iStyle', 1], ['Datart', 0]], -4],
    ],
  },
  kosmetika: {
    unit: 'Kč', vol: 0.004, season: [-3, -2, 0, 0, 0, 0, -1, -1, 0, 1, 2, 4],
    items: [
      ['Dior Sauvage', 'EDT 100 ml', 2990, 'Nejprodávanější pánský parfém', 0, [['Notino', 0], ['Douglas', 8], ['Sephora', 10]], -3],
      ['Chanel Coco Mademoiselle', 'EDP 50 ml', 3290, 'Nejprodávanější dámský parfém', 0, [['Notino', 0], ['Douglas', 9], ['Sephora', 9]], 0],
      ['CeraVe hydratační krém', '340 g', 389, 'Nejprodávanější péče o pleť', 0, [['Notino', 0], ['dm', -3], ['Rossmann', -2], ['Dr.Max', 4]], 2],
      ['La Roche-Posay Effaclar Duo+', '40 ml', 449, 'TOP péče o problematickou pleť', 0, [['Notino', 0], ['Dr.Max', 5], ['Benu', 4]], 1],
      ['The Ordinary Niacinamide 10 %', '30 ml', 219, 'Nejprodávanější sérum', 0, [['Notino', 0], ['Douglas', 6]], 3],
      ['Garnier micelární voda', '400 ml', 149, 'Nejprodávanější odličovač', 0, [['dm', 0], ['Rossmann', -5], ['Notino', 3]], 0],
      ['Dyson Airwrap', 'Multistyler', 14990, 'Nejžádanější styler', 0, [['Alza', 0], ['Notino', -2], ['Dyson', 3]], -5, { demo: 'fake' }],
      ['Oral-B iO 6', 'Elektrický kartáček', 2990, 'Nejprodávanější kartáček', 0, [['Alza', 0], ['dm', 5], ['Notino', -3]], -8],
      ['Philips OneBlade 360', 'Zastřihovač', 1290, 'Nejprodávanější holicí strojek', 0, [['Alza', 0], ['Datart', 2], ['Notino', -4]], -6],
      ['Nivea Creme', '150 ml', 119, 'Klasika v každé drogerii', 0, [['dm', 0], ['Rossmann', -4], ['Teta', 2]], 4],
    ],
  },
  nabytek: {
    unit: 'Kč', vol: 0.003, season: [-5, -3, 0, 1, 1, 0, -2, -2, 1, 2, 2, 1],
    items: [
      ['IKEA KALLAX', 'Regál 4 × 4', 2490, 'Nejprodávanější úložný systém', 0, [['IKEA', 0], ['Bazar (ojetý)', -45]], 0],
      ['IKEA MALM', 'Postel 160 × 200', 6990, 'Nejprodávanější postel', 0, [['IKEA', 0]], 2],
      ['Rohová sedačka', 'Látková, 3–4 místa', 19990, 'Nejžádanější typ sedačky', 0, [['Sconto', 0], ['XXXLutz', 6], ['Bonami', 3], ['IKEA', -8]], -4, { demo: 'fake' }],
      ['Taštičková matrace', '160 × 200 cm', 8990, 'Nejprodávanější matrace', 0, [['Möbelix', 0], ['XXXLutz', 7], ['Matrace.cz', -3]], -6],
      ['Kancelářská židle', 'Ergonomická, síťovaná', 4990, 'TOP pro home office', 0, [['Alza', 0], ['Kancelářský nábytek', 4], ['IKEA', -10]], -5],
      ['Výškově nastavitelný stůl', 'Elektrický, 140 × 70', 8990, 'Rostoucí poptávka', 0, [['Alza', 0], ['IKEA', 5], ['Bonami', 8]], -9],
      ['Jídelní stůl', 'Dub, 6 osob', 11990, 'Nejžádanější jídelní stůl', 0, [['Sconto', 0], ['Bonami', 10], ['IKEA', -15]], -2],
      ['IKEA PAX', 'Šatní skříň 200 × 236', 12990, 'Nejprodávanější šatní skříň', 0, [['IKEA', 0]], 3],
      ['IKEA POÄNG', 'Křeslo', 2990, 'Klasika do obýváku', 0, [['IKEA', 0], ['Bazar (ojetý)', -50]], 1],
      ['Kuchyňská linka', 'Rovná, 260 cm', 39990, 'Nejžádanější kuchyně', 0, [['Sconto', 0], ['IKEA', -10], ['Möbelix', -5], ['XXXLutz', 8]], 4],
    ],
  },
  pojisteni: {
    unit: 'Kč/rok', vol: 0.0015, season: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    items: [
      ['Povinné ručení', 'Osobní auto do 1 500 cm³', 3990, 'Nejsjednávanější pojištění', 0, [['Online srovnávač', -8], ['Pobočka pojišťovny', 6]], 6],
      ['Havarijní pojištění', 'Auto za 500 000 Kč', 11990, 'Nejčastější k novému autu', 0, [['Online srovnávač', -7], ['Pobočka pojišťovny', 5]], 7],
      ['Pojištění domácnosti', 'Byt 3+kk, pojistná částka 1 mil. Kč', 1890, 'Roste zájem po povodních', 0, [['Online srovnávač', -10]], 5],
      ['Pojištění nemovitosti', 'Rodinný dům, 6 mil. Kč', 4590, 'Roste zájem po povodních', 0, [['Online srovnávač', -9]], 6],
      ['Cestovní pojištění', 'Roční, Evropa, jedna osoba', 1290, 'Nejprodávanější před létem', 0, [['Online srovnávač', -12], ['Cestovní kancelář', 15]], 3],
      ['Životní pojištění', 'Rizikové, 35 let, 1 mil. Kč', 6990, 'Dlouhodobý zájem', 0, [['Online srovnávač', -6]], 2],
      ['Úrazové pojištění', 'Dospělý, základní krytí', 1490, 'Doplněk k životnímu', 0, [['Online srovnávač', -8]], 2],
      ['Pojištění odpovědnosti', 'Občanská odpovědnost, 5 mil. Kč', 590, 'Nejlevnější užitečné pojištění', 0, [['Online srovnávač', -10]], 2],
      ['Pojištění mazlíčka', 'Pes, léčebné výlohy', 3990, 'Rychle rostoucí zájem', 0, [['Online srovnávač', -5]], 8],
      ['Pojištění bytu pro pronajímatele', 'Byt 2+kk', 2490, 'Pro investiční byty', 0, [['Online srovnávač', -9]], 4],
    ],
  },
  ojete: {
    unit: 'Kč', vol: 0.004, season: [-1, -1, 1, 2, 2, 1, 0, 0, 0, -1, -1, -2],
    items: [
      ['Škoda Octavia', 'ojetá, cca 5 let', 289000, 'Nejhledanější ojetina', 0, [['Sauto', 0], ['TipCars', 2], ['AAA Auto', 5]], -4],
      ['Škoda Fabia', 'ojetá, cca 5 let', 189000, 'TOP malé auto', 0, [['Sauto', 0], ['TipCars', 1], ['AAA Auto', 4]], -3],
      ['Volkswagen Golf', 'ojetý, cca 5 let', 279000, 'TOP dovoz', 0, [['Sauto', 0], ['TipCars', 3]], -5],
      ['Škoda Superb', 'ojetá, cca 5 let', 389000, 'Firemní vozy', 0, [['Sauto', 0], ['AAA Auto', 6]], -6],
      ['Ford Focus', 'ojetý, cca 5 let', 199000, 'Levná kombi', 0, [['Sauto', 0], ['TipCars', 2]], -4],
      ['Hyundai i30', 'ojetý, cca 5 let', 219000, 'Spolehlivý hatchback', 0, [['Sauto', 0], ['TipCars', 1]], -3],
      ['Toyota Yaris', 'ojetá, cca 5 let', 229000, 'Hybrid do města', 0, [['Sauto', 0], ['AAA Auto', 4]], -1],
      ['BMW řady 3', 'ojeté, cca 5 let', 449000, 'Prémiový dovoz', 0, [['Sauto', 0], ['TipCars', 3]], -7],
      ['Volkswagen Passat', 'ojetý, cca 5 let', 299000, 'Firemní vozy', 0, [['Sauto', 0], ['AAA Auto', 5]], -6],
      ['Škoda Rapid', 'ojetá, cca 6 let', 149000, 'Levná ojetina', 0, [['Sauto', 0], ['TipCars', 2]], -2],
    ],
  },
  knihy: {
    unit: 'Kč', vol: 0.004, season: [-1, -1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 3],
    items: [
      ['Onyxová bouře', 'Rebecca Yarros', 549, 'TOP 10 celkově (SČKN)', 0, [['Kosmas', 0], ['Knihy Dobrovský', -4], ['Martinus', 2], ['Luxor', 1]], -5, { attrs: { metric: 'stránka', metricValue: 560 } }],
      ['Čas vos', 'Alena Mornštajnová', 399, 'Nejprodávanější u Kosmasu', 0, [['Kosmas', 0], ['Knihy Dobrovský', -3], ['Martinus', 1], ['Luxor', 0]], -3],
      ['Lov', 'Bernard Minier', 449, 'Nejprodávanější beletrie (SČKN)', 0, [['Kosmas', 0], ['Knihy Dobrovský', -5], ['Martinus', 1], ['Luxor', 2]], 0],
      ['Zeleninová zahrádka', 'Roman Pavela', 499, 'Nejprodávanější naučná (SČKN)', 0, [['Kosmas', 0], ['Knihy Dobrovský', -2], ['Martinus', 3]], 1],
      ['Šikmý kostel 3', 'Karin Lednická', 549, 'Dlouhodobý bestseller', 0, [['Kosmas', 0], ['Knihy Dobrovský', -6], ['Luxor', -1]], -8],
      ['Hospodyně', 'Freida McFadden', 399, 'Dlouhodobý bestseller', 0, [['Kosmas', 0], ['Knihy Dobrovský', -4], ['Martinus', -2]], -6],
      ['Náměsíčník', 'Lars Kepler', 499, 'TOP 10 beletrie', 0, [['Kosmas', 0], ['Knihy Dobrovský', -3], ['Luxor', 1]], -4],
      ['Myšlenky za volantem 2', 'Roman Šmucler', 449, 'TOP 10 beletrie', 0, [['Kosmas', 0], ['Knihy Dobrovský', -2]], 0],
      ['Atomové návyky', 'James Clear', 449, 'Bestseller literatury faktu', 0, [['Kosmas', 0], ['Knihy Dobrovský', -5], ['Martinus', 0]], 0.5],
      ['Křídla ze železa', 'Rebecca Yarros', 549, 'Dlouhodobý bestseller', 0, [['Kosmas', 0], ['Knihy Dobrovský', -7], ['Martinus', -1]], -9],
    ],
  },
  elektro: {
    unit: 'Kč', vol: 0.005, season: [2, 1, 1, 0, 0, 0, 1, 1, 2, 0, -6, -3],
    items: [
      ['Apple iPhone 17', '256 GB', 24990, 'Nejprodávanější telefon', 0, [['Alza', 0], ['Datart', 1], ['iStyle', 2], ['Mobil Pohotovost', -2]], -4, { attrs: { metric: 'GB', metricValue: 256 } }],
      ['Samsung Galaxy A56', '128 GB', 8990, 'Nejprodávanější Android', 0, [['Alza', 0], ['Datart', -2], ['CZC', 1]], -7, { attrs: { metric: 'GB', metricValue: 128 } }],
      ['Apple AirPods 4', 'ANC', 4990, 'Nejprodávanější sluchátka', 0, [['Alza', 0], ['Datart', 2], ['iStyle', 3]], -3],
      ['Nintendo Switch 2', 'Konzole', 12490, 'Nejprodávanější konzole', 0, [['Alza', 0], ['Datart', 0], ['CZC', 2], ['Smarty', -1]], 1],
      ['PlayStation 5 Slim', 'Digital Edition', 11990, 'TOP konzole', 0, [['Alza', 0], ['Datart', -1], ['CZC', 1]], -5],
      ['Philips Airfryer XXL', 'HD9285', 5990, 'Nejprodávanější kuchyňský spotřebič', 0, [['Alza', 0], ['Datart', -3], ['Mall', -2], ['Planeo', 1]], -6],
      ['Roborock Q7 Max+', 'Robotický vysavač', 9990, 'TOP vysavač', 0, [['Alza', 0], ['Datart', 2], ['Mall', -4]], -10],
      ['De’Longhi Magnifica S', 'Automatický kávovar', 7990, 'Nejprodávanější kávovar', 0, [['Alza', 0], ['Datart', -2], ['Planeo', 1]], -2],
      ['Samsung Crystal UHD 55"', '4K televizor', 10990, 'Nejprodávanější TV', 0, [['Alza', 0], ['Datart', -1], ['CZC', 1], ['Planeo', 0]], -8, { attrs: { metric: 'palec', metricValue: 55 } }],
      ['Xiaomi Redmi Note 15', '256 GB', 6990, 'TOP levný telefon', 0, [['Alza', 0], ['Datart', 1], ['Mobil Pohotovost', -3]], -6, { attrs: { metric: 'GB', metricValue: 256 } }],
    ],
  },
  tarify: {
    unit: 'Kč/měs.', vol: 0.001, season: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -2, -3],
    items: [
      ['T-Mobile – neomezená data', 'volání a SMS neomezeně', 949, 'Nejprodávanější tarif', 0, [], -2, { attrs: { metric: 'měsíc', metricValue: 1 } }],
      ['O2 – neomezená data', 'volání a SMS neomezeně', 999, 'TOP tarif', 0, [], -1],
      ['Vodafone – neomezená data', 'volání a SMS neomezeně', 899, 'TOP tarif', 0, [], -3],
      ['T-Mobile – 20 GB', 'volání neomezeně', 599, 'Střední tarif', 0, [], -2, { attrs: { metric: 'GB', metricValue: 20 } }],
      ['O2 – 20 GB', 'volání neomezeně', 649, 'Střední tarif', 0, [], -2, { attrs: { metric: 'GB', metricValue: 20 } }],
      ['Vodafone – 20 GB', 'volání neomezeně', 599, 'Střední tarif', 0, [], -4, { attrs: { metric: 'GB', metricValue: 20 } }],
      ['Kaktus – neomezené volání', 'virtuální operátor', 399, 'Oblíbený u mladých', 0, [], 0],
      ['Mobil.cz – 10 GB', 'virtuální operátor', 349, 'Levný tarif', 0, [], -1, { attrs: { metric: 'GB', metricValue: 10 } }],
      ['Tesco Mobile – 5 GB', 'virtuální operátor', 299, 'Levný tarif', 0, [], 0, { attrs: { metric: 'GB', metricValue: 5 } }],
      ['O2 – předplacená karta', 'bez závazku', 200, 'Kredit měsíčně', 0, [], 0],
    ],
  },
  vstupenky: {
    unit: 'Kč', vol: 0.006, season: [0, 0, 0, 0, 1, 4, 5, 3, 0, 0, 0, 2],
    items: [
      ['Kino', 'průměrná vstupenka', 219, 'Nejčastější kulturní akce', 0, [['Cinema City', 0], ['CineStar', -3]], 3],
      ['Hokejová extraliga', 'základní část', 450, 'Nejnavštěvovanější sport', 0, [], 4],
      ['Fotbalová Chance Liga', 'základní část', 350, 'TOP sport', 0, [], 3],
      ['Koncert v hale', 'průměr', 1490, 'Vyprodané koncerty', 0, [['Ticketmaster', 0], ['GoOut', 2]], 6],
      ['Letní festival', 'permanentka', 3990, 'Rostoucí zájem', 0, [['GoOut', 0], ['Ticketportal', 1]], 8],
      ['Muzikál', 'Praha', 990, 'Stálice divadel', 0, [['Ticketportal', 0], ['GoOut', 1]], 2],
      ['Divadlo', 'činohra', 590, 'Stálice', 0, [], 2],
      ['Aquapark', 'celodenní vstup', 450, 'Rodinný výlet', 0, [], 3],
      ['ZOO Praha', 'dospělý', 300, 'Nejnavštěvovanější atrakce', 0, [], 1],
      ['Escape room', 'skupina 4 osob', 1800, 'Firemní akce', 0, [], 0],
    ],
  },
  dovolene: {
    unit: 'Kč', vol: 0.006, season: [-8, -6, -4, -2, 2, 8, 14, 14, 4, -4, -8, -4],
    items: [
      ['Chorvatsko', 'Dalmácie, Istrie', 18900, 'Dlouhodobě nejoblíbenější', 0, [['Invia', 0], ['Čedok', 4], ['Fischer', 2]], 4],
      ['Řecko', 'Kréta, Rhodos', 22900, 'TOP letecká destinace', 0, [['Invia', 0], ['Čedok', 3], ['Fischer', -1], ['Exim Tours', 1]], 3],
      ['Turecko', 'Antalya, Side', 21900, 'Nejrychleji roste', 0, [['Invia', 0], ['Exim Tours', -2], ['Fischer', 1]], 5],
      ['Egypt', 'Hurghada, Marsa Alam', 19900, 'Celoročně žádaný', 0, [['Invia', 0], ['Exim Tours', -3], ['Čedok', 2]], 2],
      ['Itálie', 'Jadran, Sicílie', 17900, 'TOP autem', 0, [['Invia', 0], ['Čedok', 3]], 1],
      ['Bulharsko', 'Slunečné pobřeží', 15900, 'Žádané first minute', 0, [['Invia', 0], ['Fischer', 1], ['Exim Tours', -1]], 2],
      ['Albánie', 'Ksamil, Saranda', 16900, 'Rostoucí zájem 2026', 0, [['Invia', 0], ['Čedok', 4], ['Fischer', 2]], 6],
      ['Španělsko', 'Kanárské ostrovy, Mallorca', 26900, 'TOP letecká destinace', 0, [['Invia', 0], ['Čedok', 2], ['Exim Tours', 1]], 0],
      ['Spojené arabské emiráty', 'Dubaj, Ras Al Khaimah', 34900, 'Nejoblíbenější exotika', 0, [['Invia', 0], ['Čedok', 5], ['Exim Tours', 2]], -3],
      ['Zanzibar', 'Tanzanie', 42900, 'Rostoucí exotika', 0, [['Invia', 0], ['Čedok', 3], ['Fischer', 1]], -2],
    ],
  },
  potraviny: {
    unit: 'Kč', vol: 0.006, season: [1, 1, 0, 0, -1, -2, -2, -1, 0, 1, 2, 2],
    items: [
      ['Máslo', '250 g', 54.9, 'Nejsledovanější cena', 0, [['Kaufland', 0], ['Lidl', -2], ['Albert', 3], ['Billa', 4]], -6],
      ['Vejce', '10 ks, velikost M', 49.9, 'Základ nákupu', 0, [['Kaufland', 0], ['Lidl', -4], ['Albert', 2]], 5],
      ['Mléko polotučné', '1 l', 21.9, 'Základ nákupu', 0, [['Kaufland', 0], ['Lidl', -3], ['Albert', 4]], 1],
      ['Chléb', '1 kg', 49.9, 'Základ nákupu', 0, [['Kaufland', 0], ['Lidl', -6], ['Albert', 5]], 2],
      ['Káva zrnková', '1 kg', 449, 'Rychle zdražuje', 0, [['Kaufland', 0], ['Lidl', -5], ['Albert', 3], ['Tesco', 2]], 9],
      ['Kuřecí prsa', '1 kg', 189, 'Nejprodávanější maso', 0, [['Kaufland', 0], ['Lidl', -3], ['Albert', 4]], 2],
      ['Brambory', '1 kg', 18.9, 'Sezónní', 0, [['Kaufland', 0], ['Lidl', -4], ['Albert', 5]], -10],
      ['Jablka', '1 kg', 39.9, 'Sezónní', 0, [['Kaufland', 0], ['Lidl', -2], ['Albert', 3]], -8],
      ['Eidam 30 %', '100 g', 18.9, 'Nejprodávanější sýr', 0, [['Kaufland', 0], ['Lidl', -3], ['Albert', 2]], -1],
      ['Cukr krystal', '1 kg', 21.9, 'Základ nákupu', 0, [['Kaufland', 0], ['Lidl', -5], ['Albert', 2]], -4],
    ],
  },
  pohonne: {
    unit: 'Kč/l', vol: 0.004, season: [-2, -2, -1, 1, 2, 3, 3, 2, 0, -1, -2, -2],
    items: [
      ['Natural 95', 'benzin', 45.33, 'Nejprodávanější palivo', 0, [['Orlen', 0], ['MOL', 0.5], ['Shell', 3], ['OMV', 2]], -3],
      ['Nafta', 'motorová nafta', 47.55, 'Firemní flotily', 0, [['Orlen', 0], ['MOL', 0.4], ['Shell', 3], ['OMV', 2]], -4],
      ['LPG', 'autoplyn', 23.27, 'Levná alternativa', 0, [['Orlen', 0], ['MOL', 1]], -2],
      ['Natural 98', 'prémiový benzin', 48.9, 'Prémiové palivo', 0, [['Shell', 0], ['OMV', -1], ['MOL', -2]], -3],
      ['Prémiová nafta', 'aditivovaná', 50.4, 'Prémiové palivo', 0, [['Shell', 0], ['OMV', -1]], -4],
      ['CNG', 'stlačený zemní plyn', 39.9, 'Kč/kg', 0, [], 1, { unit: 'Kč/kg' }],
      ['Nabíjení DC', 'rychlonabíjení', 12.9, 'Rostoucí poptávka', 0, [['ČEZ', 0], ['PRE', -3], ['Ionity', 25]], 0, { unit: 'Kč/kWh' }],
      ['Nabíjení AC', 'veřejné stojany', 8.9, 'Rostoucí poptávka', 0, [['ČEZ', 0], ['PRE', -2]], 0, { unit: 'Kč/kWh' }],
      ['AdBlue', 'stojan', 17.9, 'Nafta Euro 6', 0, [], -1],
      ['Elektřina doma', 'nabíjení wallbox', 5.4, 'Nejlevnější km', 0, [], -2, { unit: 'Kč/kWh' }],
    ],
  },
  energie: {
    unit: 'Kč/kWh', vol: 0.006, season: [6, 5, 3, -1, -4, -6, -6, -5, -2, 1, 3, 6],
    items: [
      ['Elektřina', 'silová + distribuce, D02d', 5.9, 'Každá domácnost', 0, [['ČEZ', 0], ['E.ON', -2], ['PRE', 1], ['Bohemia Energy', -5]], -3],
      ['Zemní plyn', 'včetně distribuce', 2.4, 'Vytápění', 0, [['ČEZ', 0], ['innogy', -1], ['E.ON', -3]], -4],
      ['Elektřina spot', 'OTE, denní trh', 2.3, 'Spotové tarify rostou', 0, [], -8],
      ['Teplo (CZT)', 'dálkové vytápění', 780, 'Panelové domy', 0, [], 1, { unit: 'Kč/GJ' }],
      ['Dřevo palivové', 'tvrdé, štípané', 2200, 'Krby a kamna', 0, [], 4, { unit: 'Kč/prm' }],
      ['Pelety', 'dřevěné, 15 kg pytle', 6900, 'Kotle na biomasu', 0, [], 3, { unit: 'Kč/t' }],
      ['Hnědé uhlí', 'ořech 2', 5900, 'Klesající zájem', 0, [], 1, { unit: 'Kč/t' }],
      ['Fotovoltaika 5 kWp', 's instalací', 189000, 'Nejžádanější investice do domu', 0, [['Instalatér A', 0], ['Instalatér B', 5]], -6, { unit: 'Kč', attrs: { metric: 'kWp', metricValue: 5 } }],
      ['Tepelné čerpadlo', 'vzduch–voda, s instalací', 290000, 'Dotace NZÚ', 0, [], -3, { unit: 'Kč' }],
      ['Bateriové úložiště', '10 kWh', 149000, 'Rostoucí zájem', 0, [], -9, { unit: 'Kč', attrs: { metric: 'kWh', metricValue: 10 } }],
    ],
  },
  nemovitosti: {
    unit: 'Kč/m²', vol: 0.0015, season: [0, 0, 1, 1, 1, 0, -1, -1, 0, 0, 0, -1],
    items: [
      ['Praha', 'byty, nabídkové ceny', 145000, 'Největší poptávka', 0, [], 3],
      ['Brno', 'byty, nabídkové ceny', 110000, 'Druhá největší poptávka', 0, [], 3],
      ['Plzeň', 'byty, nabídkové ceny', 72000, 'Rostoucí zájem', 0, [], 2],
      ['Olomouc', 'byty, nabídkové ceny', 75000, 'Studentské město', 0, [], 2],
      ['Hradec Králové', 'byty, nabídkové ceny', 78000, 'Stabilní poptávka', 0, [], 1.5],
      ['České Budějovice', 'byty, nabídkové ceny', 74000, 'Stabilní poptávka', 0, [], 1.5],
      ['Liberec', 'byty, nabídkové ceny', 65000, 'Stabilní poptávka', 0, [], 1],
      ['Pardubice', 'byty, nabídkové ceny', 70000, 'Rostoucí zájem', 0, [], 2],
      ['Ostrava', 'byty, nabídkové ceny', 48000, 'Nejdostupnější krajské město', 0, [], 3.5],
      ['Zlín', 'byty, nabídkové ceny', 68000, 'Stabilní poptávka', 0, [], 1],
    ],
  },
  hry: {
    unit: 'Kč', vol: 0.006, season: [0, 2, 1, 0, 0, -8, -4, 2, 2, 0, -5, -9],
    items: [
      ['Battlefield 6', 'EA', 1799, '312 000 hráčů online', 312000, [['Steam', 0], ['Xzone', -6], ['Gamesplanet', -10]], -8, { image: steamImg(2807960) }],
      ['Hollow Knight: Silksong', 'Team Cherry', 479, '98 000 hráčů online', 98000, [['Steam', 0], ['Xzone', -3]], 0, { image: steamImg(1030300) }],
      ['EA SPORTS FC 26', 'EA', 1799, '74 000 hráčů online', 74000, [['Steam', 0], ['Xzone', -12], ['Gamesplanet', -15]], -18],
      ['Kingdom Come: Deliverance II', 'Warhorse Studios', 1499, '41 000 hráčů online', 41000, [['Steam', 0], ['Xzone', -8]], -12, { image: steamImg(1771300) }],
      ['Borderlands 4', '2K', 1749, '38 000 hráčů online', 38000, [['Steam', 0], ['Gamesplanet', -14]], -20, { image: steamImg(1285190) }],
      ['Cyberpunk 2077', 'CD Projekt', 1199, '35 000 hráčů online', 35000, [['Steam', 0], ['GOG', 0], ['Xzone', -10]], -4, { image: steamImg(1091500) }],
      ['Baldur’s Gate 3', 'Larian', 1299, '62 000 hráčů online', 62000, [['Steam', 0], ['GOG', 0]], 0, { image: steamImg(1086940) }],
      ['Monster Hunter Wilds', 'Capcom', 1599, '29 000 hráčů online', 29000, [['Steam', 0], ['Gamesplanet', -18]], -15, { image: steamImg(2246340) }],
      ['Elden Ring Nightreign', 'Bandai Namco', 999, '27 000 hráčů online', 27000, [['Steam', 0], ['Xzone', -9]], -6, { image: steamImg(2622380) }],
      ['Grand Theft Auto V', 'Rockstar', 749, '88 000 hráčů online', 88000, [['Steam', 0], ['Xzone', -20]], -2, { image: steamImg(271590) }],
    ],
  },
  komodity: {
    unit: null, vol: 0.014, season: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    items: [
      ['Ropa Brent', 'Kč za barel', 1390, '1,42× průměru', 1.42, [], -6, { unit: 'Kč/barel' }],
      ['Ropa WTI', 'Kč za barel', 1320, '1,31× průměru', 1.31, [], -7, { unit: 'Kč/barel' }],
      ['Zlato', 'Kč za trojskou unci', 86500, '1,28× průměru', 1.28, [], 9, { unit: 'Kč/oz' }],
      ['Zemní plyn', 'Kč za MMBtu', 74, '1,22× průměru', 1.22, [], 12, { unit: 'Kč/MMBtu' }],
      ['Měď', 'Kč za libru', 108, '1,15× průměru', 1.15, [], 4, { unit: 'Kč/lb' }],
      ['Stříbro', 'Kč za trojskou unci', 1010, '1,12× průměru', 1.12, [], 11, { unit: 'Kč/oz' }],
      ['Pšenice', 'Kč za bušl', 112, '1,05× průměru', 1.05, [], -3, { unit: 'Kč/bušl' }],
      ['Kukuřice', 'Kč za bušl', 90, '0,98× průměru', 0.98, [], -2, { unit: 'Kč/bušl' }],
      ['Káva Arabica', 'Kč za libru', 82, '0,94× průměru', 0.94, [], -10, { unit: 'Kč/lb' }],
      ['Cukr', 'Kč za libru', 3.6, '0,9× průměru', 0.9, [], -5, { unit: 'Kč/lb' }],
    ],
  },
  krypto: {
    unit: 'Kč', vol: 0.025, season: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    items: [
      ['Bitcoin', 'BTC', 2350000, '890 mld. Kč za 24 h', 890e9, [['Coinmate', 0], ['Anycoin', 1.5], ['Binance', -0.3]], 6],
      ['Ethereum', 'ETH', 85000, '420 mld. Kč za 24 h', 420e9, [['Coinmate', 0], ['Anycoin', 1.5], ['Binance', -0.3]], -4],
      ['Solana', 'SOL', 4200, '95 mld. Kč za 24 h', 95e9, [['Coinmate', 0], ['Binance', -0.4]], 10],
      ['XRP', 'XRP', 55, '80 mld. Kč za 24 h', 80e9, [['Coinmate', 0], ['Binance', -0.4]], -6],
      ['BNB', 'BNB', 21000, '45 mld. Kč za 24 h', 45e9, [['Binance', 0]], 3],
      ['Dogecoin', 'DOGE', 5.2, '40 mld. Kč za 24 h', 40e9, [['Binance', 0], ['Anycoin', 2]], -12],
      ['Cardano', 'ADA', 18, '18 mld. Kč za 24 h', 18e9, [['Binance', 0], ['Coinmate', 0.5]], -8],
      ['TRON', 'TRX', 7, '15 mld. Kč za 24 h', 15e9, [['Binance', 0]], 2],
      ['Chainlink', 'LINK', 420, '14 mld. Kč za 24 h', 14e9, [['Binance', 0]], -5],
      ['Litecoin', 'LTC', 2300, '12 mld. Kč za 24 h', 12e9, [['Coinmate', 0], ['Binance', -0.3]], -3],
    ],
  },
  akcie: {
    unit: 'Kč', vol: 0.016, season: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    items: [
      ['NVIDIA', 'NVDA, NASDAQ', 4200, '1,38× průměru', 1.38, [], 12],
      ['ČEZ', 'CEZ, Burza Praha', 1050, '1,31× průměru', 1.31, [], 4],
      ['Tesla', 'TSLA, NASDAQ', 8500, '1,27× průměru', 1.27, [], -9],
      ['Apple', 'AAPL, NASDAQ', 5300, '1,18× průměru', 1.18, [], 3],
      ['Komerční banka', 'KOMB, Burza Praha', 950, '1,12× průměru', 1.12, [], 5],
      ['Microsoft', 'MSFT, NASDAQ', 10500, '1,08× průměru', 1.08, [], 2],
      ['Amazon', 'AMZN, NASDAQ', 4800, '1,05× průměru', 1.05, [], 4],
      ['MONETA Money Bank', 'MONET, Burza Praha', 140, '1,02× průměru', 1.02, [], 6],
      ['Alphabet', 'GOOGL, NASDAQ', 4100, '0,97× průměru', 0.97, [], 7],
      ['Erste Group', 'ERBAG, Burza Praha', 1600, '0,93× průměru', 0.93, [], 8],
    ],
  },
};

// Deterministický generátor, aby ukázkové grafy vypadaly pokaždé stejně.
function rng(seedStr) {
  let h = 2166136261;
  for (const c of seedStr) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => {
    h += 0x6d2b79f5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DAY = 86400000;
const iso = (t) => new Date(t).toISOString().slice(0, 10);
const roundP = (p, ref) => +p.toFixed(ref < 20 ? 3 : ref < 1000 ? 2 : 0);

// Náhodná procházka pozpátku od dnešní ceny + sezónní profil (konec = dnešní cena).
function demoHistory(id, endPrice, driftPct90, days, vol, season) {
  const r = rng(id);
  const today = Date.now();
  const mNow = new Date(today).getUTCMonth();
  const sf = (t) => (1 + (season[new Date(t).getUTCMonth()] || 0) / 100) / (1 + (season[mNow] || 0) / 100);
  const out = [];
  let base = endPrice;
  const dailyDrift = driftPct90 / 100 / 90;
  for (let i = 0; i < days; i++) {
    const t = today - i * DAY;
    out.push({ d: iso(t), p: roundP(base * sf(t), endPrice) });
    base = base / (1 + dailyDrift + (r() - 0.5) * 2 * vol);
  }
  return out.reverse();
}

// Ukázky pro stránku „Pozor na tyto akce“: zdražení před „slevou“ a sleva, která není nejnižší cenou za 30 dní.
function demoPattern(hist, kind) {
  const n = hist.length;
  return hist.map((x, i) => {
    const ago = n - 1 - i;
    if (kind === 'fake' && ago >= 12 && ago <= 24) return { ...x, p: roundP(x.p * 1.14, x.p) };
    if (kind === 'fake' && ago >= 8 && ago < 12) return { ...x, p: roundP(x.p * 1.06, x.p) };
    if (kind === 'dip' && ago >= 18 && ago <= 25) return { ...x, p: roundP(x.p * 0.9, x.p) };
    return x;
  });
}

function demoRankHistory(id, rank) {
  const r = rng(id + 'rh');
  const out = [];
  let cur = rank;
  const today = Date.now();
  for (let w = 0; w < 26; w++) {
    out.push({ d: iso(today - w * 7 * DAY), r: cur });
    if (r() < 0.45) cur = Math.max(1, Math.min(12, cur + (r() < 0.5 ? -1 : 1)));
  }
  return out.reverse();
}

const round = (x) => (x >= 100 ? Math.round(x) : +x.toFixed(2));
const today = () => iso(Date.now());

function base(cat, def, it, i) {
  const [name, subtitle, price, demand, demandValue, , , extra = {}] = it;
  return {
    id: `${cat}-${slug(name)}`,
    category: cat,
    rank: i + 1,
    prevRank: null,
    name,
    subtitle,
    unit: extra.unit || def.unit || 'Kč',
    demand,
    demandValue,
    image: extra.image || '',
    ...(extra.discount ? { discount: extra.discount } : {}),
    attrs: extra.attrs || {},
    sample: true,
    active: true,
    updatedAt: new Date().toISOString(),
  };
}

// Produkty jen s dnešní cenou – pro naplnění Firestore.
export function seedProducts() {
  const list = [];
  for (const [cat, def] of Object.entries(RAW)) {
    def.items.forEach((it, i) => {
      const p = base(cat, def, it, i);
      list.push({
        ...p,
        prices: [{ d: today(), p: it[2] }],
        rankHistory: [{ d: today(), r: i + 1 }],
        competitors: it[5].map(([n, off]) => ({ name: n, url: '', prices: [{ d: today(), p: round(it[2] * (1 + off / 100)) }] })),
      });
    });
  }
  return list;
}

// Ukázkový režim: stejné produkty + vygenerovaná dvouletá historie (se sezónností), aby šly vidět všechny funkce.
export function demoProducts() {
  const out = [];
  for (const [cat, def] of Object.entries(RAW)) {
    def.items.forEach((it, i) => {
      const p = base(cat, def, it, i);
      const [, , price, , , comps, drift] = it;
      const r = rng(p.id + 'rank');
      const rh = demoRankHistory(p.id, i + 1);
      rh[rh.length - 1].r = i + 1;
      out.push({
        ...p,
        prevRank: rh.length > 1 ? rh[rh.length - 2].r : Math.max(1, Math.min(10, i + 1 + Math.round((r() - 0.5) * 4))),
        prices: demoPattern(demoHistory(p.id, price, drift, 730, def.vol, def.season), (it[7] || {}).demo),
        rankHistory: rh,
        competitors: comps.map(([n, off], k) => ({
          name: n,
          url: '',
          prices: demoHistory(p.id + n, price * (1 + off / 100), drift + (k - 1) * 3, 240, def.vol * 1.3, def.season),
        })),
      });
    });
  }
  return out;
}

// Orientační kurzy pro ukázkový režim (reálné bere aplikace z ČNB).
export const DEMO_RATES = { USD: 21.2, EUR: 24.4, date: 'ukázka' };
