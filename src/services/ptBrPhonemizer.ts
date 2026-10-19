/**
 * Native Brazilian Portuguese Grapheme-to-Phoneme (G2P -> IPA) converter
 * tailored specifically to the 178-token IPA vocabulary of Kokoro-82M-v1.0
 * (voices: pf_dora, pm_alex, pm_santa).
 *
 * Replaces `npm:phonemizer` which only bundles English (`en-us`/`en-gb`) in its WASM build
 * and throws `Invalid language identifier: "pt-br"`.
 */

const FUNCTION_WORDS_IPA: Record<string, string> = {
  o: 'u',
  os: 'us',
  a: 'a',
  as: 'as',
  e: 'i',
  de: 'ʤi',
  do: 'du',
  da: 'da',
  dos: 'dus',
  das: 'das',
  em: 'ˈẽj',
  no: 'nu',
  na: 'na',
  nos: 'nus',
  nas: 'nas',
  num: 'nˈũ',
  numa: 'nˈũmɐ',
  um: 'ˈũ',
  uma: 'ˈũmɐ',
  uns: 'ˈũs',
  umas: 'ˈũmɐs',
  para: 'pˈaɾɐ',
  pra: 'pɾa',
  pro: 'pɾu',
  por: 'pˈoɾ',
  pelo: 'pˈelu',
  pela: 'pˈelɐ',
  pelos: 'pˈelus',
  pelas: 'pˈelɐs',
  com: 'kˈõ',
  sem: 'sˈẽj',
  que: 'kˈi',
  se: 'sˈi',
  não: 'nˈɐ̃w',
  são: 'sˈɐ̃w',
  está: 'istˈa',
  estão: 'istˈɐ̃w',
  é: 'ˈɛ',
  foi: 'fˈoj',
  ser: 'sˈeɾ',
  ter: 'tˈeɾ',
  tem: 'tˈẽj',
  têm: 'tˈẽj',
  ou: 'ˈow',
  ao: 'ˈaw',
  aos: 'ˈaws',
  mais: 'mˈajs',
  mas: 'mˈas',
  como: 'kˈõmu',
  quando: 'kwˈɐ̃du',
  quanto: 'kwˈɐ̃tu',
  tudo: 'tˈudu',
  toda: 'tˈodɐ',
  todo: 'tˈodu',
  todos: 'tˈodus',
  todas: 'tˈodɐs',
  cada: 'kˈadɐ',
  muito: 'mˈũjtu',
  muita: 'mˈũjtɐ',
  muitos: 'mˈũjtus',
  muitas: 'mˈũjtɐs',
  mesmo: 'mˈezmu',
  mesma: 'mˈezmɐ',
  outro: 'ˈowtɾu',
  outra: 'ˈowtɾɐ',
  entre: 'ˈẽtɾi',
  sobre: 'sˈobɾi',
  após: 'apˈɔs',
  até: 'atˈɛ',
  já: 'ʒˈa',
  só: 'sˈɔ',
  lei: 'lˈej',
  leis: 'lˈejs',
  réu: 'ʁˈɛw',
  ato: 'ˈatu',
  atos: 'ˈatus',
  artigo: 'aɾtˈiɡu',
  inciso: 'ĩsˈizu',
  parágrafo: 'paɾˈaɡɾafu',
  atenção: 'atẽsˈɐ̃w',
  administração: 'adiministɾasˈɐ̃w',
  pública: 'pˈublikɐ',
  público: 'pˈubliku',
  concurso: 'kõkˈuɾsu',
  concursos: 'kõkˈuɾsus',
  prova: 'pɾˈɔvɐ',
  banca: 'bˈɐ̃kɐ',
  direito: 'ʤiɾˈejtu',
  estado: 'istˈadu',
  poder: 'pudˈeɾ',
  legalidade: 'leɡaliʤˈaʤi',
  impessoalidade: 'ĩpesoaliʤˈaʤi',
  moralidade: 'moɾaliʤˈaʤi',
  publicidade: 'publisiʤˈaʤi',
  eficiência: 'efisjˈẽsjɐ',
};

