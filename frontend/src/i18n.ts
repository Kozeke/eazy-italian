import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import ruTranslations from './locales/ru.json';
import enTranslations from './locales/en.json';

// Lists locales that are currently available in UI selectors and profile data.
const SUPPORTED_INTERFACE_LANGUAGES = ['ru', 'en', 'it'] as const;

// Narrows unknown locale inputs to the closest supported interface language.
export function normalizeInterfaceLanguage(rawLocale: string | null | undefined): (typeof SUPPORTED_INTERFACE_LANGUAGES)[number] {
  const candidateLocale = (rawLocale ?? '').toLowerCase();
  if (candidateLocale.startsWith('ru')) return 'ru';
  if (candidateLocale.startsWith('it')) return 'it';
  return 'en';
}

const resources = {
  ru: {
    translation: {
      ...ruTranslations,
      // Add missing admin navigation translations
      'admin.nav.dashboard': 'Панель управления',
      'admin.nav.units': 'Уроки',
      'admin.nav.videos': 'Видео',
      'admin.nav.tasks': 'Задания',
      'admin.nav.tests': 'Тесты',
      'admin.nav.questionBank': 'Банк вопросов',
      'admin.nav.students': 'Студенты',
      'admin.nav.emailCampaigns': 'Email кампании',
      'admin.nav.grades': 'Оценки',
      'admin.nav.progress': 'Прогресс',
      'admin.nav.settings': 'Настройки',
      'admin.nav.auditLog': 'Журнал аудита',
      'admin.search.placeholder': 'Поиск по всему...',
      'admin.actions.new': 'Создать',
    }
  },
  en: {
    translation: {
      ...enTranslations,
      // Add missing admin navigation translations
      'admin.nav.dashboard': 'Dashboard',
      'admin.nav.units': 'Units',
      'admin.nav.videos': 'Videos',
      'admin.nav.tasks': 'Tasks',
      'admin.nav.tests': 'Tests',
      'admin.nav.questionBank': 'Question Bank',
      'admin.nav.students': 'Students',
      'admin.nav.emailCampaigns': 'Email Campaigns',
      'admin.nav.grades': 'Grades',
      'admin.nav.progress': 'Progress',
      'admin.nav.settings': 'Settings',
      'admin.nav.auditLog': 'Audit Log',
      'admin.search.placeholder': 'Search everything...',
      'admin.actions.new': 'New',
    }
  },
  it: {
    translation: {
      ...enTranslations,
      // TODO: replace with dedicated Italian translations when locale file is ready.
      'admin.nav.dashboard': 'Dashboard',
      'admin.nav.units': 'Units',
      'admin.nav.videos': 'Videos',
      'admin.nav.tasks': 'Tasks',
      'admin.nav.tests': 'Tests',
      'admin.nav.questionBank': 'Question Bank',
      'admin.nav.students': 'Students',
      'admin.nav.emailCampaigns': 'Email Campaigns',
      'admin.nav.grades': 'Grades',
      'admin.nav.progress': 'Progress',
      'admin.nav.settings': 'Settings',
      'admin.nav.auditLog': 'Audit Log',
      'admin.search.placeholder': 'Search everything...',
      'admin.actions.new': 'New',
    }
  }
};

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'ru',
    supportedLngs: [...SUPPORTED_INTERFACE_LANGUAGES],
    debug: false,
    interpolation: {
      escapeValue: false,
    },
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
    },
  });

export default i18n;
