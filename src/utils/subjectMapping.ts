import type { SubjectCode, Cycle } from '@/types'

// Subject name patterns → canonical code
const SUBJECT_PATTERNS: Array<{ pattern: RegExp; code: SubjectCode }> = [
  { pattern: /^الأحياء/, code: 'biology' },
  { pattern: /^الفيزياء/, code: 'physics' },
  { pattern: /^الكيمياء/, code: 'chemistry' },
  { pattern: /^العلوم$/, code: 'science' },
  { pattern: /^العلوم\s*$/, code: 'science' },
  { pattern: /^التربية الإسلامية/, code: 'islamic' },
  { pattern: /^الدراسات الاجتماعية/, code: 'social' },
  { pattern: /^الرياضيات/, code: 'math' },
  { pattern: /^اللغة الإنجليزية/, code: 'english' },
  { pattern: /^اللغة العربية/, code: 'arabic' },
]

// Subjects to completely ignore
const IGNORED_SUBJECTS = new Set([
  'العلوم الصحية',
  'التربية البدنية والصحية',
  'الحوسبة والتصميم الإبداعي والابتكار',
  'السلوك',
  'الفنون',
  'الفنون البصرية',
  'الفنون الموسيقية',
  'اللغة الصينية',
  'اللغة الفرنسية',
  'المسرح',
  'إدارة الأعمال',
  'الذكاء الاصطناعي والتكنولوجيا',
  'الإجمالي',
  'المعدل',
  'الحالة',
])

export function mapSubjectName(name: string): SubjectCode | null {
  if (!name) return null
  const trimmed = name.trim()

  // Check ignore list (prefix match)
  for (const ignored of IGNORED_SUBJECTS) {
    if (trimmed.startsWith(ignored) || ignored.startsWith(trimmed)) return null
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

// Returns true if a subject is relevant for a given grade
export function isSubjectRelevantForGrade(subject: SubjectCode, grade: number): boolean {
  if (subject === 'science') return grade <= 10   // grades 5-8, 9-10 general
  if (subject === 'biology' || subject === 'chemistry' || subject === 'physics') return grade >= 9
  return true
}

export function getPassMark(cycle: Cycle): number {
  return cycle === 2 ? 50 : 60
}

export function getCycle(grade: number): Cycle {
  return grade <= 8 ? 2 : 3
}