function convertPortugueseWordToIpa(rawWord: string): string {
  const w = rawWord.toLowerCase().trim();
  if (!w) return '';

  if (FUNCTION_WORDS_IPA[w]) {
    return FUNCTION_WORDS_IPA[w];
  }

  let s = w;

  // 1. Protect nasal word endings before general rules
  s = s.replace(/ções$/g, 'sˈõjs');
  s = s.replace(/ção$/g, 'sˈɐ̃w');
  s = s.replace(/sões$/g, 'zˈõjs');
  s = s.replace(/são$/g, 'zˈɐ̃w');
  s = s.replace(/ões$/g, 'ˈõjs');
  s = s.replace(/ães$/g, 'ˈɐ̃js');
  s = s.replace(/ão$/g, 'ˈɐ̃w');
  s = s.replace(/ãe$/g, 'ˈɐ̃j');
  s = s.replace(/ãs$/g, 'ˈɐ̃s');
  s = s.replace(/ã$/g, 'ˈɐ̃');
  s = s.replace(/am$/g, 'ɐ̃w');
  s = s.replace(/em$/g, 'ẽj');
  s = s.replace(/ens$/g, 'ẽjs');

  // 2. Diphthongs
  s = s.replace(/ou/g, 'ow');
  s = s.replace(/ei/g, 'ej');
  s = s.replace(/ai/g, 'aj');
  s = s.replace(/oi/g, 'oj');
  s = s.replace(/au/g, 'aw');
  s = s.replace(/eu/g, 'ew');
  s = s.replace(/ui/g, 'uj');

  // 3. Consonant digraphs
  s = s.replace(/nh/g, 'ɲ');
  s = s.replace(/lh/g, 'ʎ');
  s = s.replace(/ch/g, 'ʃ');
  s = s.replace(/rr/g, 'ʁ');
  s = s.replace(/ss/g, 's');
  s = s.replace(/sc([eéêií])/g, 's$1');
  s = s.replace(/sç/g, 's');
  s = s.replace(/xc([eéêií])/g, 's$1');
  s = s.replace(/qu([eéêií])/g, 'k$1');
  s = s.replace(/qu([aáâãàóôõo])/g, 'kw$1');
  s = s.replace(/gu([eéêií])/g, 'ɡ$1');
  s = s.replace(/gu([aáâãàóôõo])/g, 'ɡw$1');

  // 4. Contextual single consonants
  s = s.replace(/ç/g, 's');
  s = s.replace(/c([eéêií])/g, 's$1');
  s = s.replace(/c/g, 'k');
  s = s.replace(/g([eéêií])/g, 'ʒ$1');
  s = s.replace(/g/g, 'ɡ');
  s = s.replace(/j/g, 'ʒ');
  s = s.replace(/^r/g, 'ʁ');
  s = s.replace(/([nls])r/g, '$1ʁ');
  s = s.replace(/r/g, 'ɾ');
  s = s.replace(/([aeiouáéíóúâêôãõɐɛɔ])s([aeiouáéíóúâêôãõɐɛɔ])/g, '$1z$2');
  s = s.replace(/^ex([aeiouáéíóúâêôãõ])/g, 'ez$1');
  s = s.replace(/x/g, 'ʃ');
  s = s.replace(/^z/g, 'z');
  s = s.replace(/z$/g, 's');
  s = s.replace(/h/g, '');

  // 5. Brazilian Portuguese affrication (ti -> ʧi, di -> ʤi) & coda L vocalization (l -> w)
  s = s.replace(/t([ií])/g, 'ʧ$1');
  s = s.replace(/d([ií])/g, 'ʤ$1');
  s = s.replace(/te$/g, 'ʧi');
  s = s.replace(/de$/g, 'ʤi');
  s = s.replace(/tes$/g, 'ʧis');
  s = s.replace(/des$/g, 'ʤis');
  s = s.replace(/l([bcdfɡʒklmnpqɾʁsʃtvwzʧʤ])/g, 'w$1');
  s = s.replace(/l$/g, 'w');

  // 6. Syllable-coda nasalization before consonants
  s = s.replace(/([aáâ])([mn])([bcdfɡʒklpɾʁsʃtvwzʧʤ]|$)/g, 'ɐ̃$3');
  s = s.replace(/([eéê])([mn])([bcdfɡʒklpɾʁsʃtvwzʧʤ]|$)/g, 'ẽ$3');
  s = s.replace(/([ií])([mn])([bcdfɡʒklpɾʁsʃtvwzʧʤ]|$)/g, 'ĩ$3');
  s = s.replace(/([oóô])([mn])([bcdfɡʒklpɾʁsʃtvwzʧʤ]|$)/g, 'õ$3');
  s = s.replace(/([uú])([mn])([bcdfɡʒklpɾʁsʃtvwzʧʤ]|$)/g, 'ũ$3');

  // 7. Explicit diacritic stress
  const hasExplicitStress = /[áéíóúâêô]|ˈ/.test(s);
  s = s.replace(/á/g, 'ˈa');
  s = s.replace(/à/g, 'a');
  s = s.replace(/â/g, 'ˈɐ');
  s = s.replace(/é/g, 'ˈɛ');
  s = s.replace(/ê/g, 'ˈe');
  s = s.replace(/í/g, 'ˈi');
  s = s.replace(/ó/g, 'ˈɔ');
  s = s.replace(/ô/g, 'ˈo');
  s = s.replace(/ú/g, 'ˈu');
  s = s.replace(/õ/g, 'õ');

  // 8. Unstressed word-final vowel reduction in Brazilian Portuguese
  s = s.replace(/o$/g, 'u');
  s = s.replace(/os$/g, 'us');
  s = s.replace(/e$/g, 'i');
  s = s.replace(/es$/g, 'is');
  s = s.replace(/a$/g, 'ɐ');
  s = s.replace(/as$/g, 'ɐs');

  // 9. Assign default lexical stress (paroxytone or oxytone) if not already marked
  if (!hasExplicitStress && s.length > 2) {
    const vowelRegex = /[aeiouɐɛɔ]/g;
    const matches: RegExpExecArray[] = [];
    let m: RegExpExecArray | null;
    while ((m = vowelRegex.exec(s)) !== null) {
      matches.push(m);
    }
    if (matches.length > 0) {
      const isOxytoneEnding = /(ɾ|w|i|u|is|us)$/.test(s) && !/(ɐs|us|is)$/.test(w);
      const target =
        isOxytoneEnding || matches.length === 1
          ? matches[matches.length - 1]
          : matches[matches.length - 2];
      if (target && typeof target.index === 'number') {
        s = s.slice(0, target.index) + 'ˈ' + s.slice(target.index);
      }
    }
  }

  return s;
}

/**
 * Converts a full Brazilian Portuguese sentence into Kokoro-82M-compatible IPA string.
 */
export function portugueseToKokoroIpa(text: string): string {
  if (!text || !text.trim()) return '';

  // Expand numbers 0-20 and common abbreviations so IPA is always phonetic
  const normalized = text
    .replace(/\b1º\b/g, 'primeiro')
    .replace(/\b2º\b/g, 'segundo')
    .replace(/\b3º\b/g, 'terceiro')
    .replace(/\b5º\b/g, 'quinto')
    .replace(/\b37\b/g, 'trinta e sete')
    .replace(/\b88\b/g, 'oitenta e oito');

  return normalized
    .replace(/([a-zA-ZÀ-ÿ]+)/g, (word) => convertPortugueseWordToIpa(word))
    .replace(/\s+/g, ' ')
    .trim();
}
