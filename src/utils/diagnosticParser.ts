import * as XLSX from 'xlsx'
import type { DiagnosticScore, SubjectCode } from '@/types'
import { mapSubjectName } from './subjectMapping'

// Parse diagnostic test score file
// Expected columns: student_id, subject, score
// OR: student_id, arabic, english, math, ...
export function parseDiagnosticFile(buffer: ArrayBuffer, yearId: string): DiagnosticScore[] {
  const wb = XLSX.read(buffer, { type: 'array' })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: null })

  const scores: DiagnosticScore[] = []

  if (rows.length === 0) return scores

  const firstRow = rows[0]
  const keys = Object.keys(firstRow)

  // Detect if it's wide format (one row per student, columns per subject)
  // vs long format (student_id, subject, score columns)
  const hasSubjectCol = keys.some(k => k.toLowerCase().includes('subject') || k.includes('مادة'))
  const hasScoreCol = keys.some(k => k.toLowerCase() === 'score' || k.includes('درجة'))

  if (hasSubjectCol && hasScoreCol) {
    // Long format
    const idKey = keys.find(k => k.toLowerCase().includes('id') || k.includes('رقم')) ?? keys[0]
    const subjectKey = keys.find(k => k.toLowerCase().includes('subject') || k.includes('مادة')) ?? keys[1]
    const scoreKey = keys.find(k => k.toLowerCase() === 'score' || k.includes('درجة')) ?? keys[2]

    for (const row of rows) {
      const studentId = String(row[idKey] ?? '').trim()
      const subjectName = String(row[subjectKey] ?? '').trim()
      const scoreRaw = row[scoreKey]
      if (!studentId || !subjectName) continue
      const score = typeof scoreRaw === 'number' ? scoreRaw : parseFloat(String(scoreRaw))
      if (isNaN(score)) continue
      const subjectCode = mapSubjectName(subjectName)
      if (!subjectCode) continue
      scores.push({ studentId, yearId, subjectCode, score })
    }
  } else {
    // Wide format: first col = student_id, remaining cols = subjects
    const idKey = keys[0]
    const subjectKeys = keys.slice(1)

    for (const row of rows) {
      const studentId = String(row[idKey] ?? '').trim()
      if (!studentId || studentId === idKey) continue

      for (const k of subjectKeys) {
        const subjectCode = mapSubjectName(k) as SubjectCode | null
        if (!subjectCode) continue
        const scoreRaw = row[k]
        const score = typeof scoreRaw === 'number' ? scoreRaw : parseFloat(String(scoreRaw))
        if (isNaN(score) || score <= 0) continue
        scores.push({ studentId, yearId, subjectCode, score })
      }
    }
  }

  return scores
}
