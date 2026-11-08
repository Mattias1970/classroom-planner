/**
 * Del 229 · Binogi-förslag per delkapitel.
 *
 * Binogi har inget öppet API och app.binogi.se kräver inloggning, så appen kan inte söka live.
 * I stället matchas varje delkapitel (rubrik, begrepp, begreppsförklaringar, genomgångstext) mot
 * en inbyggd katalog av Binogi-lektioner (titel, nyckelord, adress). Träffarna är förslag som
 * läraren öppnar, kontrollerar och lägger på lektionen — `verifierad: false` betyder att adressen
 * är härledd ur titeln (Binogis mönster: gemener, å→aa, ä→ae, ö→oe, mellanslag→bindestreck) och
 * inte kontrollerad i Binogi ännu. Läraren kan lägga till egna katalogposter.
 */
import type { Bok, Delkapitel, Kapitel } from './typer.js';

export interface BinogiPost {
  titel: string;
  /** Lektionens slug i adressen https://app.binogi.se/l/<slug>. */
  slug: string;
  amne: 'Kemi' | 'Fysik' | 'Biologi' | 'Teknik' | 'Matematik';
  /** Ord och begrepp lektionen handlar om — det som matchas mot delkapitlet. */
  nyckelord: string[];
  /** Adressen är kontrollerad i Binogi. */
  verifierad: boolean;
}

export interface BinogiForslag {
  post: BinogiPost;
  url: string;
  /** Poäng: hur väl lektionen passar delkapitlet (högre = bättre). */
  poang: number;
  /** Vad som matchade (begrepp/ord i delkapitlet). */
  traffar: string[];
  /** Filmen finns redan bland delkapitlets filmer i boken. */
  redanIBoken: boolean;
}

export interface DelkapitelForslag {
  kod: string;
  namn: string;
  forslag: BinogiForslag[];
  /** Söksträng att använda i Binogi när inget passar. */
  sokord: string[];
}

export const BINOGI_BAS = 'https://app.binogi.se/l/';

/** Binogis adressmönster ur en titel: 'Kolets kretslopp' → 'kolets-kretslopp', 'Förbränning' → 'foerbraenning'. */
export function binogiSlug(titel: string): string {
  return titel.toLowerCase()
    .replace(/å/g, 'aa').replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/é/g, 'e')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

export function binogiUrl(post: BinogiPost): string { return `${BINOGI_BAS}${post.slug}`; }

/** Sökadress utanför Binogi (Binogi saknar öppen sökning): Google begränsat till app.binogi.se. */
export function binogiSokUrl(ord: string[]): string {
  return `https://www.google.com/search?q=${encodeURIComponent(`site:app.binogi.se ${ord.join(' ')}`)}`;
}

const K = (titel: string, nyckelord: string[], amne: BinogiPost['amne'] = 'Kemi', slug?: string, verifierad = false): BinogiPost =>
  ({ titel, slug: slug ?? binogiSlug(titel), amne, nyckelord, verifierad });

/**
 * Inbyggd katalog. Titlarna är Binogis lektionsnamn så som de brukar heta i åk 7–9; adresserna är
 * härledda och markeras verifierade först när läraren (eller en senare Del) kontrollerat dem.
 * Biologins poster från Del 226 är kontrollerade.
 */
