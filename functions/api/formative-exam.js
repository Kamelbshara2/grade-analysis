/**
 * Cloudflare Pages Function: POST /api/formative-exam
 * Body: { yearId, semester, formativeItems, examItems }
 */
import { neon } from '@neondatabase/serverless'

export async function onRequestPost({ env, request }) {
  const url = env.DATABASE_URL
  if (!url) return json({ error: 'DATABASE_URL not configured' }, 500)

  let body
  try { body = await request.json() } catch { return json({ error: 'Invalid JSON' }, 400) }

  const { yearId, semester, formativeItems = [], examItems = [] } = body
  if (!yearId || !semester) return json({ error: 'yearId and semester required' }, 400)

  const semCol = `s${semester}`

  try {
    const sql = neon(url)
    let upserted = 0

    for (const item of formativeItems) {
      await sql`
        INSERT INTO formative_scores (student_id, year_id, subject_code, grade, section, ${sql(semCol)})
        VALUES (${item.studentId}, ${yearId}, ${item.subjectCode}, ${item.grade}, ${item.section}, ${item.score ?? null})
        ON CONFLICT (student_id, year_id, subject_code)
        DO UPDATE SET ${sql(semCol)} = EXCLUDED.${sql(semCol)}
      `
      upserted++
    }

    for (const item of examItems) {
      await sql`
        INSERT INTO exam_scores (student_id, year_id, subject_code, grade, section, ${sql(semCol)})
        VALUES (${item.studentId}, ${yearId}, ${item.subjectCode}, ${item.grade}, ${item.section}, ${item.score ?? null})
        ON CONFLICT (student_id, year_id, subject_code)
        DO UPDATE SET ${sql(semCol)} = EXCLUDED.${sql(semCol)}
      `
      upserted++
    }

    return json({ ok: true, upserted })
  } catch (err) {
    return json({ error: String(err) }, 500)
  }
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: corsHeaders() })
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
