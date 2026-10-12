import { useState } from 'react'
import { Plus, Trash2, Edit2 } from 'lucide-react'
import { t } from '@/i18n/translations'
import type { Language, LearningOutcome, SubjectCode } from '@/types'
import { dataStore } from '@/store/dataStore'
import { SUBJECT_LABELS } from '@/utils/subjectMapping'

interface OutcomesProps {
  lang: Language
}

const EMPTY: Omit<LearningOutcome, 'id'> = {
  subjectCode: 'arabic',
  grade: 9,
  code: '',
  descriptionAr: '',
  descriptionEn: '',
}

export default function Outcomes({ lang }: OutcomesProps) {
  const [outcomes, setOutcomes] = useState(() => dataStore.getLearningOutcomes())
  const [editing, setEditing] = useState<LearningOutcome | null>(null)
  const [form, setForm] = useState(EMPTY)
  const [showForm, setShowForm] = useState(false)

  function refresh() {
    setOutcomes(dataStore.getLearningOutcomes())
  }

  function openAdd() {
    setEditing(null)
    setForm(EMPTY)
    setShowForm(true)
  }

  function openEdit(o: LearningOutcome) {
    setEditing(o)
    setForm({ subjectCode: o.subjectCode, grade: o.grade, code: o.code, descriptionAr: o.descriptionAr, descriptionEn: o.descriptionEn })
    setShowForm(true)
  }

  function save() {
    if (!form.code.trim()) return
    const id = editing?.id ?? `oc_${Date.now()}`
    dataStore.saveLearningOutcome({ id, ...form })
    setShowForm(false)
    refresh()
  }

  function remove(id: string) {
    dataStore.deleteLearningOutcome(id)
    refresh()
  }

  const subjects = Object.entries(SUBJECT_LABELS) as [SubjectCode, { ar: string; en: string }][]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">{t('outcomes_title')}</h1>
        <button className="btn-primary flex items-center gap-2" onClick={openAdd}>
          <Plus size={15} />
          {t('outcomes_add')}
        </button>
      </div>

      {showForm && (
        <div className="card space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">{t('outcomes_subject')}</label>
              <select className="input" value={form.subjectCode} onChange={e => setForm(f => ({ ...f, subjectCode: e.target.value as SubjectCode }))}>
                {subjects.map(([code, labels]) => (
                  <option key={code} value={code}>{lang === 'ar' ? labels.ar : labels.en}</option>
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
            <button className="btn-secondary" onClick={() => setShowForm(false)}>{t('cancel')}</button>
          </div>
        </div>
      )}

      {outcomes.length === 0 ? (
        <div className="card text-center py-12 text-gray-400">{t('outcomes_empty')}</div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th>{t('outcomes_code')}</th>
                <th>{t('outcomes_subject')}</th>
                <th>{t('outcomes_grade')}</th>
                <th>{lang === 'ar' ? t('outcomes_desc_ar') : t('outcomes_desc_en')}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {outcomes.map(o => (
                <tr key={o.id}>
                  <td className="font-mono text-sm">{o.code}</td>
                  <td>{SUBJECT_LABELS[o.subjectCode]?.[lang] ?? o.subjectCode}</td>
                  <td>{o.grade}</td>
                  <td className="max-w-sm text-sm">{lang === 'ar' ? o.descriptionAr : o.descriptionEn}</td>
                  <td>
                    <div className="flex gap-2">
                      <button className="btn-ghost p-1.5" onClick={() => openEdit(o)}><Edit2 size={14} /></button>
                      <button className="btn-ghost p-1.5 text-red-500" onClick={() => remove(o.id)}><Trash2 size={14} /></button>
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
