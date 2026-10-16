/**
 * Cloudflare Pages Function: POST /api/students
 * Body: { yearId, records: StudentRecord[] }
 * Upserts student_records and subject_grades into Neon.
 */
import { neon } from '@neondatabase/serverless'

export async function onRequestPost({ env, request }) {
  const url = env.DATABASE_URL
  if (!url) return json({ error: 'DATABASE_URL not configured' }, 500)

  let body
  try { body = await request.json() } catch { return json({ error: 'Invalid JSON' }, 400) }

  const { yearId, records } = body
  if (!yearId || !Array.isArray(records)) return json({ error: 'yearId and records required' }, 400)

  try {
    const sql = neon(url)
    let upserted = 0

    for (const r of records) {
      const sid = r.student?.id
      if (!sid) continue

      await sql`
        INSERT INTO student_records
          (student_id, student_name, nationality, year_id, grade, track, section, section_raw, cycle, annual_avg, annual_total, status)
        VALUES
          (${sid}, ${r.student.name}, ${r.student.nationality ?? 'unknown'},
           ${yearId}, ${r.grade}, ${r.track}, ${r.section}, ${r.sectionRaw},
           ${r.cycle}, ${r.annualAvg ?? null}, ${r.annualTotal ?? null}, ${r.status ?? 'unknown'})
        ON CONFLICT (student_id, year_id)
        DO UPDATE SET
          student_name  = EXCLUDED.student_name,
          nationality   = EXCLUDED.nationality,
          grade         = EXCLUDED.grade,
          track         = EXCLUDED.track,
          section       = EXCLUDED.section,
          section_raw   = EXCLUDED.section_raw,
          cycle         = EXCLUDED.cycle,
          annual_avg    = EXCLUDED.annual_avg,
          annual_total  = EXCLUDED.annual_total,
          status        = EXCLUDED.status,
          uploaded_at   = NOW()
      `

      for (const [subjectCode, g] of Object.entries(r.grades ?? {})) {
        await sql`
          INSERT INTO subject_grades (student_id, year_id, subject_code, s1, s2, s3, annual)
          VALUES (${sid}, ${yearId}, ${subjectCode}, ${g.s1 ?? null}, ${g.s2 ?? null}, ${g.s3 ?? null}, ${g.annual ?? null})
          ON CONFLICT (student_id, year_id, subject_code)
          DO UPDATE SET s1 = EXCLUDED.s1, s2 = EXCLUDED.s2, s3 = EXCLUDED.s3, annual = EXCLUDED.annual
        `
      }
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