export const BINOGI_KATALOG: readonly BinogiPost[] = [
  // ── Kemi · kolföreningar / organisk kemi ──
  K('Kolets kemi', ['kol', 'kolatom', 'kolförening', 'organisk kemi', 'oorganisk kemi', 'fyra bindningar', 'bindning', 'organiska ämnen']),
  K('Kolväten', ['kolväte', 'metan', 'etan', 'propan', 'butan', 'alkan', 'alkanserien', 'strukturformel', 'molekylformel', 'pentan', 'gasol']),
  K('Isomerer', ['isomer', 'isomerer', 'normalbutan', 'isobutan', 'grenad', 'molekyler med olika form']),
  K('Alkener och alkyner', ['alken', 'alkyn', 'eten', 'etyn', 'propen', 'buten', 'dubbelbindning', 'trippelbindning', 'omättade kolväten', 'mättade kolväten', 'acetylen']),
  K('Alkoholer', ['alkohol', 'alkoholer', 'oh-grupp', 'metanol', 'etanol', 'träsprit', 'glykol', 'glycerol', 'jäsning', 'jästsvampar']),
  K('Organiska syror', ['organisk syra', 'organiska syror', 'syragrupp', 'cooh', 'metansyra', 'myrsyra', 'etansyra', 'ättiksyra', 'vinäger', 'stearinsyra', 'palmitinsyra', 'citronsyra', 'mjölksyra']),
  K('Estrar', ['ester', 'estrar', 'etyletanoat', 'doft', 'smak', 'aromämnen', 'nitroglycerin']),
  K('Molekylmodeller', ['molekylmodell', 'strukturformel', 'molekylformel', 'kalottmodell', 'pinn-kulmodell']),
  // ── Kemi · kol, bränslen och förbränning ──
  K('Kolets former', ['diamant', 'grafit', 'amorft kol', 'aktivt kol', 'fullerener', 'fotbollsmolekyler', 'nanorör', 'grafen', 'former av kol']),
  K('Fossila bränslen', ['fossila bränslen', 'råolja', 'naturgas', 'stenkol', 'olja', 'bensin', 'diesel', 'ta slut']),
  K('Raffinering av råolja', ['raffinaderi', 'råolja', 'fraktionerad destillation', 'destillation', 'bensin', 'fotogen', 'eldningsolja', 'asfalt', 'separeras']),
  K('Kolets kretslopp', ['kolets kretslopp', 'kretslopp', 'kolatom', 'fotosyntes', 'cellandning', 'koldioxid', 'kolsänka']),
  K('Fotosyntes och förbränning', ['fotosyntes', 'förbränning', 'energiomvandling', 'koldioxid', 'syre', 'glukos', 'energi']),
  K('Förbränning', ['förbränning', 'brinner', 'syre', 'koldioxid', 'vatten', 'fullständig förbränning', 'ofullständig förbränning', 'kolmonoxid', 'sot']),
  K('Växthuseffekten', ['växthuseffekten', 'växthusgas', 'koldioxid', 'metan', 'klimat', 'global uppvärmning', 'påverkar miljön']),
  K('Luftföroreningar', ['luftföroreningar', 'försurning', 'svaveldioxid', 'kväveoxider', 'partiklar', 'marknära ozon', 'miljön']),
  K('Eld och brandsläckning', ['eld', 'brand', 'brandtriangeln', 'bränsle', 'syre', 'värme', 'antändningstemperatur', 'släcka', 'brandsläckare', 'kväva']),
  K('Biobränslen', ['biobränsle', 'biobränslen', 'biogas', 'etanol', 'förnybara bränslen', 'bioraffinaderi', 'ersätter oljan']),
  // ── Kemi · övrigt högstadiet (för andra kapitel i boken) ──
  K('Atomen', ['atom', 'proton', 'neutron', 'elektron', 'atomkärna', 'elektronskal']),
  K('Periodiska systemet', ['periodiska systemet', 'grundämne', 'grupp', 'period', 'ädelgas', 'alkalimetall', 'halogen']),
  K('Kemiska bindningar', ['jonbindning', 'kovalent bindning', 'metallbindning', 'molekyl', 'jon', 'bindning']),
  K('Syror och baser', ['syra', 'bas', 'ph', 'vätejon', 'hydroxidjon', 'neutralisation', 'indikator']),
  K('Kemiska reaktioner', ['kemisk reaktion', 'reaktionsformel', 'reaktant', 'produkt', 'balansera', 'massans bevarande']),
  K('Metaller', ['metall', 'legering', 'rost', 'korrosion', 'ädla metaller', 'oädla metaller', 'spänningsserien']),
  K('Vatten som lösningsmedel', ['lösning', 'lösningsmedel', 'löslighet', 'vatten', 'polär', 'opolär']),
  K('Plaster', ['plast', 'polymer', 'monomer', 'polyeten', 'termoplast', 'härdplast', 'återvinning']),
  K('Kolhydrater', ['kolhydrat', 'socker', 'glukos', 'stärkelse', 'cellulosa', 'druvsocker']),
  K('Fetter', ['fett', 'fettsyra', 'mättat fett', 'omättat fett', 'glycerol', 'ester']),
  K('Proteiner', ['protein', 'aminosyra', 'enzym']),
  // ── Fysik (urval) ──
  K('Energiformer och energiomvandlingar', ['energi', 'energiform', 'energiomvandling', 'rörelseenergi', 'lägesenergi', 'kemisk energi', 'värmeenergi'], 'Fysik'),
  K('Energikällor', ['energikälla', 'förnybar', 'icke förnybar', 'kärnkraft', 'vattenkraft', 'vindkraft', 'solenergi', 'fossila bränslen'], 'Fysik'),
  // ── Biologi · Del 226 (kontrollerade adresser) ──
  K('Nervsystemet', ['nervsystemet', 'nervcell', 'nervimpuls', 'centrala nervsystemet'], 'Biologi', 'nervsystemet', true),
  K('Nervreflexer', ['reflex', 'ryggmärg', 'synaps'], 'Biologi', 'nervreflexer', true),
  K('Hjärnans anatomi', ['storhjärna', 'hjärnbark', 'hjärnstam', 'lillhjärna', 'hjärnhinnor'], 'Biologi', 'hjaernans-anatomi', true),
  K('Hjärnan', ['hjärnan', 'hjärnbark', 'hjärncentra', 'lober'], 'Biologi', 'hjaernan', true),
  K('Hur minnet fungerar', ['minne', 'korttidsminne', 'långtidsminne', 'hippocampus'], 'Biologi', 'hur-minnet-fungerar', true),
  K('Smak och lukt', ['smak', 'lukt', 'smaklök', 'luktsinne'], 'Biologi', 'smak-och-lukt', true),
  K('Huden', ['hud', 'känsel', 'känselkropp'], 'Biologi', 'huden', true),
  K('Synen', ['syn', 'öga', 'näthinna', 'pupill', 'lins', 'tappar', 'stavar'], 'Biologi', 'synen', true),
  K('Hörseln', ['hörsel', 'öra', 'trumhinna', 'hörselsnäcka', 'balans'], 'Biologi', 'hoerseln', true),
  K('Endokrina system och hormoner', ['hormon', 'körtel', 'hypofys', 'receptor', 'endokrina'], 'Biologi', 'endokrina-system-och-hormoner', true),
  K('Djurcellen', ['cell', 'cellmembran', 'cellkärna', 'mitokondrie', 'ribosom'], 'Biologi', 'djurcellen', true),
  K('Matspjälkningen – från munnen till magen', ['matspjälkning', 'enzym', 'magsaft', 'magsäck'], 'Biologi', 'matspjaelkningen-fraan-munnen-till-magen', true),
  K('Andningen', ['andning', 'lungor', 'luftrör', 'lungblåsor', 'diafragma'], 'Biologi', 'andningen', true),
  K('Hjärt- och kärlsystemet', ['blodomlopp', 'artär', 'ven', 'kapillär', 'hjärta'], 'Biologi', 'hjaert-och-kaerlsystemet', true),
  K('Blodet', ['blod', 'blodplasma', 'hemoglobin', 'röda blodkroppar', 'vita blodkroppar', 'blodplättar'], 'Biologi', 'blodet', true),
  K('Immunförsvaret', ['immunförsvar', 'antikropp', 'vit blodkropp', 'infektion'], 'Biologi', 'immunfoersvaret', true),
  K('Virus', ['virus', 'infektion', 'vaccin'], 'Biologi', 'virus', true),
];

