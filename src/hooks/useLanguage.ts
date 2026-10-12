import { useState, useCallback } from 'react'
import type { Language } from '@/types'
import { setLanguage, getCurrentLanguage, t, type TranslationKey } from '@/i18n/translations'

export function useLanguage() {
  const [lang, setLang] = useState<Language>(getCurrentLanguage())

  const changeLanguage = useCallback((newLang: Language) => {
    setLanguage(newLang)
    setLang(newLang)
  }, [])

  const translate = useCallback((key: TranslationKey) => t(key), [lang]) // eslint-disable-line react-hooks/exhaustive-deps

  return { lang, changeLanguage, t: translate }
}
