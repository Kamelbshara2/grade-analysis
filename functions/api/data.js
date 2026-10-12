/**
 * Cloudflare Pages Function: GET /api/data
 * Reads all students from D1 and returns them in AppData format.
 */

export async function onRequestGet({ env }) {
  const db = env.DB
  if (!db) {
    return new Response(JSON.stringify({ error: 'DB binding not found' }), {
      status: 500,
      headers: corsHeaders(),
    })
  }

  try {
    const { results } = await db.prepare('SELECT * FROM students ORDER BY year, grade, section_num').all()

    // Build AppData format
    const years = {}

    for (const row of results) {
      const yearId = row.year
      if (!years[yearId]) {
        years[yearId] = { yearId, records: [], diagnosticScores: [], uploadedAt: new Date().toISOString() }
      }

      const record = rowToRecord(row)
      years[yearId].records.push(record)
    }

    const body = JSON.stringify({ years, learningOutcomes: [], outcomeScores: [] })
    return new Response(body, {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: corsHeaders(),
    })
  }
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: corsHeaders() })
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  }
}

function nullOrNum(v) {
  if (v === null || v === undefined) return null
  const n = Number(v)
  return isNaN(n) ? null : n
}

function rowToRecord(row) {
  const grade = Number(row.grade)
  const cycle = grade >= 9 ? 3 : 2

  const subjects = ['arabic', 'english', 'math', 'science', 'islamic', 'social', 'physics', 'chemistry', 'biology']
  const grades = {}
  for (const s of subjects) {
    const s1 = nullOrNum(row[`${s}_s1`])
    const s2 = nullOrNum(row[`${s}_s2`])
    const s3 = nullOrNum(row[`${s}_s3`])
    const annual = nullOrNum(row[`${s}_annual`])
    if (s1 !== null || s2 !== null || s3 !== null || annual !== null) {
      grades[s] = { s1, s2, s3, annual }
    }
  }

  const passMark = cycle === 3 ? 60 : 50
  const avg = nullOrNum(row.average)
  const status = avg === null ? 'unknown' : avg >= passMark ? 'pass' : 'fail'

  return {
    student: {
      id: String(row.student_id),
      name: row.name || '',
      nationality: 'unknown',
    },
    yearId: row.year,
    grade,
    track: row.track || 'general',
    section: String(row.section_num || '1'),
    sectionRaw: row.section_raw || '',
    cycle,
    grades,
    annualAvg: avg,
    annualTotal: null,
    status,
  }
}