/** Normaliserar text för jämförelse: gemener, utan skiljetecken. */
function norm(t: string): string { return t.toLowerCase().replace(/[^a-zåäö0-9\s-]/g, ' ').replace(/\s+/g, ' ').trim(); }

/** Ordstam för enkel böjningsmatchning: 'alkanerna' ~ 'alkan' (första 5 tecknen när ordet är längre). */
function stam(ord: string): string { const o = norm(ord); return o.length > 6 ? o.slice(0, 5) : o; }

/** Delkapitlets text att matcha mot: rubrik, begrepp, förklaringar och lektionernas texter. */
function delkapitelText(kap: Kapitel, d: Delkapitel): { text: string; begrepp: string[] } {
  const begrepp = [...new Set([...d.begrepp, ...d.lektioner.flatMap((l) => (l.begrepp ?? '').split(',').map((b) => b.trim()))])].filter((b) => b !== '' && b !== '—');
  const forklaringar = Object.entries(kap.resurser.forklaringar ?? {}).filter(([b]) => begrepp.some((x) => norm(x) === norm(b))).map(([, f]) => f);
  const text = norm([d.namn, ...begrepp, ...forklaringar, ...d.lektioner.map((l) => `${l.avsnitt} ${l.genomgang ?? ''} ${l.sammanfattning ?? ''}`)].join(' '));
  return { text, begrepp };
}

