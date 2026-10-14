import * as XLSX from 'xlsx'
import type {
  StudentRecord, SubjectGrade, SubjectCode, Track, Cycle, Nationality
} from '@/types'
import { mapSubjectName, getCycle, getPassMark } from './subjectMapping'

interface ParsedSubjectColumn {
  code: SubjectCode
  s1Col: number
  s2Col: number
  s3Col: number
  annualCol: number
}

// Parse section string: '09[اللغة الثالثة - المسار العام]/1'
function parseSection(raw: string): { grade: number; track: Track; section: string } {
  const gradeMatch = raw.match(/^(\d{2})/)
  const grade = gradeMatch ? parseInt(gradeMatch[1], 10) : 9

  const track: Track = raw.includes('المتقدم') ? 'advanced' : 'general'

  const sectionMatch = raw.match(/\/(\d+)$/)
  const section = sectionMatch ? sectionMatch[1] : '1'

  return { grade, track, section }
}

// Parse annual grade file from Manhal
export function parseAnnualGradeFile(
  buffer: ArrayBuffer,
  yearId: string,
  nationalityMap: Record<string, Nationality> = {}
): { records: StudentRecord[]; errors: string[] } {
  const wb = XLSX.read(buffer, { type: 'array' })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const raw = XLSX.utils.sheet_to_json<(string | number | null)[]>(ws, {
    header: 1,
    defval: null,
    blankrows: false,
  }) as (string | number | null)[][]

  const errors: string[] = []
  const records: StudentRecord[] = []

  // Find header rows (row index 1 = subject names, row index 2 = semester labels)
  if (raw.length < 4) {
    errors.push('الملف فارغ أو غير صحيح')
    return { records, errors }
  }

  const subjectRow = raw[1] as (string | null)[]
  const semesterRow = raw[2] as (string | null)[]

  // Build subject→column mapping
  const subjectCols: ParsedSubjectColumn[] = []
  // Track which subject codes we've already started (to merge variants)
  const subjectColMap = new Map<SubjectCode, ParsedSubjectColumn>()

  let col = 9 // 0-indexed column 9 = first subject (after 9 fixed cols)
  while (col < subjectRow.length) {
    const subjectName = subjectRow[col]
    if (!subjectName) { col++; continue }

    const code = mapSubjectName(String(subjectName))
    if (!code) { col += 4; continue }

    // Columns: s1=col+0, s2=col+1, s3=col+2, annual=col+3
    if (subjectColMap.has(code)) {
      // Variant of existing subject — don't re-add, just advance
      col += 4
      continue
    }

    const parsed: ParsedSubjectColumn = {
      code,
      s1Col: col,
      s2Col: col + 1,
      s3Col: col + 2,
      annualCol: col + 3,
    }
    subjectCols.push(parsed)
    subjectColMap.set(code, parsed)
    col += 4
  }

  // Find إجمالي / معدل / حالة columns
  let avgCol = -1
  let statusCol = -1
  for (let c = subjectRow.length - 1; c >= 0; c--) {
    const v = subjectRow[c]
    if (v === 'المعدل') avgCol = c
    if (v === 'الحالة') statusCol = c
  }

  // Parse data rows (from row index 3 onwards)
  for (let rowIdx = 3; rowIdx < raw.length; rowIdx++) {
    const row = raw[rowIdx]
    if (!row || !row[8]) continue // skip empty rows (no student ID)

    const studentId = String(row[8]).trim()
    const studentName = String(row[7] || '').trim()
    const sectionRaw = String(row[6] || '').trim()

    if (!studentId || studentId === 'رقم الطالب') continue

    const { grade, track, section } = parseSection(sectionRaw)
    const cycle: Cycle = getCycle(grade)
    const passMark = getPassMark(cycle)

    const grades: Partial<Record<SubjectCode, SubjectGrade>> = {}

    for (const sc of subjectCols) {
      const s1 = parseScore(row[sc.s1Col])
      const s2 = parseScore(row[sc.s2Col])
      const s3 = parseScore(row[sc.s3Col])
      const annual = parseScore(row[sc.annualCol])

      // Only store if at least one semester has data
      if (s1 !== null || s2 !== null || s3 !== null || annual !== null) {
        grades[sc.code] = { s1, s2, s3, annual }
      }
    }

    // Handle subject variants: for subjects like physics/chemistry/biology,
    // a student may appear in multiple variant columns. Take the max non-null.
    // We already deduplicated by code above, but now check variant columns.
    // Actually we need to handle this differently: if a student has 0.0 in main
    // column but a value in a variant column, use the variant.
    // Re-scan with ALL subject columns to merge variants
    for (let c = 9; c < subjectRow.length - 3; c += 4) {
      const subjectName = subjectRow[c]
      if (!subjectName) continue
      const code = mapSubjectName(String(subjectName))
      if (!code) continue

      const s1 = parseScore(row[c])
      const s2 = parseScore(row[c + 1])
      const s3 = parseScore(row[c + 2])
      const annual = parseScore(row[c + 3])

      if (s1 === null && s2 === null && s3 === null && annual === null) continue

      const existing = grades[code]
      if (!existing) {
        grades[code] = { s1, s2, s3, annual }
      } else {
        // Merge: take best non-null values
        grades[code] = {
          s1: bestScore(existing.s1, s1),
          s2: bestScore(existing.s2, s2),
          s3: bestScore(existing.s3, s3),
          annual: bestScore(existing.annual, annual),
        }
      }
    }

    const annualAvg = avgCol >= 0 ? parseScore(row[avgCol]) : null
    const annualTotal = null

    const statusRaw = statusCol >= 0 ? String(row[statusCol] || '') : ''
    const status = statusRaw.includes('ناجح') ? 'pass' :
                   statusRaw.includes('راسب') ? 'fail' : 'unknown'

    const nationality: Nationality = nationalityMap[studentId] || 'unknown'

    records.push({
      student: { id: studentId, name: studentName, nationality },
      yearId,
      grade,
      track,
      section,
      sectionRaw,
      cycle,
      grades,
      annualAvg,
      annualTotal,
      status,
    })
  }

  return { records, errors }
}

