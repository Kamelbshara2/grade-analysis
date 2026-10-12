import { useState, useMemo, useRef } from 'react'
import { Upload as UploadIcon } from 'lucide-react'
import * as XLSX from 'xlsx'
import { t } from '@/i18n/translations'
import type { Language, OutcomeScore } from '@/types'
import { dataStore } from '@/store/dataStore'
import { computeGapAnalysis } from '@/utils/statistics'
import clsx from 'clsx'

interface GapAnalysisProps {
  lang: Language
}

const PRIORITY_BADGE: Record<string, string> = {
  critical: 'badge-critical',
  high: 'badge-high',
  medium: 'badge-medium',
  low: 'badge-low',
}

const PRIORITY_LABEL: Record<string, 'gap_critical' | 'gap_high' | 'gap_medium' | 'gap_low'> = {
  critical: 'gap_critical',
  high: 'gap_high',
  medium: 'gap_medium',
  low: 'gap_low',
}

export default function GapAnalysis({ lang }: GapAnalysisProps) {
  const [yearId, setYearId] = useState('')
  const [importStatus, setImportStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const [importMsg, setImportMsg] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const years = dataStore.getYears()

  const outcomeScores = useMemo(() => {
    const all = dataStore.getOutcomeScores()
    return yearId ? all.filter(s => s.yearId === yearId) : all
  }, [yearId, importStatus])

  const outcomes = dataStore.getLearningOutcomes()

  // Build extended outcome scores with descriptions from outcomes catalog
  const extendedScores = useMemo(() => {
    return outcomeScores.map(os => {
      const o = outcomes.find(x => x.id === os.outcomeId)
      return {
        studentId: os.studentId,
        outcomeId: os.outcomeId,
        outcomeCode: o?.code ?? os.outcomeId,
        descriptionAr: o?.descriptionAr ?? '',
        descriptionEn: o?.descriptionEn ?? '',
        score: os.score,
        maxScore: os.maxScore,
      }
    })
  }, [outcomeScores, outcomes])

  const gapResults = useMemo(() => computeGapAnalysis(extendedScores), [extendedScores])

  async function handleImport(file: File) {
    try {
      const buffer = await file.arrayBuffer()
      const wb = XLSX.read(buffer, { type: 'array' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: null })

      const scores: OutcomeScore[] = []
      for (const row of rows) {
        const keys = Object.keys(row)
        // Expected columns: student_id, year_id, semester, subject_code, outcome_id, score, max_score
        const studentId = String(row.student_id ?? row['رقم الطالب'] ?? '').trim()
        const rowYearId = String(row.year_id ?? row['العام'] ?? yearId).trim()
        const semRaw = row.semester ?? row['الفصل']
        const sem = typeof semRaw === 'number' ? semRaw : parseInt(String(semRaw))
        const subjectCode = String(row.subject_code ?? row['المادة'] ?? '').trim()
        const outcomeId = String(row.outcome_id ?? row['رمز المخرج'] ?? '').trim()
        const score = parseFloat(String(row.score ?? row['الدرجة'] ?? ''))
        const maxScore = parseFloat(String(row.max_score ?? row['الدرجة الكبرى'] ?? '10'))

        if (!studentId || !outcomeId || isNaN(score)) continue

        scores.push({
          studentId,
          yearId: rowYearId || yearId,
          semester: (sem === 1 || sem === 2 || sem === 3) ? sem : 1,
          subjectCode: subjectCode as any,
          outcomeId,
          score,
          maxScore: isNaN(maxScore) ? 10 : maxScore,
        })
      }

      dataStore.importOutcomeScores(scores)
      setImportStatus('success')
      setImportMsg(`${scores.length} ${lang === 'ar' ? 'سجل مستورد' : 'records imported'}`)
    } catch (err) {
      setImportStatus('error')
      setImportMsg(String(err))
    }
  }

  if (years.length === 0) {
    return <div className="card text-center py-12 text-gray-500">{t('no_data')}</div>
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">{t('gap_title')}</h1>

      <div className="card flex flex-wrap gap-4 items-end">
        <div className="min-w-[140px]">
          <label className="label">{t('year')}</label>
          <select className="input" value={yearId} onChange={e => setYearId(e.target.value)}>
            <option value="">{t('all')}</option>
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>

        <div>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleImport(f); e.target.value = '' }}
          />
          <button
            className="btn-secondary flex items-center gap-2"
            onClick={() => fileRef.current?.click()}
          >
            <UploadIcon size={15} />
            {t('gap_import')}
          </button>
          {importStatus !== 'idle' && (
            <p className={clsx('text-xs mt-1', importStatus === 'success' ? 'text-green-600' : 'text-red-500')}>
              {importMsg}
            </p>
          )}
        </div>
      </div>

      {gapResults.length === 0 ? (
        <div className="card text-center py-12 text-gray-400">
          {lang === 'ar'
            ? 'لا توجد بيانات مخرجات التعلم. قم برفع ملف الدرجات.'
            : 'No outcome score data. Upload an outcome scores file.'}
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th>#</th>
                <th>{lang === 'ar' ? 'رمز المخرج' : 'Outcome Code'}</th>
                <th>{lang === 'ar' ? 'الوصف' : 'Description'}</th>
                <th>{t('gap_mastery')}</th>
                <th>{t('gap_priority')}</th>
              </tr>
            </thead>
            <tbody>
              {gapResults.map((g, i) => (
                <tr key={g.outcomeId}>
                  <td className="text-gray-400 text-xs">{i + 1}</td>
                  <td className="font-mono text-sm">{g.outcomeCode}</td>
                  <td className="max-w-xs">
                    <p className="text-sm">{lang === 'ar' ? g.descriptionAr : g.descriptionEn}</p>
                    {lang === 'ar' && g.descriptionEn && (
                      <p className="text-xs text-gray-400">{g.descriptionEn}</p>
                    )}
                  </td>
                  <td>
                    <div className="flex items-center gap-2">
                      <div className="w-24 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                        <div
                          className={clsx('h-full rounded-full', g.masteryRate < 40 ? 'bg-red-500' : g.masteryRate < 60 ? 'bg-orange-500' : g.masteryRate < 75 ? 'bg-yellow-500' : 'bg-green-500')}
                          style={{ width: `${g.masteryRate}%` }}
                        />
                      </div>
                      <span className="text-sm font-mono">{g.masteryRate.toFixed(1)}%</span>
                    </div>
                  </td>
                  <td>
                    <span className={PRIORITY_BADGE[g.priority]}>
                      {t(PRIORITY_LABEL[g.priority])}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
