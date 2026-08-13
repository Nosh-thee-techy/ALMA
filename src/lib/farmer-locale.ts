export const FARMER_LANGS = [
  { id: "en", short: "EN", name: "English" },
  { id: "sw", short: "SW", name: "Kiswahili" },
  { id: "trk", short: "TRK", name: "Ng'aturkana" },
  { id: "orm", short: "ORM", name: "Afaan Oromo" },
  { id: "am", short: "AM", name: "አማርኛ" },
] as const;

export type FarmerLang = (typeof FARMER_LANGS)[number]["id"];

export const LANG_STORAGE_KEY = "alma_farmer_lang";

const COPY: Record<
  FarmerLang,
  {
    after: string;
    todo: string;
    alma: string;
    dial: string;
    youAre: string;
    youShould: string;
    myCrops: string;
    climateHere: string;
    getBetter: string;
    talkAlma: string;
    almaListening: string;
    how: string;
    afterThis: string;
    markDone: string;
    alreadyDone: string;
    doneOf: (d: number, t: number) => string;
    stillTodo: string;
    allDone: string;
    typeInstead: string;
    speakHint: string;
    playVoice: string;
  }
> = {
  en: {
    after: "After",
    todo: "To do",
    alma: "Alma",
    dial: "Dial",
    youAre: "You are here",
    youShould: "You should be",
    myCrops: "Your crops, animals, gear",
    climateHere: "Climate here",
    getBetter: "How to get closer to READY",
    talkAlma: "Talk to Alma",
    almaListening: "Alma is speaking…",
    how: "How to do it",
    afterThis: "When it is done",
    markDone: "I did this",
    alreadyDone: "What you have done",
    doneOf: (d, t) => `${d} done · ${t - d} still to do`,
    stillTodo: "Still to do",
    allDone: "All current actions are done.",
    typeInstead: "Type instead",
    speakHint: "Hold the mic — Alma talks so you don’t have to type.",
    playVoice: "Play Alma",
  },
  sw: {
    after: "Baada",
    todo: "Kazi",
    alma: "Alma",
    dial: "Piga",
    youAre: "Uko hapa",
    youShould: "Unapaswa kuwa",
    myCrops: "Mazao, wanyama, vifaa vyako",
    climateHere: "Hali ya hewa hapa",
    getBetter: "Jinsi ya kufika READY",
    talkAlma: "Ongea na Alma",
    almaListening: "Alma anazungumza…",
    how: "Jinsi ya kufanya",
    afterThis: "Ikimalizika",
    markDone: "Nimefanya",
    alreadyDone: "Uliyofanya",
    doneOf: (d, t) => `${d} zimelika · ${t - d} bado`,
    stillTodo: "Bado",
    allDone: "Kazi zote za sasa zimelika.",
    typeInstead: "Andika",
    speakHint: "Bonyeza maikrofoni — Alma anazungumza, huna haja ya kuandika.",
    playVoice: "Sikiliza Alma",
  },
  trk: {
    after: "After",
    todo: "To do",
    alma: "Alma",
    dial: "Dial",
    youAre: "You are here",
    youShould: "You should be",
    myCrops: "Crops, animals, gear",
    climateHere: "Climate here",
    getBetter: "Toward READY",
    talkAlma: "Talk to Alma",
    almaListening: "Alma is speaking…",
    how: "How",
    afterThis: "When done",
    markDone: "I did this",
    alreadyDone: "Done",
    doneOf: (d, t) => `${d} / ${t}`,
    stillTodo: "Still to do",
    allDone: "All current actions are done.",
    typeInstead: "Type",
    speakHint: "Alma will speak in Ng'aturkana — tap the mic.",
    playVoice: "Play Alma",
  },
  orm: {
    after: "Booda",
    todo: "Hojii",
    alma: "Alma",
    dial: "Bilbila",
    youAre: "As jirta",
    youShould: "Tahuun qabda",
    myCrops: "Midhaan, horii, meeshaa",
    climateHere: "Haala qilleensaa",
    getBetter: "Gara READY",
    talkAlma: "Alma waliin dubbadhu",
    almaListening: "Alma dubbachaa jirti…",
    how: "Akkamitti",
    afterThis: "Erga xumuramee",
    markDone: "Nan hojjedhe",
    alreadyDone: "Kan hojjetame",
    doneOf: (d, t) => `${d} / ${t}`,
    stillTodo: "Hafan",
    allDone: "Hojiiwwan ammaa xumuramanii jiru.",
    typeInstead: "Barreessi",
    speakHint: "Alma Afaan Oromootiin dubbatti — maayikiroofoonii tuqi.",
    playVoice: "Alma dhaggeeffadhu",
  },
  am: {
    after: "ከዚህ በኋላ",
    todo: "ሥራ",
    alma: "አልማ",
    dial: "ደውል",
    youAre: "እዚህ ነህ",
    youShould: "መሆን ያለብህ",
    myCrops: "ሰብል፣ እንስሳ፣ መሣሪያ",
    climateHere: "የአየር ሁኔታ",
    getBetter: "ወደ READY",
    talkAlma: "ከአልማ ተነጋገር",
    almaListening: "አልማ ትናገራለች…",
    how: "እንዴት",
    afterThis: "ሲጠናቀቅ",
    markDone: "አደረግሁት",
    alreadyDone: "የተጠናቀቀ",
    doneOf: (d, t) => `${d} / ${t}`,
    stillTodo: "ቀሪ",
    allDone: "ያሁኑ ሥራዎች ተጠናቀዋል።",
    typeInstead: "ጻፍ",
    speakHint: "አልማ በአማርኛ ትናገራለች — ማይክሮፎኑን ነካ።",
    playVoice: "አልማን አጫውት",
  },
};

export function farmerCopy(lang: FarmerLang) {
  return COPY[lang] || COPY.en;
}
