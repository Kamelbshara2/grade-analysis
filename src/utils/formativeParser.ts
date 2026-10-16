import * as XLSX from 'xlsx'
import type { FormativeScore, ExamScore, SubjectCode } from '@/types'
import { SUBJECT_LABELS } from './subjectMapping'

// Map Arabic subject names to SubjectCode
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
  // Direct match
  if (trimmed in SUBJECT_NAME_MAP) return SUBJECT_NAME_MAP[trimmed]
  // Try to match by checking if the name starts with a known subject
  for (const [k, v] of Object.entries(SUBJECT_NAME_MAP)) {
    if (trimmed.includes(k) || k.includes(trimmed)) return v
  }
  // Try English labels
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

interface ParsedSubjectCol {
  subjectCode: SubjectCode
  sem: 1 | 3
  colIdx: number
}

/**
 * Parse the formative/exam template.
 * Expected format (rows 0-3 are headers, row 4+ is data):
 *   Row 0: title (skip)
 *   Row 1: subject names (merging pattern: subj, null, subj, null, ...)
 *   Row 2: sem labels (ف1 - تكويني / ف3 - تكويني or ف1 - اختبار / ف3 - اختبار)
 *   Row 3: column headers (رقم الطالب, الصف, الفصل, ...)
 *   Row 4+: data
 *
 * Also handles simplified 2-row header (row 0 = headers, row 1+ = data).
 */
function parseSheet(rows: unknown[][]): { studentId: string; grade: number; section: string; cols: ParsedSubjectCol[]; row: unknown[] }[] | null {
  if (rows.length < 2) return null

  // Detect header row: find the row containing "رقم الطالب"
  let headerRowIdx = -1
  for (let i = 0; i < Math.min(5, rows.length); i++) {
    const r = rows[i]
    if (r.some(c => String(c ?? '').includes('رقم الطالب'))) {
      headerRowIdx = i
      break
    }
  }
  if (headerRowIdx === -1) return null

  // Build subject column map from rows above header
  const subjectCols: ParsedSubjectCol[] = []
  const headerRow = rows[headerRowIdx] as unknown[]

  // Find studentId col, grade col, section col
  let studentIdCol = -1, gradeCol = -1, sectionCol = -1
  for (let c = 0; c < headerRow.length; c++) {
    const cell = String(headerRow[c] ?? '').trim()
    if (cell.includes('رقم الطالب') || cell === 'student_id') studentIdCol = c
    else if (cell === 'الصف' || cell === 'grade') gradeCol = c
    else if (cell.includes('الفصل') || cell.includes('القسم') || cell === 'section') sectionCol = c
  }
  if (studentIdCol === -1) return null

  // Parse subject columns from header rows (look for subject + semester info)
  // Try multi-row header (row 1 = subjects, row 2 = sems)
  const subjectRow = headerRowIdx >= 2 ? rows[headerRowIdx - 2] : null
  const semRow = headerRowIdx >= 1 ? rows[headerRowIdx - 1] : null

  for (let c = 0; c < headerRow.length; c++) {
    if (c === studentIdCol || c === gradeCol || c === sectionCol) continue

    // Try to find subject from subjectRow (non-null entries are subject names)
    let subjectCode: SubjectCode | null = null
    let sem: 1 | 3 | null = null

    // Check subject row for subject name
    if (subjectRow) {
      for (let sc = c; sc >= 0; sc--) {
        const sname = String(subjectRow[sc] ?? '').trim()
        if (sname) {
          subjectCode = normalizeSubjectName(sname)
          break
        }
      }
    }

    // Check sem row
    if (semRow) {
      const semLabel = String(semRow[c] ?? '').trim()
      if (semLabel.includes('ف1') || semLabel.includes('1')) sem = 1
      else if (semLabel.includes('ف3') || semLabel.includes('3')) sem = 3
    }

    // Fallback: parse from header row cell itself (e.g. "اللغة العربية ف1")
    if (!subjectCode || !sem) {
      const cell = String(headerRow[c] ?? '').trim()
      if (cell.includes('ف1')) sem = sem ?? 1
      else if (cell.includes('ف3')) sem = sem ?? 3

      if (!subjectCode) {
        // Strip semester suffix and try to match
        const withoutSem = cell.replace(/ف[123]/g, '').replace(/\s+/g, ' ').trim()
        subjectCode = normalizeSubjectName(withoutSem)
      }
    }

    if (subjectCode && sem) {
      subjectCols.push({ subjectCode, sem, colIdx: c })
    }
  }

  if (subjectCols.length === 0) return null

  // Parse data rows
  const result: { studentId: string; grade: number; section: string; cols: ParsedSubjectCol[]; row: unknown[] }[] = []
  for (let r = headerRowIdx + 1; r < rows.length; r++) {
    const row = rows[r]
    const studentId = String(row[studentIdCol] ?? '').trim()
    if (!studentId || studentId.startsWith('*')) continue
    const grade = gradeCol >= 0 ? (Number(row[gradeCol]) || 0) : 0
    const section = sectionCol >= 0 ? String(row[sectionCol] ?? '1').trim() : '1'
    result.push({ studentId, grade, section, cols: subjectCols, row })
  }
  return result
}

