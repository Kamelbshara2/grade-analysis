import * as XLSX from 'xlsx'
import type { TermScore, SubjectCode } from '@/types'

/**
 * Normalise a column header to a SubjectCode using case-insensitive, trimmed
 * matching with Arabic and English keyword variants.
 *
 * Priority order (most-specific first):
 * chemistry → physics → biology → health_science → science →
 * arabic → english → math → islamic → social
 */
export function normalizeSubjectName(col: string): SubjectCode | null {
  const lower = col.trim().toLowerCase()
  if (!lower) return null

  // chemistry: chemistry, كيمياء, chem (not biochem)
  if (
    lower.includes('كيمياء') ||
    lower.includes('chemistry') ||
    (lower.includes('chem') && !lower.includes('biochem'))
  ) return 'chemistry'

  // physics: physics, فيزياء, phys (not metaphysics)
  if (
    lower.includes('فيزياء') ||
    lower.includes('physics') ||
    (lower.includes('phys') && !lower.includes('metaphysics'))
  ) return 'physics'

  // biology: biology, أحياء, احياء, bio (not biography)
  if (
    lower.includes('أحياء') ||
    lower.includes('احياء') ||
    lower.includes('biology') ||
    (lower.includes('bio') && !lower.includes('biography'))
  ) return 'biology'

  // health_science: health, علوم الصحة, صحة
  if (
    lower.includes('علوم الصحة') ||
    lower.includes('صحة') ||
    lower.includes('health')
  ) return 'health_science'

  // science: science, علوم (more-specific subjects take priority above)
  if (lower.includes('علوم') || lower.includes('science')) return 'science'

  // arabic: arabic, عربي, لغة عربية, اللغة العربية
  if (
    lower.includes('عربي') ||
    lower.includes('لغة عربية') ||
    lower.includes('اللغة العربية') ||
    lower.includes('arabic')
  ) return 'arabic'

  // english: english, إنجليزي, انجليزي, لغة إنجليزية, اللغة الإنجليزية
  if (
    lower.includes('إنجليزي') ||
    lower.includes('انجليزي') ||
    lower.includes('لغة إنجليزية') ||
    lower.includes('اللغة الإنجليزية') ||
    lower.includes('اللغة الانجليزية') ||
    lower.includes('english')
  ) return 'english'

  // math: math, رياضيات, حساب
  if (
    lower.includes('رياضيات') ||
    lower.includes('حساب') ||
    lower.includes('math')
  ) return 'math'

  // islamic: islamic, تربية إسلامية, تربية اسلامية, اسلامية, الإسلامية
  if (
    lower.includes('تربية إسلامية') ||
    lower.includes('تربية اسلامية') ||
    lower.includes('اسلامية') ||
    lower.includes('الإسلامية') ||
    lower.includes('islamic')
  ) return 'islamic'

  // social: social, تربية وطنية, دراسات اجتماعية, وطنية, اجتماعية
  if (
    lower.includes('تربية وطنية') ||
    lower.includes('دراسات اجتماعية') ||
    lower.includes('وطنية') ||
    lower.includes('اجتماعية') ||
    lower.includes('social')
  ) return 'social'

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
 * When two columns map to the same subject, takes the first non-null value.
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
    // Map subjectCode → list of column indices (first non-null wins during row scan)
    const subjectColsMap = new Map<SubjectCode, number[]>()

    for (let c = 0; c < headerRow.length; c++) {
      const cell = String(headerRow[c] ?? '').trim()
      if (cell.includes('رقم الطالب') || cell === 'student_id') { studentIdCol = c; continue }
      if (cell === 'الصف' || cell === 'grade') { gradeCol = c; continue }
      if (cell.includes('الفصل') || cell.includes('القسم') || cell === 'section') { sectionCol = c; continue }
      const code = normalizeSubjectName(cell)
      if (code) {
        if (!subjectColsMap.has(code)) subjectColsMap.set(code, [])
        subjectColsMap.get(code)!.push(c)
      }
    }

    if (studentIdCol === -1 || subjectColsMap.size === 0) continue

    for (let r = headerRowIdx + 1; r < rows.length; r++) {
      const row = rows[r] as unknown[]
      const studentId = String(row[studentIdCol] ?? '').trim()
      if (!studentId || studentId.startsWith('*')) continue
      const grade = gradeCol >= 0 ? (Number(row[gradeCol]) || 0) : 0
      const section = sectionCol >= 0 ? String(row[sectionCol] ?? '1').trim() : '1'

      for (const [subjectCode, colIdxs] of subjectColsMap) {
        let score: number | null = null
        for (const colIdx of colIdxs) {
          score = toNum(row[colIdx])
          if (score !== null) break
        }
        if (score === null) continue
        scores.push({ studentId, yearId, semester, subjectCode, grade, section, score })
      }
    }
  }

  return scores
}

/**
 * Parse Ministry NOOR term results file.
 * Sheet "تحليل النتائج": row1=subject names (merged), row2=sub-column labels, rows3+=data.
 * Auto-detects semester from row2 term label (الفصل الاول/الثاني/الثالث).
 * Merges variant columns for the same subject (takes best non-null score).
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

  // Map subjectCode → [termScoreColIndex] — uses normalizeSubjectName for matching
  const codeTermCols = new Map<SubjectCode, number[]>()
  for (let i = 0; i < subjectStarts.length; i++) {
    const { col: start, name } = subjectStarts[i]
    const end = i + 1 < subjectStarts.length ? subjectStarts[i + 1].col - 1 : row1.length - 1

    const code = normalizeSubjectName(name)
    if (!code) continue

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

  // Map subjectCode → { formativeCol, examCol } — uses normalizeSubjectName for matching
  const codeFormativeCols = new Map<SubjectCode, number>()
  const codeExamCols = new Map<SubjectCode, number>()

  for (let i = 0; i < subjectStarts.length; i++) {
    const { col: start, name } = subjectStarts[i]
    const end = i + 1 < subjectStarts.length ? subjectStarts[i + 1].col - 1 : row1.length - 1

    const code = normalizeSubjectName(name)
    if (!code) continue

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
