// LanguageContext.tsx
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { type LangCode, type T, LANGUAGES, getTranslations } from '@/lib/translations'

interface LanguageContextValue {
  lang: LangCode
  setLang: (code: LangCode) => void
  t: T
  dir: 'ltr' | 'rtl'
  langMeta: typeof LANGUAGES[number]
}

const LanguageContext = createContext<LanguageContextValue>({
  lang: 'en',
  setLang: () => {},
  t: getTranslations('en'),
  dir: 'ltr',
  langMeta: LANGUAGES[0],
})

const STORAGE_KEY = 'spps_language'

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<LangCode>(() => {
    try {
      return (localStorage.getItem(STORAGE_KEY) as LangCode) ?? 'en'
    } catch {
      return 'en'
    }
  })

  const langMeta = LANGUAGES.find(l => l.code === lang) ?? LANGUAGES[0]
  const t = getTranslations(lang)
  const dir = langMeta.dir

  const setLang = useCallback((code: LangCode) => {
    setLangState(code)
    try { localStorage.setItem(STORAGE_KEY, code) } catch {}
    // Update document direction
    document.documentElement.dir = LANGUAGES.find(l => l.code === code)?.dir ?? 'ltr'
    document.documentElement.lang = code
  }, [])

  // Apply on mount
  useEffect(() => {
    document.documentElement.dir = dir
    document.documentElement.lang = lang
  }, [])

  return (
    <LanguageContext.Provider value={{ lang, setLang, t, dir, langMeta }}>
      {children}
    </LanguageContext.Provider>
  )
}

export function useLanguage() {
  return useContext(LanguageContext)
}
