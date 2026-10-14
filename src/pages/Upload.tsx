import { useState, useRef } from 'react'
import { Upload as UploadIcon, CheckCircle, AlertCircle, FileSpreadsheet, Download } from 'lucide-react'
import { t } from '@/i18n/translations'
import type { Language } from '@/types'
import { parseAnnualGradeFile, parseNationalityFile, parseStudentRosterFile } from '@/utils/excelParser'
import { parseDiagnosticFile } from '@/utils/diagnosticParser'
import { parseFormativeFile, parseExamFile } from '@/utils/formativeParser'
import { parseTermFile, parseNoorTermFile, isNoorTermFile } from '@/utils/termParser'
import { dataStore } from '@/store/dataStore'
import type { UploadResult } from '@/types'
import { downloadAnnualTemplate, downloadDiagnosticTemplate, downloadNationalityTemplate, downloadFormativeTemplate, downloadExamTemplate, downloadTermTemplate } from '@/utils/templateGenerator'

interface UploadProps {
  lang: Language
}

type UploadMode = 'annual' | 'diagnostic' | 'nationality' | 'formative' | 'exam' | 'term' | 'roster'

interface UploadState {
  status: 'idle' | 'processing' | 'success' | 'error'
  result?: UploadResult | null
  error?: string
}

