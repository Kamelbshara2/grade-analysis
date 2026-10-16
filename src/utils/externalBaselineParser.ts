import * as XLSX from 'xlsx'
import type { StudentRecord, SubjectCode, Cycle, TermScore } from '@/types'
import { getCycle } from './subjectMapping'

const SUBJECT_COL_MAP: Record<string, SubjectCode> = {
  'اللغة العربية': 'arabic',
  'اللغة الانجايزية': 'english',
  'اللغة الانجليزية': 'english',
  'اللغة الإنجليزية': 'english',
  'الرياضيات': 'math',
  'العلوم': 'science',
  'التربية الإسلامية': 'islamic',
  'الدراسات الاجتماعية': 'social',
  'الفيزياء': 'physics',
  'الكيمياء': 'chemistry',
  'الأحياء': 'biology',
  'التربية البدنية والصحية': 'health_science',
}

function normalizeSubject(name: string): SubjectCode | null {
  const t = name.trim()
  if (t in SUBJECT_COL_MAP) return SUBJECT_COL_MAP[t]
  for (const [k, v] of Object.entries(SUBJECT_COL_MAP)) {
    if (t.includes(k) || k.includes(t)) return v
  }
  return null
}

function toNum(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return isNaN(n) ? null : Math.min(100, Math.max(0, n))
}

/**
 * Simple flat baseline format:
 *   Row 1 (optional): empty
 *   Row 2: headers — رقم الطالب | الاسم بالعربية | الاسم بالانجليزية | الشعبة | <subject cols> | ناجح/راسب | معدل
 *   Row 3+: student data
 *
 * File name = student's CURRENT grade → stored as (currentGrade - 1) in yearId.
 */
export function parseSimpleBaselineFile(
  buffer: ArrayBuffer,
  currentGrade: number,
  yearId: string,
): StudentRecord[] {
  const wb = XLSX.read(buffer, { type: 'array' })
  const records: StudentRecord[] = []
  const prevGrade = currentGrade - 1
  const cycle: Cycle = getCycle(prevGrade)

  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName]
    const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null }) as unknown[][]
    if (rows.length < 3) continue

    // Find header row that contains 'رقم الطالب'
    let headerRowIdx = -1
    let idColIdx = 0
    for (let i = 0; i < Math.min(4, rows.length); i++) {
      for (let c = 0; c < (rows[i] as unknown[]).length; c++) {
        if (String((rows[i] as unknown[])[c] ?? '').includes('رقم الطالب')) {
          headerRowIdx = i
          idColIdx = c
          break
        }
      }
      if (headerRowIdx >= 0) break
    }
    if (headerRowIdx < 0) continue

    const headerRow = rows[headerRowIdx]
    const subjectCols: { subjectCode: SubjectCode; colIdx: number }[] = []
    let sectionColIdx = idColIdx + 3

    for (let c = idColIdx; c < headerRow.length; c++) {
      const cell = String(headerRow[c] ?? '').trim()
      if (cell === 'الشعبة' || cell === 'القسم') { sectionColIdx = c; continue }
      const code = normalizeSubject(cell)
      if (code) subjectCols.push({ subjectCode: code, colIdx: c })
    }
    if (subjectCols.length === 0) continue

    for (let r = headerRowIdx + 1; r < rows.length; r++) {
      const row = rows[r] as unknown[]
      const studentId = String(row[idColIdx] ?? '').trim()
      if (!studentId || !/^\d+$/.test(studentId)) continue

      const arName = String(row[idColIdx + 1] ?? '').trim()
      const section = String(row[sectionColIdx] ?? '1').trim() || '1'

      // Find pass/fail (text 'ناجح' or 'راسب')
      let status: 'pass' | 'fail' | 'unknown' = 'unknown'
      for (let c = sectionColIdx + 1; c < row.length; c++) {
        const v = String(row[c] ?? '')
        if (v === 'ناجح') { status = 'pass'; break }
        if (v === 'راسب') { status = 'fail'; break }
      }

      const grades: Partial<Record<SubjectCode, { s1: null; s2: null; s3: null; annual: number | null }>> = {}
      const scoreValues: number[] = []
      for (const { subjectCode, colIdx } of subjectCols) {
        const score = toNum(row[colIdx])
        grades[subjectCode] = { s1: null, s2: null, s3: null, annual: score }
        if (score !== null) scoreValues.push(score)
      }

      const annualAvg = scoreValues.length > 0
        ? Math.round((scoreValues.reduce((a, b) => a + b, 0) / scoreValues.length) * 100) / 100
        : null

      records.push({
        student: { id: studentId, name: arName, nationality: 'unknown' },
        yearId,
        grade: prevGrade,
        track: 'general',
        section,
        sectionRaw: section,
        cycle,
        grades: grades as StudentRecord['grades'],
        annualAvg,
        annualTotal: null,
        status,
      })
    }
  }
  return records
}

