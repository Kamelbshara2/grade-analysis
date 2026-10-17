import { neon } from '@neondatabase/serverless'

export const config = { runtime: 'edge' }

export default async function handler(request) {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders() })
  }

  const url = process.env.DATABASE_URL
  if (!url) return json({ error: 'DATABASE_URL not configured' }, 500)

  try {
    const sql = neon(url)

    const [records, subjects, termScores, formative, exam] = await Promise.all([
      sql`SELECT * FROM student_records ORDER BY year_id, grade, section`,
      sql`SELECT * FROM subject_grades`,
      sql`SELECT * FROM term_scores`,
      sql`SELECT * FROM formative_scores`,
      sql`SELECT * FROM exam_scores`,
    ])

    const subjectMap = {}
    for (const row of subjects) {
      const key = `${row.student_id}::${row.year_id}`
      if (!subjectMap[key]) subjectMap[key] = {}
      subjectMap[key][row.subject_code] = {
        s1: row.s1 !== null ? Number(row.s1) : null,
        s2: row.s2 !== null ? Number(row.s2) : null,
        s3: row.s3 !== null ? Number(row.s3) : null,
        annual: row.annual !== null ? Number(row.annual) : null,
      }
    }

    const years = {}
    for (const row of records) {
      const yearId = row.year_id
      if (!years[yearId]) {
        years[yearId] = {
          yearId,
          records: [],
          diagnosticScores: [],
          formativeScores: [],
          examScores: [],
          termScores: [],
          uploadedAt: row.uploaded_at,
        }
      }
      const key = `${row.student_id}::${yearId}`
      years[yearId].records.push({
        student: { id: row.student_id, name: row.student_name, nationality: row.nationality },
        yearId,
        grade: Number(row.grade),
        track: row.track,
        section: row.section,
        sectionRaw: row.section_raw,
        cycle: Number(row.cycle),
        grades: subjectMap[key] || {},
        annualAvg: row.annual_avg !== null ? Number(row.annual_avg) : null,
        annualTotal: row.annual_total !== null ? Number(row.annual_total) : null,
        status: row.status,
      })
    }

    const ensureYear = (yearId) => {
      if (!years[yearId]) {
        years[yearId] = { yearId, records: [], diagnosticScores: [], formativeScores: [], examScores: [], termScores: [], uploadedAt: new Date().toISOString() }
      }
    }

    for (const row of termScores) {
      ensureYear(row.year_id)
      years[row.year_id].termScores.push({
        studentId: row.student_id,
        yearId: row.year_id,
        semester: Number(row.semester),
        subjectCode: row.subject_code,
        grade: Number(row.grade),
        section: row.section,
        score: row.score !== null ? Number(row.score) : null,
      })
    }
    for (const row of formative) {
      ensureYear(row.year_id)
      years[row.year_id].formativeScores.push({
        studentId: row.student_id,
        yearId: row.year_id,
        subjectCode: row.subject_code,
        grade: Number(row.grade),
        section: row.section,
        s1: row.s1 !== null ? Number(row.s1) : null,
        s2: row.s2 !== null ? Number(row.s2) : null,
        s3: row.s3 !== null ? Number(row.s3) : null,
      })
    }
    for (const row of exam) {
      ensureYear(row.year_id)
      years[row.year_id].examScores.push({
        studentId: row.student_id,
        yearId: row.year_id,
        subjectCode: row.subject_code,
        grade: Number(row.grade),
        section: row.section,
        s1: row.s1 !== null ? Number(row.s1) : null,
        s2: row.s2 !== null ? Number(row.s2) : null,
        s3: row.s3 !== null ? Number(row.s3) : null,
      })
    }

    return json({ years, learningOutcomes: [], outcomeScores: [] }, 200)
  } catch (err) {
    return json({ error: String(err) }, 500)
  }
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders() },
  })
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  }
}
