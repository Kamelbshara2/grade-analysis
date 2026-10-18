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

  const { yearId, scores } = body
  if (!yearId || !Array.isArray(scores)) return json({ error: 'yearId and scores required' }, 400)

  try {
    const sql = neon(url)
    let upserted = 0

    for (const s of scores) {
      if (!s.studentId || !s.subjectCode) continue
      await sql`
        INSERT INTO exam_scores (student_id, year_id, subject_code, grade, section, s1, s2, s3)
        VALUES (${s.studentId}, ${yearId}, ${s.subjectCode}, ${s.grade ?? null}, ${s.section ?? null},
                ${s.s1 ?? null}, ${s.s2 ?? null}, ${s.s3 ?? null})
        ON CONFLICT (student_id, year_id, subject_code)
        DO UPDATE SET
          grade = EXCLUDED.grade,
          section = EXCLUDED.section,
          s1 = EXCLUDED.s1,
          s2 = EXCLUDED.s2,
          s3 = EXCLUDED.s3
      `
      upserted++
    }

    return json({ upserted })
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
