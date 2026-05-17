export type Director = {
  id: string;
  initials: string;
  fullName: string;
  titlePrefix?: string;
  role: { cs: string; en: string };
  bio: { cs: string; en: string };
  since: string;
  yearOfBirth: number;
};

export const directors: Director[] = [
  {
    id: "benacek",
    initials: "OB",
    fullName: "Ondřej Benáček",
    titlePrefix: "Mgr.",
    role: {
      cs: "Jednatel",
      en: "Managing Director",
    },
    bio: {
      cs: "Vede strategickou stránku provozu. Most mezi značkou a každodenní prací prodejen.",
      en: "Owns the strategic side of operations. The bridge between brand and the daily work of stores.",
    },
    since: "2026-04-16",
    yearOfBirth: 1980,
  },
  {
    id: "slavkovsky",
    initials: "JS",
    fullName: "Jiří Slavkovský",
    titlePrefix: "Ing.",
    role: {
      cs: "Jednatel",
      en: "Managing Director",
    },
    bio: {
      cs: "Drží finance, reporty a předvídatelnost čísel. Spočítá to dřív, než to ucítíte.",
      en: "Holds finance, reporting and the predictability of numbers. Counts it before you feel it.",
    },
    since: "2026-04-16",
    yearOfBirth: 1978,
  },
  {
    id: "pesek",
    initials: "JP",
    fullName: "Jakub Pešek",
    titlePrefix: "Mgr.",
    role: {
      cs: "Jednatel",
      en: "Managing Director",
    },
    bio: {
      cs: "Lidé, směny, kultura. Tým, který zůstává - a prodejna, do které se chce vracet.",
      en: "People, shifts, culture. A team that stays - and a store worth coming back to.",
    },
    since: "2026-04-16",
    yearOfBirth: 1994,
  },
];
