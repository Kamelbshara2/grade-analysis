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

// Core subject keywords for Ministry NOOR format
const NOOR_CORE_KEYWORDS: [string[], SubjectCode][] = [
  [['الرياضيات'], 'math'],
  [['العلوم'], 'science'],
  [['اللغة الإنجليزية', 'اللغة الانجليزية'], 'english'],
  [['التربية الإسلامية'], 'islamic'],
  [['الدراسات الاجتماعية'], 'social'],
  [['اللغة العربية'], 'arabic'],
  [['الفيزياء'], 'physics'],
  [['الكيمياء'], 'chemistry'],
  [['الأحياء'], 'biology'],
]

/**
 * Parse Ministry NOOR term results file.
 * Sheet "تحليل النتائج": row1=subject names (merged), row2=sub-column labels, rows3+=data.
 * Auto-detects semester from row2 term label (الفصل الاول/الثاني/الثالث).
 * Merges Physics/Chemistry/Biology variant columns (takes best non-null score).
 */
export function parseNoorTermFile(buffer: ArrayBuffer, yearId: string): TermScore[] {
  const wb = XLSX.read(buffer, { type: 'array' })
  const ws = wb.Sheets['تحليل النتائج']
  if (!ws) return []

  const rows = XLSX.utils.sheet_to_json<(string | number | null)[]>(ws, {
    header: 1, defval: null,
  }) as (string | number | null)[][]

  if (rows.length < 3) return []

  const row1 = rows[0]
  const row2 = rows[1]

  // Detect semester from row2 labels
  let semester: 1 | 2 | 3 = 1
  const termLabelMap: Record<string, 1 | 2 | 3> = {
    'الفصل الاول': 1, 'الفصل الثاني': 2, 'الفصل الثالث': 3,
  }
  for (const v of row2) {
    const s = String(v || '')
    if (s in termLabelMap) { semester = termLabelMap[s]; break }
  }
  const termLabel = Object.keys(termLabelMap).find(k => termLabelMap[k] === semester)!

  // Find subject start columns (0-indexed, skip first 16 fixed cols)
  const subjectStarts: { col: number; name: string }[] = []
  for (let i = 16; i < row1.length; i++) {
    if (row1[i]) subjectStarts.push({ col: i, name: String(row1[i]) })
  }

  // Map subjectCode → [termScoreColIndex]
  const codeTermCols = new Map<SubjectCode, number[]>()
  for (let i = 0; i < subjectStarts.length; i++) {
    const { col: start, name } = subjectStarts[i]
    const end = i + 1 < subjectStarts.length ? subjectStarts[i + 1].col - 1 : row1.length - 1

    const match = NOOR_CORE_KEYWORDS.find(([kws]) => kws.some(k => name.includes(k)))
    if (!match) continue
    const code = match[1]

    for (let c = start; c <= end; c++) {
      if (String(row2[c] || '') === termLabel) {
        if (!codeTermCols.has(code)) codeTermCols.set(code, [])
        codeTermCols.get(code)!.push(c)
        break
      }
    }
  }

  if (codeTermCols.size === 0) return []

  const scores: TermScore[] = []

  for (let r = 2; r < rows.length; r++) {
    const row = rows[r]
    if (!row) continue

    const studentId = String(row[1] ?? '').trim()
    if (!studentId || studentId === 'رقم الطالب') continue

    const gradeStr = String(row[2] ?? '')
    const gradeMatch = gradeStr.match(/\d+/)
    const grade = gradeMatch ? parseInt(gradeMatch[0]) : 0
    if (grade < 1 || grade > 12) continue

    const sectionStr = String(row[4] ?? '')
    const secMatch = sectionStr.match(/\/(\d+)$/)
    const section = secMatch ? secMatch[1] : '1'

    for (const [code, cols] of codeTermCols) {
      let best: number | null = null
      for (const c of cols) {
        const v = row[c]
        if (v !== null && v !== undefined && v !== '') {
          const n = typeof v === 'number' ? v : parseFloat(String(v))
          if (!isNaN(n) && n > 0) best = best === null ? n : Math.max(best, n)
        }
      }
      if (best !== null) {
        scores.push({ studentId, yearId, semester, subjectCode: code, grade, section, score: best })
      }
    }
  }

  return scores
}

/** Returns true if the buffer looks like a Ministry NOOR term report */
export function isNoorTermFile(buffer: ArrayBuffer): boolean {
  const wb = XLSX.read(buffer, { type: 'array' })
  return wb.SheetNames.includes('تحليل النتائج')
}

