import { useState } from 'react'
import { t } from '@/i18n/translations'
import type { Language } from '@/types'
import { dataStore } from '@/store/dataStore'

interface SettingsProps {
  lang: Language
  onChangeLang: (lang: Language) => void
}

export default function Settings({ lang, onChangeLang }: SettingsProps) {
  const [confirmClear, setConfirmClear] = useState(false)
  const [schoolName, setSchoolName] = useState(() => localStorage.getItem('school_name') || '')
  const storageKB = dataStore.getStorageSizeKB()

  function handleClear() {
    if (confirmClear) {
      dataStore.clearAll()
      setConfirmClear(false)
      window.location.reload()
    } else {
      setConfirmClear(true)
    }
  }

  return (
    <div className="max-w-lg space-y-6">
      <h1 className="text-xl font-bold">{t('settings_title')}</h1>

      {/* Language */}
      <div className="card space-y-3">
        <h2 className="font-semibold">{t('settings_language')}</h2>
        <div className="flex gap-2">
          {(['ar', 'en'] as Language[]).map(l => (
            <button
              key={l}
              onClick={() => onChangeLang(l)}
              className={`px-4 py-2 rounded-lg border font-medium text-sm transition-colors ${
                lang === l
                  ? 'bg-primary-600 text-white border-primary-600'
                  : 'border-gray-300 text-gray-600 hover:bg-gray-50'
              }`}
            >
              {l === 'ar' ? 'العربية' : 'English'}
            </button>
          ))}
        </div>
      </div>

      {/* School Name */}
      <div className="card space-y-3">
        <h2 className="font-semibold">{t('settings_school_name')}</h2>
        <input
          className="input"
          value={schoolName}
          onChange={e => { setSchoolName(e.target.value); localStorage.setItem('school_name', e.target.value) }}
          placeholder={lang === 'ar' ? 'اسم المدرسة' : 'School name'}
        />
      </div>

      {/* Data Management */}
      <div className="card space-y-3">
        <h2 className="font-semibold">{t('settings_data_management')}</h2>
        <p className="text-sm text-gray-500">
          {t('settings_storage_used')}: {storageKB} KB
        </p>

        {confirmClear ? (
          <div className="space-y-2">
            <p className="text-sm text-red-600">{t('settings_clear_confirm')}</p>
            <div className="flex gap-2">
              <button className="btn-primary bg-red-600 hover:bg-red-700" onClick={handleClear}>
                {lang === 'ar' ? 'نعم، امسح الكل' : 'Yes, clear all'}
              </button>
              <button className="btn-secondary" onClick={() => setConfirmClear(false)}>
                {t('cancel')}
              </button>
            </div>
          </div>
        ) : (
          <button className="btn-secondary text-red-600 border-red-200" onClick={handleClear}>
            {t('settings_clear_data')}
          </button>
        )}
      </div>
    </div>
  )
}
