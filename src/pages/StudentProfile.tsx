import { useState, useMemo } from 'react'
import { Search } from 'lucide-react'
import { t } from '@/i18n/translations'
import type { Language, SubjectCode, StudentRecord } from '@/types'
import { dataStore } from '@/store/dataStore'
import { SUBJECT_LABELS, getCycle } from '@/utils/subjectMapping'
import { round2 } from '@/utils/statistics'
import StudentTrendChart from '@/components/charts/StudentTrendChart'

interface StudentProfileProps {
  lang: Language
}

type ProgressCategory = 'significant_progress' | 'slight_progress' | 'stable' | 'regression' | 'no_baseline'

function classifyProgress(baseline: number, current: number): ProgressCategory {
  const diff = current - baseline
  if (baseline >= 90) {
    if (current >= 86) return 'stable'
    return 'regression'
  }
  if (diff > 4) return 'significant_progress'
  if (diff >= 0) return 'slight_progress'
  return 'regression'
}

function categoryColor(cat: ProgressCategory): string {
  switch (cat) {
    case 'significant_progress': return 'text-green-700 bg-green-50 dark:bg-green-900/20 dark:text-green-300'
    case 'slight_progress': return 'text-blue-700 bg-blue-50 dark:bg-blue-900/20 dark:text-blue-300'
    case 'stable': return 'text-yellow-700 bg-yellow-50 dark:bg-yellow-900/20 dark:text-yellow-300'
    case 'regression': return 'text-red-700 bg-red-50 dark:bg-red-900/20 dark:text-red-300'
    default: return 'text-gray-500 bg-gray-50 dark:bg-gray-800'
  }
}

function categoryLabel(cat: ProgressCategory, lang: Language): string {
  switch (cat) {
    case 'significant_progress': return lang === 'ar' ? 'تقدم ملحوظ' : 'Significant Progress'
    case 'slight_progress': return lang === 'ar' ? 'تقدم بسيط' : 'Slight Progress'
    case 'stable': return lang === 'ar' ? 'مستقر' : 'Stable'
    case 'regression': return lang === 'ar' ? 'تراجع' : 'Regression'
    default: return lang === 'ar' ? 'لا أساس' : 'No Baseline'
  }
}

