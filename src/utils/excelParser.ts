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
  'الصف الرابع': 4,
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

/**
 * Parse the partial external school file format.
 * Row index 0: title (skip)
 * Row index 1: headers — A=رقم الطالب, B=الاسم بالعربية, C=الاسم بالانجليزية,
 *              D=الجنسية (country name), E=emarati/expat flag,
 *              F=الشعبة (section), G=المسار (track), H=grade number,
 *              I=classroom string (e.g. "4-1"), J=year label,
 *              K=اللغة العربية, L=اللغة الانجليزية, M=الرياضيات, N=العلوم
 * Row index 2+: data
 * Annual grades only — s1/s2/s3 are null.
 */
export function parsePartialSchoolFile(
  buffer: ArrayBuffer,
  yearId: string,
  schoolName: string,
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

  // Find header row containing 'رقم الطالب'
  let headerIdx = -1
  for (let i = 0; i < Math.min(5, raw.length); i++) {
    if (raw[i].some(c => String(c ?? '').trim() === 'رقم الطالب')) {
      headerIdx = i
      break
    }
  }
  if (headerIdx === -1) {
    errors.push('لم يتم العثور على صف العناوين (رقم الطالب)')
    return { records, errors }
  }

  const headerRow = raw[headerIdx]

  // Detect column indices dynamically
  let idCol = 0, nameCol = 1, natFlagCol = 4, sectionCol = 5, trackCol = 6
  let gradeNumCol = 7, arabicCol = -1, englishCol = -1, mathCol = -1, scienceCol = -1

  for (let c = 0; c < headerRow.length; c++) {
    const h = String(headerRow[c] ?? '').trim()
    if (h === 'رقم الطالب') idCol = c
    else if (h === 'الاسم بالعربية') nameCol = c
    else if (h === 'emarati' || h === 'expat' || h === 'إماراتي') natFlagCol = c
    else if (h === 'الشعبة') sectionCol = c
    else if (h === 'المسار') trackCol = c
    else if (/^grade$|^الصف$|^درجة$/i.test(h) || h.match(/^\d+$/) !== null) {
      // grade column is usually a number header — detect by position or name
    }
    else if (h === 'اللغة العربية' || h === 'عربي') arabicCol = c
    else if (h === 'اللغة الانجليزية' || h === 'اللغة الإنجليزية' || h === 'إنجليزي') englishCol = c
    else if (h === 'الرياضيات' || h === 'رياضيات') mathCol = c
    else if (h === 'العلوم' || h === 'علوم') scienceCol = c
  }

  // gradeNumCol: try col 7 (H) or look for column with numeric header like "8" or "9"
  // Also try detecting from header name
  for (let c = 0; c < headerRow.length; c++) {
    const h = String(headerRow[c] ?? '').trim()
    if (/^(grade|الصف الدراسي)$/i.test(h) || h === 'الصف') {
      gradeNumCol = c
    }
  }
  // Fallback: col 7 if specific column not found
  if (gradeNumCol === 7 && arabicCol > 0) {
    // Use the column just before arabic if it looks like it has grade numbers
  }

  const subjectCols: { code: SubjectCode; col: number }[] = []
  if (arabicCol >= 0) subjectCols.push({ code: 'arabic', col: arabicCol })
  if (englishCol >= 0) subjectCols.push({ code: 'english', col: englishCol })
  if (mathCol >= 0) subjectCols.push({ code: 'math', col: mathCol })
  if (scienceCol >= 0) subjectCols.push({ code: 'science', col: scienceCol })

  if (subjectCols.length === 0) {
    errors.push('لم يتم العثور على أعمدة المواد (عربي، إنجليزي، رياضيات، علوم)')
    return { records, errors }
  }

  for (let r = headerIdx + 1; r < raw.length; r++) {
    const row = raw[r]
    if (!row) continue

    const studentId = String(row[idCol] ?? '').trim()
    if (!studentId || studentId === 'رقم الطالب') continue

    const name = String(row[nameCol] ?? '').trim()

    const natFlag = String(row[natFlagCol] ?? '').trim().toLowerCase()
    const nationality: Nationality = natFlag === 'emarati' ? 'citizen'
      : natFlag === 'expat' ? 'expat' : 'unknown'

    // Grade: try gradeNumCol (col 7 = H)
    const gradeRaw = row[gradeNumCol]
    const grade = gradeRaw !== null && gradeRaw !== '' ? parseInt(String(gradeRaw), 10) : 0
    if (!grade || isNaN(grade)) {
      errors.push(`صف غير معروف للطالب ${studentId}`)
      continue
    }

    const trackRaw = String(row[trackCol] ?? '').trim()
    const track: Track = trackRaw === 'متقدم' ? 'advanced' : 'general'

    // Section: try sectionCol, or parse from classroom string (col 8 = "4-1" → "1")
    let section = String(row[sectionCol] ?? '').trim()
    if (!section || section === 'null') {
      // Try classroom col (I = index 8): "4-1" → section "1"
      const classroom = String(row[8] ?? '').trim()
      const m = classroom.match(/-(\d+)$/)
      section = m ? m[1] : '1'
    }

    const cycle: Cycle = getCycle(grade)

    const grades: Partial<Record<SubjectCode, SubjectGrade>> = {}
    for (const { code, col } of subjectCols) {
      const annual = parsePartialScore(row[col])
      if (annual !== null) {
        grades[code] = { s1: null, s2: null, s3: null, annual }
      }
    }

    // Determine pass/fail from annual grades (pass if all non-null grades >= pass mark)
    const passMark = getPassMark(cycle)
    const gradeVals = Object.values(grades).map(g => g?.annual).filter(v => v !== null) as number[]
    const status: 'pass' | 'fail' | 'unknown' = gradeVals.length === 0
      ? 'unknown'
      : gradeVals.every(v => v >= passMark) ? 'pass' : 'fail'

    records.push({
      student: { id: studentId, name, nationality },
      yearId,
      grade,
      track,
      section,
      sectionRaw: `${grade}/${section}`,
      cycle,
      grades,
      annualAvg: gradeVals.length > 0 ? gradeVals.reduce((a, b) => a + b, 0) / gradeVals.length : null,
      annualTotal: null,
      status,
      sourceSchool: schoolName,
    })
  }

  return { records, errors }
}

function parsePartialScore(val: unknown): number | null {
  if (val === null || val === undefined || val === '') return null
  const n = typeof val === 'number' ? val : parseFloat(String(val))
  if (isNaN(n)) return null
  return n > 0 ? n : null
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
