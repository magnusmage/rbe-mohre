import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { LANGUAGES } from '@/data/mock';
import type { Language, LanguageCode } from '@/types';

interface LanguageContextValue {
  language: Language;
  languages: Language[];
  setLanguage: (code: LanguageCode) => void;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [code, setCode] = useState<LanguageCode>('en');

  const value = useMemo<LanguageContextValue>(
    () => ({
      language: LANGUAGES.find((l) => l.code === code) ?? LANGUAGES[0],
      languages: LANGUAGES,
      setLanguage: setCode,
    }),
    [code],
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguage must be used within a LanguageProvider');
  return ctx;
}