function parseScore(val: unknown): number | null {
  if (val === null || val === undefined || val === '') return null
  const n = typeof val === 'number' ? val : parseFloat(String(val))
  if (isNaN(n)) return null
  if (n <= 0) return null // 0.0 means not studied
  return n
}

function bestScore(a: number | null, b: number | null): number | null {
  if (a === null) return b
  if (b === null) return a
  return Math.max(a, b)
}

// ── Grade name → number map (Ministry NOOR student roster format) ─────────────
const GRADE_NAME_MAP: Record<string, number> = {
  'الصف الخامس': 5,
  'الصف السادس': 6,
  'الصف السابع': 7,
  'الصف الثامن': 8,
  'الصف التاسع': 9,
  'الصف العاشر': 10,
  'الصف الحادي عشر': 11,
  'الصف الثاني عشر': 12,
}

/**
 * Parse a Ministry NOOR student roster file.
 * Row 0: title row (skip)
 * Row 1: headers  (رقم الطالب at col 3, الاسم بالعربية col 4,
 *                  الجنسية col 8, الشعبة col 15, المسار col 16, الصف الدراسي col 17)
 * Row 2+: data
 *
 * Produces StudentRecord[] with empty grades so diagnostic / term scores
 * can later be linked by studentId.
 */
export function parseStudentRosterFile(
  buffer: ArrayBuffer,
  yearId: string,
): { records: StudentRecord[]; errors: string[] } {
  const wb = XLSX.read(buffer, { type: 'array' })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const raw = XLSX.utils.sheet_to_json<unknown[]>(ws, {
    header: 1,
    defval: null,
    blankrows: false,
  }) as (string | number | null)[][]

  const errors: string[] = []
  const records: StudentRecord[] = []

  if (raw.length < 3) {
    errors.push('الملف فارغ أو غير صحيح')
    return { records, errors }
  }

  // Detect header row — find the row that contains 'رقم الطالب'
  let headerIdx = -1
  let idCol = 3, nameCol = 4, natCol = 8, sectionCol = 15, trackCol = 16, gradeCol = 17
  for (let i = 0; i < Math.min(5, raw.length); i++) {
    const row = raw[i]
    for (let c = 0; c < row.length; c++) {
      if (String(row[c] ?? '').trim() === 'رقم الطالب') {
        headerIdx = i
        idCol = c
      }
      if (String(row[c] ?? '').trim() === 'الاسم بالعربية') nameCol = c
      if (String(row[c] ?? '').trim().includes('الجنسية')) natCol = c
      if (String(row[c] ?? '').trim() === 'الشعبة') sectionCol = c
      if (String(row[c] ?? '').trim() === 'المسار') trackCol = c
      if (String(row[c] ?? '').trim() === 'الصف الدراسي') gradeCol = c
    }
    if (headerIdx >= 0) break
  }

  if (headerIdx === -1) {
    errors.push('لم يتم العثور على صف العناوين (رقم الطالب)')
    return { records, errors }
  }

  for (let r = headerIdx + 1; r < raw.length; r++) {
    const row = raw[r]
    if (!row) continue

    const studentId = String(row[idCol] ?? '').trim()
    if (!studentId || studentId === 'رقم الطالب') continue

    const name = String(row[nameCol] ?? '').trim()
    const natRaw = String(row[natCol] ?? '').trim()
    const nationality: Nationality = natRaw === 'الإمارات العربية المتحدة' ? 'citizen'
      : natRaw ? 'expat' : 'unknown'

    const gradeRaw = String(row[gradeCol] ?? '').trim()
    const grade = GRADE_NAME_MAP[gradeRaw] ?? 0
    if (!grade) { errors.push(`صف غير معروف: ${gradeRaw} (الطالب ${studentId})`); continue }

    const trackRaw = String(row[trackCol] ?? '').trim()
    const track: Track = trackRaw === 'متقدم' ? 'advanced' : 'general'

    const section = String(row[sectionCol] ?? '1').trim()
    const cycle: Cycle = getCycle(grade)

    records.push({
      student: { id: studentId, name, nationality },
      yearId,
      grade,
      track,
      section,
      sectionRaw: `${grade}/${section}`,
      cycle,
      grades: {},
      annualAvg: null,
      annualTotal: null,
      status: 'unknown',
    })
  }

  return { records, errors }
}

// Parse a nationality CSV: student_id,nationality (citizen/expat)
export function parseNationalityFile(
  buffer: ArrayBuffer
): Record<string, Nationality> {
  const wb = XLSX.read(buffer, { type: 'array' })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json<{ id: string; nationality: string }>(ws, {
    header: ['id', 'nationality'],
  })
  const map: Record<string, Nationality> = {}
  for (const row of rows) {
    if (!row.id) continue
    const n = String(row.nationality || '').toLowerCase()
    map[String(row.id)] = n.includes('مواطن') || n === 'citizen' ? 'citizen' :
                           n.includes('وافد') || n === 'expat' ? 'expat' : 'unknown'
  }
  return map
}
