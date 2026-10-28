import type { SubjectCode, Cycle } from '@/types'

// Subject name patterns → canonical code
// Patterns are flexible to handle common spelling/encoding variations in Excel exports.
const SUBJECT_PATTERNS: Array<{ pattern: RegExp; code: SubjectCode }> = [
  // Specialized sciences — match with or without ال, handle hamza variants (أ/ا)
  { pattern: /[اأإ]حياء/, code: 'biology' },
  { pattern: /فيزياء/, code: 'physics' },
  { pattern: /كيمياء/, code: 'chemistry' },
  // General science — exact word only (must not bleed into العلوم الصحية, handled below)
  { pattern: /^ال?علوم\s*$/, code: 'science' },
  { pattern: /^التربية الإسلامية/, code: 'islamic' },
  { pattern: /^الدراسات الاجتماعية/, code: 'social' },
  { pattern: /^الرياضيات/, code: 'math' },
  { pattern: /^اللغة الإنجليزية/, code: 'english' },
  { pattern: /^اللغة العربية/, code: 'arabic' },
]

// Prefixes that mark a subject to ignore entirely.
// Using startsWith(prefix) only — never the reverse — to avoid falsely ignoring
// "العلوم" because "العلوم الصحية".startsWith("العلوم").
const IGNORED_PREFIXES = [
  'العلوم الصحية',
  'التربية البدنية',
  'الحوسبة',
  'الذكاء الاصطناعي',
  'السلوك',
  'الفنون',
  'اللغة الصينية',
  'اللغة الفرنسية',
  'المسرح',
  'إدارة الأعمال',
  'الإجمالي',
  'المعدل',
  'الحالة',
]

export function mapSubjectName(name: string): SubjectCode | null {
  if (!name) return null
  const trimmed = name.trim()
  if (!trimmed) return null

  for (const prefix of IGNORED_PREFIXES) {
    if (trimmed.startsWith(prefix)) return null
  }

  for (const { pattern, code } of SUBJECT_PATTERNS) {
    if (pattern.test(trimmed)) return code
  }
  return null
}

export const SUBJECT_LABELS: Record<SubjectCode, { ar: string; en: string }> = {
  arabic: { ar: 'اللغة العربية', en: 'Arabic' },
  english: { ar: 'اللغة الإنجليزية', en: 'English' },
  math: { ar: 'الرياضيات', en: 'Mathematics' },
  islamic: { ar: 'التربية الإسلامية', en: 'Islamic Studies' },
  social: { ar: 'الدراسات الاجتماعية', en: 'Social Studies' },
  science: { ar: 'العلوم', en: 'Science' },
  physics: { ar: 'الفيزياء', en: 'Physics' },
  chemistry: { ar: 'الكيمياء', en: 'Chemistry' },
  biology: { ar: 'الأحياء', en: 'Biology' },
}

// Which subjects are relevant per cycle
export const CYCLE2_SUBJECTS: SubjectCode[] = [
  'arabic', 'english', 'math', 'islamic', 'social', 'science',
]

export const CYCLE3_SUBJECTS: SubjectCode[] = [
  'arabic', 'english', 'math', 'islamic', 'social',
  'physics', 'chemistry', 'biology',
]

// All subjects used in analysis (no health_science)
export const ANALYSIS_SUBJECTS: SubjectCode[] = [
  'arabic', 'islamic', 'social', 'math', 'english',
  'science', 'biology', 'chemistry', 'physics',
]

// Core subjects mandatory across all grades and tracks
export const CORE_SUBJECTS: SubjectCode[] = [
  'arabic', 'english', 'math', 'islamic',
]

export function getCycleSubjects(cycle: Cycle): SubjectCode[] {
  return cycle === 2 ? CYCLE2_SUBJECTS : CYCLE3_SUBJECTS
}

// Returns true if a subject is relevant for a given grade.
// Science (علوم): grades 5-10 (عام track). Grade 9 عام and grade 10 عام also study science.
// Specialized sciences (bio/chem/physics): grade 9 متقدم (physics+biology) and above.
// Grades 9-10 intentionally allow both — the actual data determines which track applies.
export function isSubjectRelevantForGrade(subject: SubjectCode, grade: number): boolean {
  if (subject === 'science') return grade <= 10
  if (subject === 'biology' || subject === 'chemistry' || subject === 'physics') return grade >= 9
  return true
}

export function getPassMark(cycle: Cycle): number {
  return cycle === 2 ? 50 : 60
}

export function getCycle(grade: number): Cycle {
  return grade <= 8 ? 2 : 3
}