export default function StudentProfile({ lang }: StudentProfileProps) {
  const [query, setQuery] = useState('')
  const [searched, setSearched] = useState(false)

  const allRecords = useMemo(() => dataStore.getAllRecords(), [])
  const years = useMemo(() => dataStore.getYears().sort(), [])

  // Group records by student ID
  const studentMap = useMemo(() => {
    const map = new Map<string, StudentRecord[]>()
    for (const r of allRecords) {
      const existing = map.get(r.student.id) || []
      existing.push(r)
      map.set(r.student.id, existing)
    }
    return map
  }, [allRecords])

  // Search result
  const foundStudent = useMemo(() => {
    if (!searched || !query.trim()) return null
    const q = query.trim().toLowerCase()
    for (const [id, records] of studentMap) {
      const name = records[0]?.student.name?.toLowerCase() || ''
      if (id.toLowerCase() === q || name.includes(q)) {
        return { id, records: records.sort((a, b) => a.yearId.localeCompare(b.yearId)) }
      }
    }
    return null
  }, [searched, query, studentMap])

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    setSearched(true)
  }

  // All subjects that appear for this student
  const studentSubjects = useMemo((): SubjectCode[] => {
    if (!foundStudent) return []
    const subjectSet = new Set<SubjectCode>()
    for (const r of foundStudent.records) {
      for (const s of Object.keys(r.grades) as SubjectCode[]) {
        if (r.grades[s]?.annual !== null && r.grades[s]?.annual !== undefined) {
          subjectSet.add(s)
        }
      }
    }
    return [...subjectSet]
  }, [foundStudent])

  // Build trend data per subject
  function getTrendData(subject: SubjectCode) {
    if (!foundStudent) return []
    return foundStudent.records.map(r => ({
      year: r.yearId,
      score: r.grades[subject]?.annual ?? null,
      grade: r.grade,
    }))
  }

  // Progress analysis: compare consecutive years for each subject
  const progressRows = useMemo(() => {
    if (!foundStudent) return []
    const rows: Array<{
      yearId: string
      subject: SubjectCode
      subjectLabel: string
      score: number | null
      prevScore: number | null
      diff: number | null
      category: ProgressCategory
    }> = []

    const byYear = foundStudent.records
    for (let i = 0; i < byYear.length; i++) {
      const r = byYear[i]
      const prev = i > 0 ? byYear[i - 1] : null
      for (const subject of studentSubjects) {
        const score = r.grades[subject]?.annual ?? null
        const prevScore = prev?.grades[subject]?.annual ?? null
        let diff: number | null = null
        let category: ProgressCategory = 'no_baseline'
        if (score !== null && prevScore !== null) {
          diff = score - prevScore
          category = classifyProgress(prevScore, score)
        } else if (score !== null) {
          category = 'no_baseline'
        }
        if (score !== null) {
          rows.push({
            yearId: r.yearId,
            subject,
            subjectLabel: SUBJECT_LABELS[subject]?.[lang] ?? subject,
            score,
            prevScore,
            diff,
            category,
          })
        }
      }
    }
    return rows
  }, [foundStudent, studentSubjects, lang])

  const student = foundStudent?.records[0]?.student

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">{t('student_title')}</h1>

      {/* Search */}
      <form onSubmit={handleSearch} className="flex gap-2 max-w-md">
        <div className="relative flex-1">
          <Search size={16} className="absolute top-1/2 -translate-y-1/2 start-3 text-gray-400" />
          <input
            className="input ps-9 w-full"
            placeholder={t('student_search')}
            value={query}
            onChange={e => { setQuery(e.target.value); setSearched(false) }}
          />
        </div>
        <button type="submit" className="btn-primary">{t('search')}</button>
      </form>

      {/* No data state */}
      {allRecords.length === 0 && (
        <div className="card text-center py-12 text-gray-400">{t('no_data')}</div>
      )}

      {/* Not found */}
      {searched && !foundStudent && allRecords.length > 0 && (
        <div className="card text-center py-8 text-gray-500">{t('student_not_found')}</div>
      )}

      {/* Student profile */}
      {foundStudent && student && (
        <div className="space-y-6">
          {/* Info card */}
          <div className="card p-4">
            <h2 className="font-semibold text-lg mb-3">{student.name}</h2>
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div>
                <p className="text-gray-500">{t('student_id')}</p>
                <p className="font-mono font-medium">{student.id}</p>
              </div>
              <div>
                <p className="text-gray-500">{t('student_name')}</p>
                <p className="font-medium">{student.name}</p>
              </div>
              <div>
                <p className="text-gray-500">{t('nationality')}</p>
                <p className="font-medium">
                  {student.nationality === 'citizen' ? t('nat_citizen') :
                   student.nationality === 'expat' ? t('nat_expat') : t('nat_unknown')}
                </p>
              </div>
            </div>
          </div>

          {/* Academic history table */}
          <div className="card overflow-x-auto">
            <h3 className="font-semibold mb-3 p-1">{t('student_history')}</h3>
            <table className="table-base w-full text-sm">
              <thead>
                <tr>
                  <th>{t('year')}</th>
                  <th>{t('grade')}</th>
                  <th>{t('section')}</th>
                  {studentSubjects.map(s => (
                    <th key={s}>{SUBJECT_LABELS[s]?.[lang] ?? s}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {foundStudent.records.map(r => (
                  <tr key={r.yearId}>
                    <td className="font-medium">{r.yearId}</td>
                    <td>{r.grade}</td>
                    <td>{r.section}</td>
                    {studentSubjects.map(s => {
                      const score = r.grades[s]?.annual
                      const passMark = getCycle(r.grade) === 2 ? 50 : 60
                      return (
                        <td key={s} className={score !== null && score !== undefined ? (score >= passMark ? 'text-green-600' : 'text-red-600') : 'text-gray-400'}>
                          {score !== null && score !== undefined ? round2(score) : '—'}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Trend charts */}
          {studentSubjects.length > 0 && (
            <div className="card p-4">
              <h3 className="font-semibold mb-4">{t('student_trend')}</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                {studentSubjects.map(s => {
                  const trendData = getTrendData(s)
                  const validCount = trendData.filter(d => d.score !== null).length
                  if (validCount < 2) return null
                  return (
                    <StudentTrendChart
                      key={s}
                      data={trendData}
                      subject={SUBJECT_LABELS[s]?.[lang] ?? s}
                      lang={lang}
                    />
                  )
                })}
              </div>
            </div>
          )}

          {/* Progress analysis */}
          {progressRows.filter(r => r.prevScore !== null).length > 0 && (
            <div className="card overflow-x-auto">
              <h3 className="font-semibold mb-3 p-1">
                {lang === 'ar' ? 'تحليل التقدم السنوي' : 'Annual Progress Analysis'}
              </h3>
              <table className="table-base w-full text-sm">
                <thead>
                  <tr>
                    <th>{t('year')}</th>
                    <th>{t('subject')}</th>
                    <th>{lang === 'ar' ? 'الدرجة' : 'Score'}</th>
                    <th>{lang === 'ar' ? 'السابقة' : 'Previous'}</th>
                    <th>{t('progress_diff')}</th>
                    <th>{t('progress_category')}</th>
                  </tr>
                </thead>
                <tbody>
                  {progressRows
                    .filter(r => r.prevScore !== null)
                    .map((r, i) => (
                      <tr key={i}>
                        <td>{r.yearId}</td>
                        <td>{r.subjectLabel}</td>
                        <td className="font-medium">{r.score !== null ? round2(r.score) : '—'}</td>
                        <td className="text-gray-500">{r.prevScore !== null ? round2(r.prevScore) : '—'}</td>
                        <td className={r.diff !== null ? (r.diff >= 0 ? 'text-green-600' : 'text-red-600') : ''}>
                          {r.diff !== null ? (r.diff >= 0 ? `+${round2(r.diff)}` : round2(r.diff)) : '—'}
                        </td>
                        <td>
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${categoryColor(r.category)}`}>
                            {categoryLabel(r.category, lang)}
                          </span>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Hint when no search done */}
      {!searched && allRecords.length > 0 && (
        <div className="card text-center py-8 text-gray-400 text-sm">
          {lang === 'ar'
            ? `يوجد ${studentMap.size} طالب في قاعدة البيانات. ابحث برقم الهوية أو جزء من الاسم.`
            : `${studentMap.size} students in database. Search by ID or part of the name.`}
        </div>
      )}
    </div>
  )
}
