import * as en from './languages/en.json';
import * as fr from './languages/fr.json';
import type { HomeAssistant, Language } from '../types';

export type Lang = Exclude<Language, 'auto'>;

const languages: Record<Lang, Record<string, unknown>> = { en, fr };

/** Locale used for numbers. */
const LOCALES: Record<Lang, string> = { en: 'en-CA', fr: 'fr-CA' };

/** The card's language: the `language` option, or Home Assistant's when "auto". English unless it is French. */
export function resolveLanguage(option: Language | undefined, hass?: HomeAssistant): Lang {
  if (option && option !== 'auto' && option in languages) return option;
  const base = (hass?.locale?.language ?? hass?.language ?? 'en').toLowerCase().split('-')[0];
  return base === 'fr' ? 'fr' : 'en';
}

export function intlLocale(lang: Lang): string {
  return LOCALES[lang];
}

function lookup(path: string, dictionary: Record<string, unknown>): string | undefined {
  const value = path.split('.').reduce<unknown>((acc, key) => {
    if (acc && typeof acc === 'object' && key in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, dictionary);
  return typeof value === 'string' ? value : undefined;
}

/** Translate `key` (e.g. "card.level"), replacing {placeholders}; falls back to English, then the key. */
export function localize(key: string, lang: Lang, vars: Record<string, string> = {}): string {
  const text = lookup(key, languages[lang]) ?? lookup(key, languages.en) ?? key;
  return text.replace(/\{(\w+)\}/g, (match, name: string) => vars[name] ?? match);
}