/**
 * Extract formative (school assessment) and exam scores from a NOOR term file.
 * Returns per-student scores for the detected semester.
 */
export function parseNoorFormativeExam(buffer: ArrayBuffer, yearId: string): {
  semester: 1 | 2 | 3;
  formative: Array<{ studentId: string; subjectCode: SubjectCode; grade: number; section: string; score: number | null }>;
  exam: Array<{ studentId: string; subjectCode: SubjectCode; grade: number; section: string; score: number | null }>;
} {
  const wb = XLSX.read(buffer, { type: 'array' })
  const ws = wb.Sheets['تحليل النتائج']
  if (!ws) return { semester: 1, formative: [], exam: [] }

  const rows = XLSX.utils.sheet_to_json<(string | number | null)[]>(ws, {
    header: 1, defval: null,
  }) as (string | number | null)[][]

  if (rows.length < 3) return { semester: 1, formative: [], exam: [] }

  const row1 = rows[0]
  const row2 = rows[1]

  // Detect semester
  const termLabelMap: Record<string, 1 | 2 | 3> = {
    'الفصل الاول': 1, 'الفصل الثاني': 2, 'الفصل الثالث': 3,
  }
  let semester: 1 | 2 | 3 = 1
  for (const v of row2) {
    const s = String(v || '')
    if (s in termLabelMap) { semester = termLabelMap[s]; break }
  }

  // Find subject spans (col index where row1 is non-empty, starting after col 16)
  const subjectStarts: { col: number; name: string }[] = []
  for (let i = 16; i < row1.length; i++) {
    if (row1[i]) subjectStarts.push({ col: i, name: String(row1[i]) })
  }

  // Map subjectCode → { formativeCol, examCol }
  const codeFormativeCols = new Map<SubjectCode, number>()
  const codeExamCols = new Map<SubjectCode, number>()

  for (let i = 0; i < subjectStarts.length; i++) {
    const { col: start, name } = subjectStarts[i]
    const end = i + 1 < subjectStarts.length ? subjectStarts[i + 1].col - 1 : row1.length - 1

    const match = NOOR_CORE_KEYWORDS.find(([kws]) => kws.some(k => name.includes(k)))
    if (!match) continue
    const code = match[1]

    for (let c = start; c <= end; c++) {
      const label = String(row2[c] || '').trim()
      if (label === 'التقييم على مستوى المدرسة' && !codeFormativeCols.has(code)) {
        codeFormativeCols.set(code, c)
      } else if (label === 'اختبار نهاية الفصل' && !codeExamCols.has(code)) {
        codeExamCols.set(code, c)
      }
    }
  }

  const formative: Array<{ studentId: string; subjectCode: SubjectCode; grade: number; section: string; score: number | null }> = []
  const exam: Array<{ studentId: string; subjectCode: SubjectCode; grade: number; section: string; score: number | null }> = []

  // yearId is used implicitly through the closure in the caller; we accept it to keep the signature consistent
  void yearId

  for (let r = 2; r < rows.length; r++) {
    const row = rows[r]
    if (!row) continue
    const studentId = String(row[1] ?? '').trim()
    if (!studentId || studentId === 'رقم الطالب') continue

    const gradeStr = String(row[2] ?? '')
    const gradeMatch = gradeStr.match(/\d+/)
    const grade = gradeMatch ? parseInt(gradeMatch[0]) : 0
    if (grade < 1 || grade > 12) continue

    const sectionStr = String(row[4] ?? '')
    const secMatch = sectionStr.match(/\/(\d+)$/)
    const section = secMatch ? secMatch[1] : '1'

    for (const [code, col] of codeFormativeCols) {
      const v = row[col]
      const score = (v !== null && v !== undefined && v !== '') ? (typeof v === 'number' ? v : parseFloat(String(v))) : null
      formative.push({ studentId, subjectCode: code, grade, section, score: score !== null && !isNaN(score) ? score : null })
    }
    for (const [code, col] of codeExamCols) {
      const v = row[col]
      const score = (v !== null && v !== undefined && v !== '') ? (typeof v === 'number' ? v : parseFloat(String(v))) : null
      exam.push({ studentId, subjectCode: code, grade, section, score: score !== null && !isNaN(score) ? score : null })
    }
  }

  return { semester, formative, exam }
}
