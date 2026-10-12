import { useState } from 'react'
import { Plus, Trash2, Edit2, ChevronDown, ChevronUp } from 'lucide-react'
import { t } from '@/i18n/translations'
import type { Language, LearningOutcome, SubjectCode, Semester } from '@/types'
import { dataStore } from '@/store/dataStore'
import { SUBJECT_LABELS } from '@/utils/subjectMapping'

interface OutcomesProps {
  lang: Language
}

const MAX_OUTCOMES = 21

type BatchRow = { code: string; descriptionAr: string; descriptionEn: string }

const EMPTY_ROW: BatchRow = { code: '', descriptionAr: '', descriptionEn: '' }

function emptyBatch(count = 5): BatchRow[] {
  return Array.from({ length: count }, () => ({ ...EMPTY_ROW }))
}

export default function Outcomes({ lang }: OutcomesProps) {
  const [outcomes, setOutcomes] = useState(() => dataStore.getLearningOutcomes())
  const [editing, setEditing] = useState<LearningOutcome | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [showBatch, setShowBatch] = useState(false)

  // Single edit form
  const [form, setForm] = useState<Omit<LearningOutcome, 'id'>>({
    subjectCode: 'arabic', grade: 9, code: '', descriptionAr: '', descriptionEn: '',
  })

  // Batch add form
  const [batchSubject, setBatchSubject] = useState<SubjectCode>('arabic')
  const [batchGrade, setBatchGrade] = useState(9)
  const [batchSemester, setBatchSemester] = useState<Semester>(1)
  const [batchRows, setBatchRows] = useState<BatchRow[]>(emptyBatch())
  const [batchError, setBatchError] = useState('')

  const ar = lang === 'ar'
  const subjects = Object.entries(SUBJECT_LABELS) as [SubjectCode, { ar: string; en: string }][]

  function refresh() { setOutcomes(dataStore.getLearningOutcomes()) }

  function openEdit(o: LearningOutcome) {
    setEditing(o)
    setForm({ subjectCode: o.subjectCode, grade: o.grade, code: o.code, descriptionAr: o.descriptionAr, descriptionEn: o.descriptionEn })
    setShowForm(true)
    setShowBatch(false)
  }

  function save() {
    if (!form.code.trim()) return
    const id = editing?.id ?? `oc_${Date.now()}`
    dataStore.saveLearningOutcome({ id, ...form })
    setShowForm(false)
    setEditing(null)
    refresh()
  }

  function remove(id: string) {
    dataStore.deleteLearningOutcome(id)
    refresh()
  }

  // Batch rows helpers
  function setBatchRow(i: number, field: keyof BatchRow, value: string) {
    setBatchRows(rows => rows.map((r, idx) => idx === i ? { ...r, [field]: value } : r))
  }

  function addRow() {
    if (batchRows.length < MAX_OUTCOMES) setBatchRows(r => [...r, { ...EMPTY_ROW }])
  }

  function removeRow(i: number) {
    setBatchRows(r => r.filter((_, idx) => idx !== i))
  }

  function saveBatch() {
    setBatchError('')
    const filled = batchRows.filter(r => r.code.trim() || r.descriptionAr.trim())
    if (filled.length === 0) {
      setBatchError(ar ? 'أدخل مخرجاً واحداً على الأقل' : 'Enter at least one outcome')
      return
    }
    if (filled.length > MAX_OUTCOMES) {
      setBatchError(ar ? `الحد الأقصى ${MAX_OUTCOMES} مخرجاً` : `Max ${MAX_OUTCOMES} outcomes`)
      return
    }
    const semPrefix = `S${batchSemester}`
    filled.forEach((row, i) => {
      const id = `oc_${batchSubject}_${batchGrade}_${semPrefix}_${Date.now()}_${i}`
      dataStore.saveLearningOutcome({
        id,
        subjectCode: batchSubject,
        grade: batchGrade,
        code: row.code.trim() || `${batchSubject.toUpperCase()}-${batchGrade}-${semPrefix}-${i + 1}`,
        descriptionAr: row.descriptionAr.trim(),
        descriptionEn: row.descriptionEn.trim(),
      })
    })
    setShowBatch(false)
    setBatchRows(emptyBatch())
    refresh()
  }

  // Group outcomes by subject+grade for display
  const grouped = outcomes.reduce<Record<string, LearningOutcome[]>>((acc, o) => {
    const key = `${o.subjectCode}-${o.grade}`
    if (!acc[key]) acc[key] = []
    acc[key].push(o)
    return acc
  }, {})

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-xl font-bold">{t('outcomes_title')}</h1>
        <div className="flex gap-2">
          <button
            className="btn-secondary flex items-center gap-2"
            onClick={() => { setEditing(null); setForm({ subjectCode: 'arabic', grade: 9, code: '', descriptionAr: '', descriptionEn: '' }); setShowForm(true); setShowBatch(false) }}
          >
            <Edit2 size={15} />
            {ar ? 'إضافة فردية' : 'Add Single'}
          </button>
          <button
            className="btn-primary flex items-center gap-2"
            onClick={() => { setShowBatch(b => !b); setShowForm(false) }}
          >
            <Plus size={15} />
            {ar ? `إضافة دفعة (حتى ${MAX_OUTCOMES})` : `Batch Add (up to ${MAX_OUTCOMES})`}
          </button>
        </div>
      </div>

      {/* Single edit form */}
      {showForm && (
        <div className="card space-y-3">
          <h2 className="font-semibold text-sm text-gray-700 dark:text-gray-300">
            {editing ? (ar ? 'تعديل مخرج التعلم' : 'Edit Outcome') : (ar ? 'إضافة مخرج تعلم' : 'Add Outcome')}
          </h2>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">{t('outcomes_subject')}</label>
              <select className="input" value={form.subjectCode} onChange={e => setForm(f => ({ ...f, subjectCode: e.target.value as SubjectCode }))}>
                {subjects.map(([code, labels]) => (
                  <option key={code} value={code}>{ar ? labels.ar : labels.en}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">{t('outcomes_grade')}</label>
              <select className="input" value={form.grade} onChange={e => setForm(f => ({ ...f, grade: +e.target.value }))}>
                {[5,6,7,8,9,10,11,12].map(g => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="label">{t('outcomes_code')}</label>
            <input className="input" value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value }))} placeholder="e.g. ARA-9-1.1" />
          </div>
          <div>
            <label className="label">{t('outcomes_desc_ar')}</label>
            <textarea className="input" rows={2} value={form.descriptionAr} onChange={e => setForm(f => ({ ...f, descriptionAr: e.target.value }))} />
          </div>
          <div>
            <label className="label">{t('outcomes_desc_en')}</label>
            <textarea className="input" rows={2} dir="ltr" value={form.descriptionEn} onChange={e => setForm(f => ({ ...f, descriptionEn: e.target.value }))} />
          </div>
          <div className="flex gap-2">
            <button className="btn-primary" onClick={save}>{t('save')}</button>
            <button className="btn-secondary" onClick={() => { setShowForm(false); setEditing(null) }}>{t('cancel')}</button>
          </div>
        </div>
      )}

      {/* Batch add form */}
      {showBatch && (
        <div className="card space-y-4">
          <h2 className="font-semibold text-sm text-gray-700 dark:text-gray-300">
            {ar ? `إضافة مخرجات التعلم دفعة واحدة (حتى ${MAX_OUTCOMES} مخرجاً)` : `Batch Add Learning Outcomes (up to ${MAX_OUTCOMES})`}
          </h2>

          {/* Batch metadata */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="label">{t('outcomes_subject')}</label>
              <select className="input" value={batchSubject} onChange={e => setBatchSubject(e.target.value as SubjectCode)}>
                {subjects.map(([code, labels]) => (
                  <option key={code} value={code}>{ar ? labels.ar : labels.en}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">{t('outcomes_grade')}</label>
              <select className="input" value={batchGrade} onChange={e => setBatchGrade(+e.target.value)}>
                {[5,6,7,8,9,10,11,12].map(g => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>
            <div>
              <label className="label">{ar ? 'الفصل الدراسي' : 'Semester'}</label>
              <select className="input" value={batchSemester} onChange={e => setBatchSemester(+e.target.value as Semester)}>
                <option value={1}>{t('sem_1')}</option>
                <option value={2}>{t('sem_2')}</option>
                <option value={3}>{t('sem_3')}</option>
              </select>
            </div>
          </div>

          {/* Rows */}
          <div className="space-y-2">
            <div className="grid grid-cols-[2fr_3fr_3fr_auto] gap-2 text-xs font-medium text-gray-500 px-1">
              <span>{ar ? 'الرمز' : 'Code'}</span>
              <span>{ar ? 'الوصف بالعربية' : 'Arabic Description'}</span>
              <span>{ar ? 'الوصف بالإنجليزية' : 'English Description'}</span>
              <span />
            </div>
            {batchRows.map((row, i) => (
              <div key={i} className="grid grid-cols-[2fr_3fr_3fr_auto] gap-2 items-start">
                <input
                  className="input text-sm py-1.5"
                  value={row.code}
                  onChange={e => setBatchRow(i, 'code', e.target.value)}
                  placeholder={`${batchSubject.toUpperCase()}-${batchGrade}-S${batchSemester}-${i+1}`}
                />
                <input
                  className="input text-sm py-1.5"
                  value={row.descriptionAr}
                  onChange={e => setBatchRow(i, 'descriptionAr', e.target.value)}
                  dir="rtl"
                  placeholder={ar ? 'الوصف بالعربية' : 'Arabic'}
                />
                <input
                  className="input text-sm py-1.5"
                  value={row.descriptionEn}
                  onChange={e => setBatchRow(i, 'descriptionEn', e.target.value)}
                  dir="ltr"
                  placeholder="English description"
                />
                <button className="btn-ghost p-1.5 text-red-400 mt-0.5" onClick={() => removeRow(i)}>
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>

          {batchRows.length < MAX_OUTCOMES && (
            <button className="btn-secondary flex items-center gap-1 text-sm" onClick={addRow}>
              <Plus size={14} />
              {ar ? 'إضافة سطر' : 'Add Row'}
              <span className="text-xs text-gray-400">({batchRows.length}/{MAX_OUTCOMES})</span>
            </button>
          )}

          {batchError && <p className="text-sm text-red-500">{batchError}</p>}

          <div className="flex gap-2">
            <button className="btn-primary" onClick={saveBatch}>
              {ar ? 'حفظ الدفعة' : 'Save Batch'}
            </button>
            <button className="btn-secondary" onClick={() => { setShowBatch(false); setBatchRows(emptyBatch()); setBatchError('') }}>
              {t('cancel')}
            </button>
          </div>
        </div>
      )}

      {/* Outcomes list */}
      {outcomes.length === 0 ? (
        <div className="card text-center py-12 text-gray-400">{t('outcomes_empty')}</div>
      ) : (
        <div className="space-y-4">
          {Object.entries(grouped).sort().map(([key, items]) => {
            const [subjectCode, gradeStr] = key.split('-')
            const subLabel = SUBJECT_LABELS[subjectCode as SubjectCode]
            return (
              <OutcomeGroup
                key={key}
                title={`${ar ? subLabel?.ar : subLabel?.en} — ${ar ? 'الصف' : 'Grade'} ${gradeStr}`}
                items={items}
                lang={lang}
                onEdit={openEdit}
                onRemove={remove}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}

function OutcomeGroup({ title, items, lang, onEdit, onRemove }: {
  title: string
  items: LearningOutcome[]
  lang: Language
  onEdit: (o: LearningOutcome) => void
  onRemove: (id: string) => void
}) {
  const [open, setOpen] = useState(true)
  const ar = lang === 'ar'

  return (
    <div className="card overflow-hidden">
      <button
        className="w-full flex items-center justify-between p-3 text-sm font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50"
        onClick={() => setOpen(o => !o)}
      >
        <span>{title} <span className="font-normal text-gray-400 ml-2">({items.length})</span></span>
        {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>
      {open && (
        <div className="overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th>{t('outcomes_code')}</th>
                <th>{ar ? t('outcomes_desc_ar') : t('outcomes_desc_en')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {items.map(o => (
                <tr key={o.id}>
                  <td className="font-mono text-sm">{o.code}</td>
                  <td className="max-w-sm text-sm">{ar ? o.descriptionAr : o.descriptionEn}</td>
                  <td>
                    <div className="flex gap-2">
                      <button className="btn-ghost p-1.5" onClick={() => onEdit(o)}><Edit2 size={14} /></button>
                      <button className="btn-ghost p-1.5 text-red-500" onClick={() => onRemove(o.id)}><Trash2 size={14} /></button>
                    </div>
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
