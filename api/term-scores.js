import { neon } from '@neondatabase/serverless'

export const config = { runtime: 'edge' }

export default async function handler(request) {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders() })
  }
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const url = process.env.DATABASE_URL
  if (!url) return json({ error: 'DATABASE_URL not configured' }, 500)

  let body
  try { body = await request.json() } catch { return json({ error: 'Invalid JSON' }, 400) }

  const { yearId, semester, scores } = body
  if (!yearId || !semester || !Array.isArray(scores)) return json({ error: 'yearId, semester and scores required' }, 400)

  try {
    const sql = neon(url)
    let upserted = 0

    for (const s of scores) {
      await sql`
        INSERT INTO term_scores (student_id, year_id, semester, subject_code, grade, section, score)
        VALUES (${s.studentId}, ${yearId}, ${semester}, ${s.subjectCode}, ${s.grade}, ${s.section}, ${s.score ?? null})
        ON CONFLICT (student_id, year_id, semester, subject_code)
        DO UPDATE SET score = EXCLUDED.score, grade = EXCLUDED.grade, section = EXCLUDED.section
      `
      upserted++
    }

    return json({ ok: true, upserted })
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