/** Poängsätter en katalogpost mot ett delkapitel. */
function poangsatt(post: BinogiPost, text: string, begrepp: string[], rubrik: string): { poang: number; traffar: string[] } {
  const begreppN = begrepp.map(norm);
  const begreppStam = new Set(begreppN.map(stam));
  const traffar: string[] = [];
  const raknade = new Set<string>();
  let poang = 0;
  // Titelns ord i delkapitlets rubrik väger tungt (3): 'Förbränning' ↔ '10.4 Förbränning påverkar miljön'
  const rubrikN = norm(rubrik);
  for (const o of norm(post.titel).split(' ').filter((x) => x.length >= 4 && x !== 'och')) {
    if (rubrikN.includes(stam(o))) { poang += 3; traffar.push(`${o} (rubriken)`); raknade.add(stam(o)); }
  }
  for (const ord of post.nyckelord) {
    const n = norm(ord);
    if (raknade.has(stam(n))) continue;
    raknade.add(stam(n));
    if (begreppN.includes(n)) { poang += 3; traffar.push(ord); continue; }                 // exakt ett av delkapitlets begrepp
    if (n.length >= 4 && begreppStam.has(stam(n))) { poang += 2; traffar.push(ord); continue; }
    if (n.length >= 4 && text.includes(n)) { poang += 1; traffar.push(ord); }              // nämns i texten
  }
  return { poang, traffar };
}

/**
 * Förslag per delkapitel i ett kapitel. `extra` = lärarens egna katalogposter. Poster från andra
 * ämnen än bokens tas bara med när de passar mycket bra (poäng ≥ 5). Max `max` förslag per delkapitel.
 */
export function foreslaBinogiFilmer(bok: Bok, kapitelNr: number, extra: readonly BinogiPost[] = [], max = 4): DelkapitelForslag[] {
  const kap = bok.kapitel.find((k) => k.nr === kapitelNr);
  if (kap === undefined) return [];
  const katalog = [...extra, ...BINOGI_KATALOG];
  const bokAmne = (bok.amne ?? '').toLowerCase();
  return kap.delkapitel.map((d) => {
    const { text, begrepp } = delkapitelText(kap, d);
    const egnaUrl = new Set(kap.resurser.filmer.filter((f) => f.titel.startsWith(`${d.kod} `) || f.titel.startsWith(`${d.kod}·`) || f.titel.startsWith(`${d.kod} ·`)).map((f) => f.url));
    const forslag = katalog.map((post) => {
      const { poang, traffar } = poangsatt(post, text, begrepp, d.namn);
      const sammaAmne = post.amne.toLowerCase() === bokAmne;
      return { post, url: binogiUrl(post), poang: sammaAmne ? poang : poang - 2, traffar, redanIBoken: egnaUrl.has(binogiUrl(post)) };
    }).filter((f) => f.poang >= 3 && (f.traffar.length >= 2 || f.traffar.some((x) => x.endsWith('(rubriken)'))))
      .sort((a, b) => b.poang - a.poang || a.post.titel.localeCompare(b.post.titel, 'sv'))
      .slice(0, max);
    return { kod: d.kod, namn: d.namn, forslag, sokord: begrepp.slice(0, 3) };
  });
}