const SEMESTER_LABELS: Record<string, 1 | 2 | 3> = {
  'الفصل الاول': 1, 'الفصل الثاني': 2, 'الفصل الثالث': 3,
}

/**
 * NOOR multi-term baseline format (from another school's NOOR export):
 *   Row 1: empty
 *   Row 2: merged subject headers starting at col 3
 *   Row 3: semester sub-labels (الفصل الاول / الفصل الثاني / الفصل الثالث / نهاية العام)
 *   Row 4+: data — col0=section, col1=student name, col2=studentId
 *
 * Extracts TermScore for semesters 1, 2, 3.
 */
export function parseNoorMultiTermFile(
  buffer: ArrayBuffer,
  currentGrade: number,
  yearId: string,
): TermScore[] {
  const wb = XLSX.read(buffer, { type: 'array' })
  const scores: TermScore[] = []
  const prevGrade = currentGrade - 1

  for (const sheetName of wb.SheetNames) {
    if (sheetName === 'تعليمات') continue
    const ws = wb.Sheets[sheetName]
    const rows = XLSX.utils.sheet_to_json<(string | number | null)[]>(ws, {
      header: 1, defval: null,
    }) as (string | number | null)[][]
    if (rows.length < 4) continue

    // Locate the subject header row: first row where col3+ has a known subject name
    let subjectRowIdx = -1
    for (let i = 0; i < Math.min(5, rows.length); i++) {
      const row = rows[i]
      if (row.slice(3).some(c => c && normalizeSubject(String(c)))) {
        subjectRowIdx = i
        break
      }
    }
    if (subjectRowIdx < 0) continue

    const semesterRowIdx = subjectRowIdx + 1
    const dataStartIdx = subjectRowIdx + 2

    const subjectHeaderRow = rows[subjectRowIdx]
    const semesterHeaderRow = rows[semesterRowIdx]

    // Forward-fill merged subject names
    const filledSubjects: (SubjectCode | null)[] = []
    let lastCode: SubjectCode | null = null
    for (let c = 0; c < subjectHeaderRow.length; c++) {
      const v = subjectHeaderRow[c]
      if (v) lastCode = normalizeSubject(String(v))
      filledSubjects.push(lastCode)
    }

    // Build col → (subjectCode, semester)
    type ColMap = { subjectCode: SubjectCode; semester: 1 | 2 | 3 }
    const colMappings = new Map<number, ColMap>()
    for (let c = 3; c < semesterHeaderRow.length; c++) {
      const semLabel = String(semesterHeaderRow[c] ?? '').trim()
      const sem = SEMESTER_LABELS[semLabel]
      if (!sem) continue
      const code = filledSubjects[c]
      if (code) colMappings.set(c, { subjectCode: code, semester: sem })
    }
    if (colMappings.size === 0) continue

    for (let r = dataStartIdx; r < rows.length; r++) {
      const row = rows[r]
      if (!row || row.every(c => c === null)) continue

      const studentId = String(row[2] ?? '').trim()
      if (!studentId || !/^\d+$/.test(studentId)) continue

      // Section: try to extract a number from section string like "10[1]" or just use "1"
      const sectionRaw = String(row[0] ?? '').trim()
      const numMatch = sectionRaw.match(/\[(\d+)\]/) ?? sectionRaw.match(/(?:^|\s)(\d+)(?:\s|$)/)
      const section = numMatch?.[1] ?? '1'

      for (const [colIdx, { subjectCode, semester }] of colMappings) {
        const score = toNum(row[colIdx])
        if (score === null) continue
        scores.push({ studentId, yearId, semester, subjectCode, grade: prevGrade, section, score })
      }
    }
  }
  return scores
}

/**
 * Detect whether the file is the NOOR multi-term format.
 * Heuristic: a row within the first 5 rows contains both 'الفصل الاول' and 'الفصل الثالث'.
 */
export function isNoorMultiTermFile(buffer: ArrayBuffer): boolean {
  try {
    const wb = XLSX.read(buffer, { type: 'array' })
    for (const sheetName of wb.SheetNames) {
      if (sheetName === 'تعليمات') continue
      const ws = wb.Sheets[sheetName]
      const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null }) as unknown[][]
      for (let i = 0; i < Math.min(5, rows.length); i++) {
        const labels = (rows[i] as unknown[]).map(c => String(c ?? '').trim())
        if (labels.includes('الفصل الاول') && labels.includes('الفصل الثالث')) return true
      }
    }
  } catch { /* */ }
  return false
}
