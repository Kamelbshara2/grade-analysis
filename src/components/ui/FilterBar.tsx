import { t } from '@/i18n/translations'
import type { AnalysisFilter, Language } from '@/types'
import { dataStore } from '@/store/dataStore'
import { SUBJECT_LABELS } from '@/utils/subjectMapping'
import type { SubjectCode, Semester } from '@/types'

interface FilterBarProps {
  filter: AnalysisFilter
  onChange: (f: AnalysisFilter) => void
  lang: Language
  showSubject?: boolean
  showSemester?: boolean
  showNationality?: boolean
  showTrack?: boolean  // kept for backward compat; track is always shown when grade is selected
  showStudentGroup?: boolean
}

const SEMESTERS: { value: Semester | 'annual'; labelKey: 'sem_1' | 'sem_2' | 'sem_3' | 'sem_annual' }[] = [
  { value: 1, labelKey: 'sem_1' },
  { value: 2, labelKey: 'sem_2' },
  { value: 3, labelKey: 'sem_3' },
  { value: 'annual', labelKey: 'sem_annual' },
]

export default function FilterBar({
  filter, onChange, lang,
  showSubject = true, showSemester = true,
  showNationality = false, showTrack = false,
  showStudentGroup = false,
}: FilterBarProps) {
  const years = dataStore.getYears()
  const grades = filter.yearId ? dataStore.getUniqueGrades(filter.yearId) : dataStore.getUniqueGrades()
  const sections = filter.yearId
    ? dataStore.getUniqueSections(filter.yearId, filter.grade, filter.track)
    : dataStore.getUniqueSections(undefined, filter.grade, filter.track)

  const subjects = Object.entries(SUBJECT_LABELS) as [SubjectCode, { ar: string; en: string }][]

  function set(partial: Partial<AnalysisFilter>) {
    onChange({ ...filter, ...partial })
  }

  return (
    <div className="card flex flex-wrap gap-3 items-end">
      {/* Year */}
      <div className="min-w-[140px]">
        <label className="label">{t('year')}</label>
        <select className="input" value={filter.yearId || ''} onChange={e => set({ yearId: e.target.value || undefined, grade: undefined, section: undefined })}>
          <option value="">{t('all')}</option>
          {years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>

      {/* Grade */}
      <div className="min-w-[110px]">
        <label className="label">{t('grade')}</label>
        <select className="input" value={filter.grade ?? ''} onChange={e => set({ grade: e.target.value ? +e.target.value : undefined, track: undefined, section: undefined })}>
          <option value="">{t('all')}</option>
          {grades.map(g => <option key={g} value={g}>{g}</option>)}
        </select>
      </div>

      {/* Track — always shown; resets section when changed */}
      <div className="min-w-[130px]">
        <label className="label">{t('track')}</label>
        <select className="input" value={filter.track || ''} onChange={e => set({ track: e.target.value as 'general' | 'advanced' | undefined || undefined, section: undefined })}>
          <option value="">{t('all')}</option>
          <option value="general">{t('track_general')}</option>
          <option value="advanced">{t('track_advanced')}</option>
        </select>
      </div>

      {/* Section — filtered by grade + track */}
      <div className="min-w-[100px]">
        <label className="label">{t('section')}</label>
        <select className="input" value={filter.section || ''} onChange={e => set({ section: e.target.value || undefined })}>
          <option value="">{t('all')}</option>
          {sections.map(s => <option key={s} value={s}>{lang === 'ar' ? `شعبة ${s}` : `Sec ${s}`}</option>)}
        </select>
      </div>

      {/* Subject */}
      {showSubject && (
        <div className="min-w-[160px]">
          <label className="label">{t('subject')}</label>
          <select className="input" value={filter.subjectCode || ''} onChange={e => set({ subjectCode: (e.target.value as SubjectCode) || undefined })}>
            <option value="">{t('all')}</option>
            {subjects.map(([code, labels]) => (
              <option key={code} value={code}>{lang === 'ar' ? labels.ar : labels.en}</option>
            ))}
          </select>
        </div>
      )}

      {/* Semester */}
      {showSemester && (
        <div className="min-w-[130px]">
          <label className="label">{t('semester')}</label>
          <select className="input" value={filter.semester ?? ''} onChange={e => set({ semester: e.target.value as Semester | 'annual' | undefined || undefined })}>
            <option value="">{t('all')}</option>
            {SEMESTERS.map(s => <option key={s.value} value={s.value}>{t(s.labelKey)}</option>)}
          </select>
        </div>
      )}

      {/* Nationality */}
      {showNationality && (
        <div className="min-w-[120px]">
          <label className="label">{t('nationality')}</label>
          <select className="input" value={filter.nationality || ''} onChange={e => set({ nationality: e.target.value as 'citizen' | 'expat' | undefined || undefined })}>
            <option value="">{t('all')}</option>
            <option value="citizen">{t('nat_citizen')}</option>
            <option value="expat">{t('nat_expat')}</option>
          </select>
        </div>
      )}

      {/* Student Group */}
      {showStudentGroup && (
        <div className="min-w-[160px]">
          <label className="label">{lang === 'ar' ? 'مجموعة الطلاب' : 'Student Group'}</label>
          <select className="input" value={filter.studentGroup || ''} onChange={e => set({ studentGroup: (e.target.value as 'returning' | 'new_transfer') || undefined })}>
            <option value="">{lang === 'ar' ? 'جميع الطلاب' : 'All students'}</option>
            <option value="returning">{lang === 'ar' ? 'طلاب خالد بن الوليد' : 'Returning students'}</option>
            <option value="new_transfer">{lang === 'ar' ? 'طلاب منقولون حديثاً' : 'New transfers'}</option>
          </select>
        </div>
      )}

      {/* Clear */}
      <button
        className="btn-secondary self-end"
        onClick={() => onChange({})}
      >
        {t('clear_filters')}
      </button>
    </div>
  )
}
