/** Prio Matematik 8 (Sanoma, 2:a upplagan) — bokstruktur och exempeldata. */

export interface Subchapter { id: string; titel: string; }
export interface Chapter { id: string; titel: string; subchapters: Subchapter[]; }
export interface Book { id: string; titel: string; förlag: string; årskurs: number; chapters: Chapter[]; }

const sub = (kap: number, ns: string[]): Subchapter[] =>
  ns.map((titel, i) => ({ id: `${kap}.${i + 1}`, titel }));

export const PRIO_MAT_8: Book = {
  id: 'prio-mat-8-2ed',
  titel: 'Prio Matematik 8',
  förlag: 'Sanoma',
  årskurs: 8,
  chapters: [
    { id: '1', titel: 'Tal', subchapters: sub(1, [
      'Negativa tal', 'Räkna med negativa tal', 'Potenser', 'Kvadratrötter', 'Talsystem']) },
    { id: '2', titel: 'Algebra', subchapters: sub(2, [
      'Uttryck', 'Förenkla uttryck', 'Ekvationer', 'Ekvationslösning', 'Problemlösning med ekvationer',
      'Mönster', 'Formler', 'Olikheter']) },
    { id: '3', titel: 'Geometri', subchapters: sub(3, [
      'Vinklar', 'Trianglar', 'Fyrhörningar', 'Cirkeln', 'Skala']) },
    { id: '4', titel: 'Sannolikhet och statistik', subchapters: sub(4, [
      'Sannolikhet', 'Träddiagram', 'Lägesmått', 'Diagram']) },
  ],
};

export interface Concept { id: string; term: string; definition: string; subchapterId: string; }
export const CONCEPTS_1_1: Concept[] = [
  { id: 'c-1-1-negativatal', term: 'negativt tal', definition: 'Tal mindre än noll, till vänster om 0 på tallinjen', subchapterId: '1.1' },
  { id: 'c-1-1-tallinjen', term: 'tallinjen', definition: 'En linje där varje punkt motsvarar ett tal, ordnat från minst till störst', subchapterId: '1.1' },
];

export interface ExerciseRange { label: { known: 'grön' | 'blå' | 'röd' }; from: number; to: number; }
export interface SourceMap {
  lessonNo: number;
  subchapterId: string;
  del: number;
  exerciseRanges: ExerciseRange[];
  teoriSidor: string;
  quizStart?: string;
  exit?: string;
}

export const SOURCE_MAP_1_1_DEL1: SourceMap = {
  lessonNo: 1, subchapterId: '1.1', del: 1,
  exerciseRanges: [
    { label: { known: 'grön' }, from: 101, to: 110 },
    { label: { known: 'blå' }, from: 111, to: 120 },
  ],
  teoriSidor: 'sid 8–12',
  quizStart: 'Matte8B',
  exit: 'Quiz 1.1a',
};

export const SOURCE_MAP_1_1_DEL2: SourceMap = {
  lessonNo: 2, subchapterId: '1.1', del: 2,
  exerciseRanges: [
    { label: { known: 'blå' }, from: 121, to: 130 },
    { label: { known: 'röd' }, from: 131, to: 138 },
  ],
  teoriSidor: 'sid 12–15',
  exit: 'Quiz 1.1b',
};
