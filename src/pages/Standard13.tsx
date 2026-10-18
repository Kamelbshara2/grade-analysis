import { useState, useMemo } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, ReferenceLine, Cell,
} from 'recharts'
import { dataStore } from '@/store/dataStore'
import { computeFormativeExamGaps, computeSemesterGaps, round2 } from '@/utils/statistics'
import { ANALYSIS_SUBJECTS, SUBJECT_LABELS, isSubjectRelevantForGrade } from '@/utils/subjectMapping'
import type { Language, SubjectCode, Nationality } from '@/types'

interface Props { lang: Language }

type Part = 'formative' | 'semester'
type Section = 'school' | 'subject' | 'grade'

function GapBar({ value, max = 50 }: { value: number | null; max?: number }) {
  if (value === null) return <span className="text-gray-400">—</span>
  const pct = Math.min(Math.abs(value) / max * 100, 100)
  const neg = value < 0
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${neg ? 'bg-red-400' : 'bg-green-400'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className={`text-xs font-semibold w-16 text-end ${neg ? 'text-red-600 dark:text-red-400' : 'text-green-700 dark:text-green-400'}`}>
        {value >= 0 ? '+' : ''}{value.toFixed(1)}%
      </span>
    </div>
  )
}

export default function Standard13({ lang }: Props) {
  const ar = lang === 'ar'
  const years = dataStore.getYears()
  const latestYear = years[years.length - 1] ?? ''

  const [part, setPart] = useState<Part>('formative')
  const [section, setSection] = useState<Section>('school')
  const [semFilter, setSemFilter] = useState<1 | 3>(1)
  const [nationality, setNationality] = useState<Nationality | undefined>(undefined)

  const records = useMemo(() => {
    const all = dataStore.getRecordsByYear(latestYear)
    return nationality ? all.filter(r => r.student.nationality === nationality) : all
  }, [latestYear, nationality])
  const formativeScores = useMemo(() => {
    const all = dataStore.getFormativeScores(latestYear)
    if (!nationality) return all
    const ids = new Set(dataStore.getRecordsByYear(latestYear).filter(r => r.student.nationality === nationality).map(r => r.student.id))
    return all.filter(s => ids.has(s.studentId))
  }, [latestYear, nationality])
  const examScores = useMemo(() => {
    const all = dataStore.getExamScores(latestYear)
    if (!nationality) return all
    const ids = new Set(dataStore.getRecordsByYear(latestYear).filter(r => r.student.nationality === nationality).map(r => r.student.id))
    return all.filter(s => ids.has(s.studentId))
  }, [latestYear, nationality])

  const grades = useMemo(() => [...new Set(records.map(r => r.grade))].sort((a, b) => a - b), [records])

  // ---- Part 1: Formative vs Exam ----
  const allFormativeGaps = useMemo(
    () => computeFormativeExamGaps(formativeScores, examScores, semFilter, undefined, records),
    [formativeScores, examScores, semFilter, records]
  )

  const gradeFormativeGaps = useMemo(() => {
    return grades.map(grade => ({
      grade,
      gaps: computeFormativeExamGaps(formativeScores, examScores, semFilter, grade, records),
    }))
  }, [formativeScores, examScores, semFilter, grades, records])

  // School-level summary (average across subjects)
  const schoolFormativeSummary = useMemo(() => {
    const validGaps = allFormativeGaps.filter(g => g.gap !== null)
    if (validGaps.length === 0) return null
    const avgGap = validGaps.reduce((a, b) => a + (b.gap ?? 0), 0) / validGaps.length
    const avgFormative = validGaps.filter(g => g.avgFormative !== null).reduce((a, b) => a + (b.avgFormative ?? 0), 0) / validGaps.length
    const avgExam = validGaps.filter(g => g.avgExam !== null).reduce((a, b) => a + (b.avgExam ?? 0), 0) / validGaps.length
    const totalStudentsExamHigher = validGaps.reduce((a, b) => a + b.studentsExamHigher, 0)
    const totalStudentsExamLower = validGaps.reduce((a, b) => a + b.studentsExamLower, 0)
    const totalCount = validGaps.reduce((a, b) => a + b.count, 0)
    return { avgGap, avgFormative, avgExam, totalStudentsExamHigher, totalStudentsExamLower, totalCount }
  }, [allFormativeGaps])

  // ---- Part 2: Semester gaps ----
  const semGaps = useMemo(() => computeSemesterGaps(records), [records])

  // School-level semester summary
  const schoolSemSummary = useMemo(() => {
    const valid = semGaps.filter(g => g.gapS1S3 !== null)
    if (valid.length === 0) return null
    const avgS1 = valid.reduce((a, b) => a + (b.avgS1 ?? 0), 0) / valid.length
    const avgS2 = valid.reduce((a, b) => a + (b.avgS2 ?? 0), 0) / valid.length
    const avgS3 = valid.reduce((a, b) => a + (b.avgS3 ?? 0), 0) / valid.length
    const avgAnnual = valid.filter(g => g.avgAnnual !== null).reduce((a, b) => a + (b.avgAnnual ?? 0), 0) / valid.length
    // gap% = (new - old) / annual * 100 — consistent with computeSemesterGaps
    const gapS1S2 = avgAnnual !== 0 ? round2((avgS2 - avgS1) / avgAnnual * 100) : 0
    const gapS2S3 = avgAnnual !== 0 ? round2((avgS3 - avgS2) / avgAnnual * 100) : 0
    const gapS1S3 = avgAnnual !== 0 ? round2((avgS3 - avgS1) / avgAnnual * 100) : 0
    return { avgS1, avgS2, avgS3, gapS1S2, gapS2S3, gapS1S3 }
  }, [semGaps])

  if (!latestYear) {
    return <div className="p-8 text-center text-gray-500">{ar ? 'لا توجد بيانات' : 'No data'}</div>
  }

  const parts: { key: Part; ar: string; en: string }[] = [
    { key: 'formative', ar: 'الجزء 1 — التكويني مقابل الاختبار', en: 'Part 1 — Formative vs Exam' },
    { key: 'semester', ar: 'الجزء 2 — الفجوة بين الفصول', en: 'Part 2 — Semester Gaps' },
  ]

  const sections: { key: Section; ar: string; en: string }[] = [
    { key: 'school', ar: 'المدرسة', en: 'School' },
    { key: 'subject', ar: 'المواد', en: 'Subjects' },
    { key: 'grade', ar: 'الصفوف', en: 'Grades' },
  ]

  const subjectName = (code: SubjectCode) => ar ? SUBJECT_LABELS[code].ar : SUBJECT_LABELS[code].en

  return (
    <div className="p-6 space-y-6" dir={ar ? 'rtl' : 'ltr'}>
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          {ar ? 'معيار 1.3 — تحليل الفجوات' : 'Standard 1.3 — Gap Analysis'}
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          {ar ? `عام ${latestYear} — الفجوة بين التقويم التكويني والاختبار والفجوة بين الفصول` : `Year ${latestYear} — Formative/Exam gap and semester-to-semester gaps`}
        </p>
      </div>

      {/* Nationality filter */}
      <div className="flex gap-2 items-center">
        <span className="text-sm text-gray-500">{ar ? 'الجنسية:' : 'Nationality:'}</span>
        <select
          value={nationality ?? ''}
          onChange={e => setNationality((e.target.value || undefined) as Nationality | undefined)}
          className="border rounded-lg px-3 py-1.5 text-sm bg-white dark:bg-gray-800 dark:border-gray-600"
        >
          <option value="">{ar ? 'الكل' : 'All'}</option>
          <option value="citizen">{ar ? 'مواطن' : 'Citizen'}</option>
          <option value="expat">{ar ? 'وافد' : 'Expat'}</option>
        </select>
      </div>

      {/* Part toggle */}
      <div className="inline-flex rounded-lg border dark:border-gray-700 overflow-hidden">
        {parts.map(p => (
          <button
            key={p.key}
            onClick={() => { setPart(p.key); setSection('school') }}
            className={`px-5 py-2 text-sm font-medium transition-colors ${
              part === p.key
                ? 'bg-primary-600 text-white'
                : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
            }`}
          >
            {ar ? p.ar : p.en}
          </button>
        ))}
      </div>

      {/* Section tabs */}
      <div className="flex gap-1 border-b dark:border-gray-700">
        {sections.map(sec => (
          <button
            key={sec.key}
            onClick={() => setSection(sec.key)}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              section === sec.key
                ? 'border-b-2 border-primary-600 text-primary-700 dark:text-primary-400'
                : 'text-gray-500 hover:text-gray-700 dark:text-gray-400'
            }`}
          >
            {ar ? sec.ar : sec.en}
          </button>
        ))}
      </div>

      {/* ===== PART 1: FORMATIVE vs EXAM ===== */}
      {part === 'formative' && (
        <>
          {/* Semester filter */}
          <div className="flex gap-2 items-center">
            <span className="text-sm text-gray-500">{ar ? 'الفصل:' : 'Semester:'}</span>
            {([1, 3] as const).map(s => (
              <button
                key={s}
                onClick={() => setSemFilter(s)}
                className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                  semFilter === s
                    ? 'bg-primary-600 text-white border-primary-600'
                    : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400'
                }`}
              >
                {ar ? `الفصل ${s === 1 ? 'الأول' : 'الثالث'}` : `Semester ${s}`}
              </button>
            ))}
            {formativeScores.length === 0 && examScores.length === 0 && (
              <span className="text-xs text-amber-600 ms-3">
                {ar ? '⚠️ لم يتم رفع بيانات التقويم التكويني والاختبار بعد' : '⚠️ No formative/exam scores uploaded yet'}
              </span>
            )}
          </div>

          {/* School summary */}
          {section === 'school' && (
            <div className="space-y-4">
              {schoolFormativeSummary ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
                  <div className="card p-4 text-center">
                    <div className="text-xs text-gray-500 mb-1">{ar ? 'متوسط التكويني / 100' : 'Avg Formative / 100'}</div>
                    <div className="text-2xl font-bold text-blue-600">{schoolFormativeSummary.avgFormative.toFixed(1)}</div>
                  </div>
                  <div className="card p-4 text-center">
                    <div className="text-xs text-gray-500 mb-1">{ar ? 'متوسط الاختبار / 100' : 'Avg Exam / 100'}</div>
                    <div className="text-2xl font-bold text-purple-600">{schoolFormativeSummary.avgExam.toFixed(1)}</div>
                  </div>
                  <div className="card p-4 text-center">
                    <div className="text-xs text-gray-500 mb-1">{ar ? 'الفجوة % (تكويني − اختبار)' : 'Gap % (School − Exam)'}</div>
                    <div className={`text-2xl font-bold ${schoolFormativeSummary.avgGap < 0 ? 'text-red-600' : 'text-green-600'}`}>
                      {schoolFormativeSummary.avgGap >= 0 ? '+' : ''}{schoolFormativeSummary.avgGap.toFixed(1)}%
                    </div>
                  </div>
                  <div className="card p-4 text-center">
                    <div className="text-xs text-gray-500 mb-1">{ar ? 'اختبار أعلى من تكويني' : 'Exam > Formative'}</div>
                    <div className="text-2xl font-bold text-green-600">{schoolFormativeSummary.totalStudentsExamHigher}</div>
                  </div>
                  <div className="card p-4 text-center">
                    <div className="text-xs text-gray-500 mb-1">{ar ? 'اختبار أقل من تكويني' : 'Exam < Formative'}</div>
                    <div className="text-2xl font-bold text-red-600">{schoolFormativeSummary.totalStudentsExamLower}</div>
                  </div>
                </div>
              ) : (
                <div className="card p-6 text-center text-gray-400">
                  {ar ? 'لا توجد بيانات تكويني / اختبار لهذا العام' : 'No formative/exam data for this year'}
                </div>
              )}
              {allFormativeGaps.length > 0 && (
                <div className="card p-4">
                  <h2 className="font-semibold text-sm mb-4">{ar ? 'الفجوة % لكل مادة (تكويني − اختبار) / الدرجة الفصلية' : 'Gap % per Subject (School − Exam) / Semester Grade'}</h2>
                  <ResponsiveContainer width="100%" height={240}>
                    <BarChart
                      data={allFormativeGaps.map(g => ({ name: subjectName(g.subjectCode), gap: g.gap ?? 0 }))}
                      margin={{ top: 5, right: 20, left: 0, bottom: 40 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                      <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-35} textAnchor="end" interval={0} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip formatter={(v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`} />
                      <ReferenceLine y={0} stroke="#6b7280" />
                      <Bar dataKey="gap" name={ar ? 'الفجوة %' : 'Gap %'} radius={[3, 3, 0, 0]}>
                        {allFormativeGaps.map((g, i) => (
                          <Cell key={i} fill={(g.gap ?? 0) < 0 ? '#ef4444' : '#22c55e'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          )}

          {/* Subject formative gaps */}
          {section === 'subject' && (
            <div className="overflow-x-auto card">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 dark:bg-gray-800">
                    <th className="px-3 py-2 text-start">{ar ? 'المادة' : 'Subject'}</th>
                    <th className="px-3 py-2 text-center">{ar ? 'متوسط التكويني /100' : 'Avg Formative /100'}</th>
                    <th className="px-3 py-2 text-center">{ar ? 'متوسط الاختبار /100' : 'Avg Exam /100'}</th>
                    <th className="px-3 py-2 text-center">{ar ? 'الفجوة %' : 'Gap %'}</th>
                    <th className="px-3 py-2 text-center">{ar ? 'طلاب اختبار أعلى' : 'Exam Higher'}</th>
                    <th className="px-3 py-2 text-center">{ar ? 'طلاب اختبار أقل' : 'Exam Lower'}</th>
                  </tr>
                </thead>
                <tbody>
                  {allFormativeGaps.map(g => (
                    <tr key={g.subjectCode} className="border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50">
                      <td className="px-3 py-2 font-medium">{subjectName(g.subjectCode)}</td>
                      <td className="px-3 py-2 text-center">{g.avgFormative?.toFixed(1) ?? '—'}</td>
                      <td className="px-3 py-2 text-center">{g.avgExam?.toFixed(1) ?? '—'}</td>
                      <td className="px-3 py-2">
                        <GapBar value={g.gap} />
                      </td>
                      <td className="px-3 py-2 text-center text-green-600 font-semibold">{g.studentsExamHigher}</td>
                      <td className="px-3 py-2 text-center text-red-600 font-semibold">{g.studentsExamLower}</td>
                    </tr>
                  ))}
                  {allFormativeGaps.length === 0 && (
                    <tr><td colSpan={6} className="px-3 py-6 text-center text-gray-400">{ar ? 'لا توجد بيانات' : 'No data'}</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* Grade formative gaps */}
          {section === 'grade' && (
            <div className="space-y-4">
              {gradeFormativeGaps.map(({ grade, gaps }) => (
                <div key={grade} className="card p-4">
                  <h3 className="font-semibold text-sm mb-3">{ar ? `الصف ${grade}` : `Grade ${grade}`}</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-gray-50 dark:bg-gray-800 text-xs">
                          <th className="px-2 py-1.5 text-start">{ar ? 'المادة' : 'Subject'}</th>
                          <th className="px-2 py-1.5 text-center">{ar ? 'تكويني /100' : 'Formative /100'}</th>
                          <th className="px-2 py-1.5 text-center">{ar ? 'اختبار /100' : 'Exam /100'}</th>
                          <th className="px-2 py-1.5 text-center">{ar ? 'فجوة %' : 'Gap %'}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {gaps.map(g => (
                          <tr key={g.subjectCode} className="border-b dark:border-gray-700">
                            <td className="px-2 py-1.5">{subjectName(g.subjectCode)}</td>
                            <td className="px-2 py-1.5 text-center">{g.avgFormative?.toFixed(1) ?? '—'}</td>
                            <td className="px-2 py-1.5 text-center">{g.avgExam?.toFixed(1) ?? '—'}</td>
                            <td className="px-2 py-1.5"><GapBar value={g.gap} /></td>
                          </tr>
                        ))}
                        {gaps.length === 0 && (
                          <tr><td colSpan={4} className="px-2 py-3 text-center text-gray-400 text-xs">{ar ? 'لا توجد بيانات لهذا الصف' : 'No data for this grade'}</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ===== PART 2: SEMESTER GAPS ===== */}
      {part === 'semester' && (
        <>
          {/* School semester summary */}
          {section === 'school' && (
            <div className="space-y-4">
              {schoolSemSummary ? (
                <>
                  <div className="grid grid-cols-3 gap-4">
                    {[
                      { label: ar ? 'متوسط ف1 /100' : 'Avg S1 /100', value: schoolSemSummary.avgS1, color: 'text-blue-600' },
                      { label: ar ? 'متوسط ف2 /100' : 'Avg S2 /100', value: schoolSemSummary.avgS2, color: 'text-indigo-600' },
                      { label: ar ? 'متوسط ف3 /100' : 'Avg S3 /100', value: schoolSemSummary.avgS3, color: 'text-purple-600' },
                    ].map(({ label, value, color }) => (
                      <div key={label} className="card p-4 text-center">
                        <div className="text-xs text-gray-500">{label}</div>
                        <div className={`text-2xl font-bold mt-1 ${color}`}>{value.toFixed(1)}</div>
                      </div>
                    ))}
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    {[
                      { label: ar ? 'فجوة % ف1→ف2' : 'S1→S2 Gap %', value: schoolSemSummary.gapS1S2 },
                      { label: ar ? 'فجوة % ف2→ف3' : 'S2→S3 Gap %', value: schoolSemSummary.gapS2S3 },
                      { label: ar ? 'فجوة % ف1→ف3' : 'S1→S3 Gap %', value: schoolSemSummary.gapS1S3 },
                    ].map(({ label, value }) => (
                      <div key={label} className="card p-4 text-center">
                        <div className="text-xs text-gray-500">{label}</div>
                        <div className={`text-2xl font-bold mt-1 ${value < 0 ? 'text-red-600' : 'text-green-600'}`}>
                          {value >= 0 ? '+' : ''}{value.toFixed(1)}%
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="card p-6 text-center text-gray-400">
                  {ar ? 'لا توجد بيانات فصلية' : 'No semester data'}
                </div>
              )}
              {semGaps.length > 0 && (
                <div className="card p-4">
                  <h2 className="font-semibold text-sm mb-4">{ar ? 'الفجوة ف1→ف3 لكل مادة' : 'S1→S3 Gap per Subject'}</h2>
                  <ResponsiveContainer width="100%" height={240}>
                    <BarChart
                      data={semGaps.filter(g => ANALYSIS_SUBJECTS.includes(g.subjectCode)).map(g => ({
                        name: subjectName(g.subjectCode),
                        s1: g.avgS1 ?? 0,
                        s2: g.avgS2 ?? 0,
                        s3: g.avgS3 ?? 0,
                      }))}
                      margin={{ top: 5, right: 20, left: 0, bottom: 40 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                      <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-35} textAnchor="end" interval={0} />
                      <YAxis domain={[40, 100]} tick={{ fontSize: 11 }} />
                      <Tooltip formatter={(v: number) => v.toFixed(1)} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Bar dataKey="s1" name={ar ? 'ف1' : 'S1'} fill="#6366f1" radius={[2, 2, 0, 0]} />
                      <Bar dataKey="s2" name={ar ? 'ف2' : 'S2'} fill="#8b5cf6" radius={[2, 2, 0, 0]} />
                      <Bar dataKey="s3" name={ar ? 'ف3' : 'S3'} fill="#a855f7" radius={[2, 2, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          )}

          {/* Subject semester gaps */}
          {section === 'subject' && (
            <div className="overflow-x-auto card">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 dark:bg-gray-800">
                    <th className="px-3 py-2 text-start">{ar ? 'المادة' : 'Subject'}</th>
                    <th className="px-3 py-2 text-center">{ar ? 'ف1 /100' : 'S1 /100'}</th>
                    <th className="px-3 py-2 text-center">{ar ? 'ف2 /100' : 'S2 /100'}</th>
                    <th className="px-3 py-2 text-center">{ar ? 'ف3 /100' : 'S3 /100'}</th>
                    <th className="px-3 py-2 text-center">{ar ? 'فجوة% ف1→ف2' : 'Gap% S1→S2'}</th>
                    <th className="px-3 py-2 text-center">{ar ? 'فجوة% ف2→ف3' : 'Gap% S2→S3'}</th>
                    <th className="px-3 py-2 text-center">{ar ? 'فجوة% ف1→ف3' : 'Gap% S1→S3'}</th>
                    <th className="px-3 py-2 text-center">{ar ? 'أولوية' : 'Priority'}</th>
                  </tr>
                </thead>
                <tbody>
                  {semGaps.filter(g => ANALYSIS_SUBJECTS.includes(g.subjectCode)).map(g => {
                    const pColors: Record<string, string> = {
                      critical: 'text-red-700 bg-red-100',
                      high: 'text-orange-700 bg-orange-100',
                      medium: 'text-amber-700 bg-amber-100',
                      low: 'text-yellow-700 bg-yellow-100',
                      ok: 'text-green-700 bg-green-100',
                    }
                    const pLabels: Record<string, string> = {
                      critical: ar ? 'حرج' : 'Critical',
                      high: ar ? 'عالي' : 'High',
                      medium: ar ? 'متوسط' : 'Medium',
                      low: ar ? 'منخفض' : 'Low',
                      ok: ar ? 'جيد' : 'OK',
                    }
                    return (
                      <tr key={g.subjectCode} className="border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50">
                        <td className="px-3 py-2 font-medium">{subjectName(g.subjectCode)}</td>
                        <td className="px-3 py-2 text-center">{g.avgS1?.toFixed(1) ?? '—'}</td>
                        <td className="px-3 py-2 text-center">{g.avgS2?.toFixed(1) ?? '—'}</td>
                        <td className="px-3 py-2 text-center">{g.avgS3?.toFixed(1) ?? '—'}</td>
                        <td className="px-3 py-2"><GapBar value={g.gapS1S2} /></td>
                        <td className="px-3 py-2"><GapBar value={g.gapS2S3} /></td>
                        <td className="px-3 py-2"><GapBar value={g.gapS1S3} /></td>
                        <td className="px-3 py-2 text-center">
                          <span className={`text-xs px-2 py-0.5 rounded font-medium ${pColors[g.priority] ?? ''}`}>
                            {pLabels[g.priority] ?? g.priority}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Grade semester gaps */}
          {section === 'grade' && (
            <div className="space-y-4">
              {grades.map(grade => {
                const gradeRecords = records.filter(r => r.grade === grade)
                const gradeGaps = computeSemesterGaps(gradeRecords).filter(g => ANALYSIS_SUBJECTS.includes(g.subjectCode))
                return (
                  <div key={grade} className="card p-4">
                    <h3 className="font-semibold text-sm mb-3">{ar ? `الصف ${grade}` : `Grade ${grade}`}</h3>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="bg-gray-50 dark:bg-gray-800">
                            <th className="px-2 py-1.5 text-start">{ar ? 'المادة' : 'Subject'}</th>
                            <th className="px-2 py-1.5 text-center">{ar ? 'ف1 /100' : 'S1 /100'}</th>
                            <th className="px-2 py-1.5 text-center">{ar ? 'ف2 /100' : 'S2 /100'}</th>
                            <th className="px-2 py-1.5 text-center">{ar ? 'ف3 /100' : 'S3 /100'}</th>
                            <th className="px-2 py-1.5 text-center min-w-[130px]">{ar ? 'فجوة% ف1→ف3' : 'Gap% S1→S3'}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {gradeGaps.map(g => (
                            <tr key={g.subjectCode} className="border-b dark:border-gray-700">
                              <td className="px-2 py-1.5 font-medium">{subjectName(g.subjectCode)}</td>
                              <td className="px-2 py-1.5 text-center">{g.avgS1?.toFixed(1) ?? '—'}</td>
                              <td className="px-2 py-1.5 text-center">{g.avgS2?.toFixed(1) ?? '—'}</td>
                              <td className="px-2 py-1.5 text-center">{g.avgS3?.toFixed(1) ?? '—'}</td>
                              <td className="px-2 py-1.5"><GapBar value={g.gapS1S3} /></td>
                            </tr>
                          ))}
                          {gradeGaps.length === 0 && (
                            <tr><td colSpan={5} className="px-2 py-3 text-center text-gray-400">{ar ? 'لا توجد بيانات' : 'No data'}</td></tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}
    </div>
  )
}