export default function Upload({ lang }: UploadProps) {
  const [mode, setMode] = useState<UploadMode>('annual')
  const [yearId, setYearId] = useState('')
  const [termSemester, setTermSemester] = useState<1 | 2 | 3>(1)
  const [state, setState] = useState<UploadState>({ status: 'idle' })
  const fileRef = useRef<HTMLInputElement>(null)

  async function handleFile(file: File) {
    if (!yearId.trim() && mode !== 'nationality') {  // nationality doesn't need a year
      setState({ status: 'error', error: t('err_no_year') })
      return
    }

    setState({ status: 'processing' })

    try {
      const buffer = await file.arrayBuffer()

      if (mode === 'annual') {
        const { records, errors } = parseAnnualGradeFile(buffer, yearId.trim())
        if (records.length === 0 && errors.length > 0) {
          setState({ status: 'error', error: errors.join('\n') })
          return
        }
        dataStore.importYearData(yearId.trim(), records)
        const sections = [...new Set(records.map(r => `${r.grade}/${r.section}`))]
        const subjects = [...new Set(records.flatMap(r => Object.keys(r.grades)))]
        setState({
          status: 'success',
          result: {
            yearId: yearId.trim(),
            totalRows: records.length,
            imported: records.length,
            skipped: 0,
            errors,
            subjects: subjects as any,
            sections,
          },
        })
      } else if (mode === 'diagnostic') {
        const scores = parseDiagnosticFile(buffer, yearId.trim())
        dataStore.importDiagnosticScores(yearId.trim(), scores)
        setState({
          status: 'success',
          result: {
            yearId: yearId.trim(),
            totalRows: scores.length,
            imported: scores.length,
            skipped: 0,
            errors: [],
            subjects: [],
            sections: [],
          },
        })
      } else if (mode === 'formative') {
        const scores = parseFormativeFile(buffer, yearId.trim())
        dataStore.importFormativeScores(yearId.trim(), scores)
        const subjects = [...new Set(scores.map(s => s.subjectCode))]
        setState({
          status: 'success',
          result: {
            yearId: yearId.trim(),
            totalRows: scores.length,
            imported: scores.length,
            skipped: 0,
            errors: [],
            subjects: subjects as any,
            sections: [],
          },
        })
      } else if (mode === 'exam') {
        const scores = parseExamFile(buffer, yearId.trim())
        dataStore.importExamScores(yearId.trim(), scores)
        const subjects = [...new Set(scores.map(s => s.subjectCode))]
        setState({
          status: 'success',
          result: {
            yearId: yearId.trim(),
            totalRows: scores.length,
            imported: scores.length,
            skipped: 0,
            errors: [],
            subjects: subjects as any,
            sections: [],
          },
        })
      } else if (mode === 'term') {
        const useNoor = isNoorTermFile(buffer)
        const scores = useNoor
          ? parseNoorTermFile(buffer, yearId.trim())
          : parseTermFile(buffer, yearId.trim(), termSemester)
        const sem = useNoor ? (scores[0]?.semester ?? termSemester) : termSemester
        dataStore.importTermScores(yearId.trim(), sem, scores)
        const subjects = [...new Set(scores.map(s => s.subjectCode))]
        setState({
          status: 'success',
          result: {
            yearId: yearId.trim(),
            totalRows: scores.length,
            imported: scores.length,
            skipped: 0,
            errors: [],
            subjects: subjects as any,
            sections: [],
          },
        })
      } else if (mode === 'roster') {
        const { records, errors } = parseStudentRosterFile(buffer, yearId.trim())
        if (records.length === 0 && errors.length > 0) {
          setState({ status: 'error', error: errors.join('\n') })
          return
        }
        dataStore.importYearData(yearId.trim(), records)
        const sections = [...new Set(records.map(r => `${r.grade}/${r.section}`))]
        setState({
          status: 'success',
          result: {
            yearId: yearId.trim(),
            totalRows: records.length,
            imported: records.length,
            skipped: 0,
            errors,
            subjects: [],
            sections,
          },
        })
      } else {
        const map = parseNationalityFile(buffer)
        // Re-apply to all years
        for (const yr of dataStore.getYears()) {
          const records = dataStore.getRecordsByYear(yr).map(r => ({
            ...r,
            student: {
              ...r.student,
              nationality: map[r.student.id] ?? r.student.nationality,
            },
          }))
          dataStore.importYearData(yr, records)
        }
        setState({
          status: 'success',
          result: {
            yearId: '-',
            totalRows: Object.keys(map).length,
            imported: Object.keys(map).length,
            skipped: 0,
            errors: [],
            subjects: [],
            sections: [],
          },
        })
      }
    } catch (err) {
      setState({ status: 'error', error: String(err) })
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
    e.target.value = ''
  }

  const tabs: { key: UploadMode; label: string }[] = [
    { key: 'roster', label: lang === 'ar' ? 'كشف الطلاب' : 'Student Roster' },
    { key: 'annual', label: t('upload_annual') },
    { key: 'diagnostic', label: t('upload_diagnostic') },
    { key: 'nationality', label: t('upload_nationality') },
    { key: 'formative', label: lang === 'ar' ? 'التقويم التكويني' : 'Formative' },
    { key: 'exam', label: lang === 'ar' ? 'درجات الاختبار' : 'Exam Scores' },
    { key: 'term', label: lang === 'ar' ? 'درجات الفصل' : 'Term Scores' },
  ]

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-xl font-bold">{t('upload_title')}</h1>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => { setMode(tab.key); setState({ status: 'idle' }) }}
            className={`flex-1 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
              mode === tab.key
                ? 'bg-white dark:bg-gray-900 shadow text-gray-900 dark:text-gray-100'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Year input */}
      {mode !== 'nationality' && (  /* nationality is year-independent */
        <div className="flex gap-4 flex-wrap">
          <div>
            <label className="label">{t('upload_year_label')}</label>
            <input
              type="text"
              className="input max-w-xs"
              placeholder={t('upload_year_placeholder')}
              value={yearId}
              onChange={e => setYearId(e.target.value)}
            />
          </div>
          {mode === 'term' && (
            <div>
              <label className="label">{lang === 'ar' ? 'الفصل الدراسي' : 'Semester'}</label>
              <select
                className="input"
                value={termSemester}
                onChange={e => setTermSemester(Number(e.target.value) as 1 | 2 | 3)}
              >
                <option value={1}>{lang === 'ar' ? 'الفصل الأول' : 'Term 1'}</option>
                <option value={2}>{lang === 'ar' ? 'الفصل الثاني' : 'Term 2'}</option>
                <option value={3}>{lang === 'ar' ? 'الفصل الثالث' : 'Term 3'}</option>
              </select>
            </div>
          )}
        </div>
      )}

      {/* Template download */}
      <div className="flex items-center justify-between bg-gray-50 dark:bg-gray-800/50 rounded-lg px-4 py-3">
        <div>
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
            {lang === 'ar' ? 'تنزيل نموذج فارغ' : 'Download Empty Template'}
          </p>
          <p className="text-xs text-gray-400 mt-0.5">
            {lang === 'ar' ? 'قم بتعبئة النموذج ثم ارفعه هنا' : 'Fill in the template then upload it here'}
          </p>
        </div>
        <button
          onClick={() => {
            if (mode === 'annual') downloadAnnualTemplate()
            else if (mode === 'diagnostic') downloadDiagnosticTemplate()
            else if (mode === 'formative') downloadFormativeTemplate()
            else if (mode === 'exam') downloadExamTemplate()
            else if (mode === 'term') downloadTermTemplate(termSemester)
            else downloadNationalityTemplate()
          }}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium transition-colors"
        >
          <Download size={15} />
          {lang === 'ar' ? 'تنزيل' : 'Download'}
        </button>
      </div>

      {/* Drop zone */}
      <div
        onDrop={handleDrop}
        onDragOver={e => e.preventDefault()}
        onClick={() => fileRef.current?.click()}
        className="card border-2 border-dashed border-gray-300 dark:border-gray-600 hover:border-primary-400 cursor-pointer transition-colors py-12 text-center"
      >
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,.xls"
          className="hidden"
          onChange={handleChange}
        />
        {state.status === 'processing' ? (
          <div className="flex flex-col items-center gap-2">
            <div className="w-8 h-8 border-2 border-primary-600 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-gray-500">{t('upload_processing')}</p>
          </div>
        ) : (
          <>
            <FileSpreadsheet size={36} className="mx-auto text-gray-300 mb-3" />
            <p className="text-sm font-medium text-gray-600 dark:text-gray-400">{t('upload_drop')}</p>
            <p className="text-xs text-gray-400 mt-1">{t('upload_formats')}</p>
          </>
        )}
      </div>

      {/* Result */}
      {state.status === 'success' && state.result && (
        <div className="card border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/10">
          <div className="flex items-center gap-2 text-green-700 dark:text-green-400 font-semibold mb-2">
            <CheckCircle size={18} />
            {t('upload_success')}
          </div>
          <ul className="text-sm text-green-800 dark:text-green-300 space-y-0.5">
            <li>{state.result.imported} {t('upload_records')}</li>
            {state.result.subjects.length > 0 && (
              <li>{state.result.subjects.length} {t('upload_subjects')}</li>
            )}
            {state.result.sections.length > 0 && (
              <li>{state.result.sections.length} {t('upload_sections')}</li>
            )}
            {state.result.errors.length > 0 && (
              <li className="text-orange-600">{state.result.errors.length} {lang === 'ar' ? 'تحذيرات' : 'warnings'}</li>
            )}
          </ul>
          {mode === 'roster' && (
            <p className="text-xs text-green-700 dark:text-green-400 mt-2 pt-2 border-t border-green-200">
              {lang === 'ar'
                ? '✅ كشف الطلاب جاهز. يمكنك الآن رفع نتائج الاختبار التشخيصي.'
                : '✅ Roster ready. You can now upload diagnostic test results.'}
            </p>
          )}
        </div>
      )}

      {state.status === 'error' && (
        <div className="card border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/10">
          <div className="flex items-center gap-2 text-red-700 dark:text-red-400 font-semibold mb-1">
            <AlertCircle size={18} />
            {t('upload_error')}
          </div>
          <p className="text-sm text-red-700 dark:text-red-300">{state.error}</p>
        </div>
      )}
    </div>
  )
}
