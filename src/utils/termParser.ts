import * as XLSX from 'xlsx'
import type { TermScore, SubjectCode } from '@/types'
import { SUBJECT_LABELS } from './subjectMapping'

const SUBJECT_NAME_MAP: Record<string, SubjectCode> = {
  'اللغة العربية': 'arabic',
  'اللغة الانجليزية': 'english',
  'اللغة الإنجليزية': 'english',
  'الرياضيات': 'math',
  'التربية الإسلامية': 'islamic',
  'الدراسات الاجتماعية': 'social',
  'العلوم': 'science',
  'الفيزياء': 'physics',
  'الكيمياء': 'chemistry',
  'الأحياء': 'biology',
  'علوم الصحة': 'health_science',
}

function normalizeSubjectName(name: string): SubjectCode | null {
  const trimmed = name.trim()
  if (trimmed in SUBJECT_NAME_MAP) return SUBJECT_NAME_MAP[trimmed]
  for (const [k, v] of Object.entries(SUBJECT_NAME_MAP)) {
    if (trimmed.includes(k) || k.includes(trimmed)) return v
  }
  for (const [code, labels] of Object.entries(SUBJECT_LABELS)) {
    if (labels.ar === trimmed || labels.en.toLowerCase() === trimmed.toLowerCase()) {
      return code as SubjectCode
    }
  }
  return null
}

function toNum(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return isNaN(n) ? null : Math.min(100, Math.max(0, n))
}

/**
 * Parse a simple term score file.
 * Format: header row with رقم الطالب | الصف | الفصل | subject1 | subject2 | ...
 * One row per student.
 */
export function parseTermFile(buffer: ArrayBuffer, yearId: string, semester: 1 | 2 | 3): TermScore[] {
  const wb = XLSX.read(buffer, { type: 'array' })
  const scores: TermScore[] = []

  for (const sheetName of wb.SheetNames) {
    if (sheetName === 'تعليمات' || sheetName === 'Instructions') continue
    const ws = wb.Sheets[sheetName]
    const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null }) as unknown[][]

    // Find header row (contains رقم الطالب)
    let headerRowIdx = -1
    for (let i = 0; i < Math.min(4, rows.length); i++) {
      if ((rows[i] as unknown[]).some(c => String(c ?? '').includes('رقم الطالب'))) {
        headerRowIdx = i
        break
      }
    }
    if (headerRowIdx === -1) continue

    const headerRow = rows[headerRowIdx] as unknown[]
    let studentIdCol = -1, gradeCol = -1, sectionCol = -1
    const subjectCols: { subjectCode: SubjectCode; colIdx: number }[] = []

    for (let c = 0; c < headerRow.length; c++) {
      const cell = String(headerRow[c] ?? '').trim()
      if (cell.includes('رقم الطالب') || cell === 'student_id') { studentIdCol = c; continue }
      if (cell === 'الصف' || cell === 'grade') { gradeCol = c; continue }
      if (cell.includes('الفصل') || cell.includes('القسم') || cell === 'section') { sectionCol = c; continue }
      const code = normalizeSubjectName(cell)
      if (code) subjectCols.push({ subjectCode: code, colIdx: c })
    }

    if (studentIdCol === -1 || subjectCols.length === 0) continue

    for (let r = headerRowIdx + 1; r < rows.length; r++) {
      const row = rows[r] as unknown[]
      const studentId = String(row[studentIdCol] ?? '').trim()
      if (!studentId || studentId.startsWith('*')) continue
      const grade = gradeCol >= 0 ? (Number(row[gradeCol]) || 0) : 0
      const section = sectionCol >= 0 ? String(row[sectionCol] ?? '1').trim() : '1'

      for (const { subjectCode, colIdx } of subjectCols) {
        const score = toNum(row[colIdx])
        if (score === null) continue
        scores.push({ studentId, yearId, semester, subjectCode, grade, section, score })
      }
    }
  }

  return scores
}