export function parseFormativeFile(buffer: ArrayBuffer, yearId: string): FormativeScore[] {
  const wb = XLSX.read(buffer, { type: 'array' })
  const scores: FormativeScore[] = []

  for (const sheetName of wb.SheetNames) {
    if (sheetName === 'تعليمات' || sheetName === 'Instructions') continue
    const ws = wb.Sheets[sheetName]
    const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null })
    const parsed = parseSheet(rows as unknown[][])
    if (!parsed) continue

    for (const { studentId, grade, section, cols, row } of parsed) {
      // Group by student
      const s1Map: Partial<Record<SubjectCode, number | null>> = {}
      const s3Map: Partial<Record<SubjectCode, number | null>> = {}
      for (const col of cols) {
        const val = toNum(row[col.colIdx])
        if (col.sem === 1) s1Map[col.subjectCode] = val
        else s3Map[col.subjectCode] = val
      }
      const allSubjects = new Set([...Object.keys(s1Map), ...Object.keys(s3Map)]) as Set<SubjectCode>
      for (const subjectCode of allSubjects) {
        const s1 = s1Map[subjectCode] ?? null
        const s3 = s3Map[subjectCode] ?? null
        if (s1 === null && s3 === null) continue
        scores.push({ studentId, yearId, subjectCode, grade, section, s1, s2: null, s3 })
      }
    }
  }
  return scores
}

export function parseExamFile(buffer: ArrayBuffer, yearId: string): ExamScore[] {
  const wb = XLSX.read(buffer, { type: 'array' })
  const scores: ExamScore[] = []

  for (const sheetName of wb.SheetNames) {
    if (sheetName === 'تعليمات' || sheetName === 'Instructions') continue
    const ws = wb.Sheets[sheetName]
    const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null })
    const parsed = parseSheet(rows as unknown[][])
    if (!parsed) continue

    for (const { studentId, grade, section, cols, row } of parsed) {
      const s1Map: Partial<Record<SubjectCode, number | null>> = {}
      const s3Map: Partial<Record<SubjectCode, number | null>> = {}
      for (const col of cols) {
        const val = toNum(row[col.colIdx])
        if (col.sem === 1) s1Map[col.subjectCode] = val
        else s3Map[col.subjectCode] = val
      }
      const allSubjects = new Set([...Object.keys(s1Map), ...Object.keys(s3Map)]) as Set<SubjectCode>
      for (const subjectCode of allSubjects) {
        const s1 = s1Map[subjectCode] ?? null
        const s3 = s3Map[subjectCode] ?? null
        if (s1 === null && s3 === null) continue
        scores.push({ studentId, yearId, subjectCode, grade, section, s1, s2: null, s3 })
      }
    }
  }
  return scores
}
