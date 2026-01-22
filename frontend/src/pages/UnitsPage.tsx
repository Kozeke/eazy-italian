/**
 * Units Page
 * 
 * Udemy/Coursera-style units listing page with hero banner, search functionality,
 * and course-like cards. Displays all available learning units with filtering.
 */

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Play, Clock, CheckCircle, Search } from 'lucide-react';
import { unitsApi, testsApi  } from '../services/api';
import toast from 'react-hot-toast';

export default function UnitsPage() {
  const { t } = useTranslation();
  // List of all units fetched from API
  const [units, setUnits] = useState<any[]>([]);
  // Loading state for initial data fetch
  const [loading, setLoading] = useState(true);
  // Search term for filtering units by title or description
  const [searchTerm, setSearchTerm] = useState('');
  const [unitProgress, setUnitProgress] = useState<Record<number, number>>({});

  // Fetch units from API on component mount
  useEffect(() => {
    const fetchUnits = async () => {
      try {
        setLoading(true);
        const response = await unitsApi.getUnits();
        // Backend возвращает массив, не пагинированный ответ
        setUnits(Array.isArray(response) ? response : []);
      } catch (error: any) {
        console.error('Error fetching units:', error);
        toast.error('Ошибка при загрузке юнитов');
      } finally {
        setLoading(false);
      }
    };

    fetchUnits();
  }, []);
  useEffect(() => {
    if (!units.length) return;
  
    const calculateProgress = async () => {
      const progressMap: Record<number, number> = {};
  
      for (const unit of units) {
        try {
          // 1. Load tests for unit
          const testsData = await testsApi.getTests({ unit_id: unit.id });
          const tests = testsData?.items || testsData || [];
  
          if (!tests.length) {
            progressMap[unit.id] = 0;
            continue;
          }
  
          // 2. Load attempts for each test
          let passed = 0;
  
          const attempts = await Promise.all(
            tests.map((test: any) =>
              testsApi.getTestAttempts(test.id)
            )
          );
  
          attempts.forEach((res) => {
            if (res.attempts?.some((a: any) => a.passed === true)) {
              passed++;
            }
          });
  
          // 3. Calculate %
          progressMap[unit.id] = Math.round(
            (passed / tests.length) * 100
          );
        } catch (err) {
          console.error('Progress error for unit', unit.id, err);
          progressMap[unit.id] = 0;
        }
      }
  
      setUnitProgress(progressMap);
    };
  
    calculateProgress();
  }, [units]);
  
  
  // Get badge styling for language level (A1-C2)
  const getLevelBadge = (level: string) => {
    // Color mapping for different CEFR levels
    const levelColors = {
      A1: 'bg-purple-100 text-purple-800',
      A2: 'bg-blue-100 text-blue-800',
      B1: 'bg-green-100 text-green-800',
      B2: 'bg-yellow-100 text-yellow-800',
      C1: 'bg-orange-100 text-orange-800',
      C2: 'bg-red-100 text-red-800',
    };

    return (
      <span
        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
          levelColors[level as keyof typeof levelColors] || 'bg-gray-100 text-gray-800'
        }`}
      >
        {level}
      </span>
    );
  };

  // Filter units based on search term (title or description)
  const filteredUnits = units.filter((unit) => {
    if (!searchTerm.trim()) return true;
    const title = (unit.title || '').toLowerCase();
    const desc = (unit.description || '').toLowerCase();
    const q = searchTerm.toLowerCase();
    return title.includes(q) || desc.includes(q);
  });

  // Loading state UI
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* HERO - Udemy/Coursera style */}
      <div className="bg-gradient-to-r from-primary-600 to-primary-700 text-white rounded-2xl px-6 py-6 md:px-8 md:py-7 shadow-lg flex flex-col md:flex-row md:items-center md:justify-between gap-5">
        <div>
          <p className="inline-flex items-center px-3 py-1 rounded-full bg-white/15 text-xs font-semibold mb-2 uppercase tracking-wide">
            {t('units.badge') || 'Мой курс итальянского'}
          </p>
          <h1 className="text-2xl md:text-3xl font-bold leading-tight">
            {t('units.title') || 'Юниты курса'}
          </h1>
          <p className="mt-2 text-sm md:text-base text-primary-100 max-w-xl">
            {t('units.subtitle') ||
              'Изучайте итальянский шаг за шагом: видео, задания и тесты, как на Udemy или Coursera.'}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-primary-100">
            <span>
              <strong className="font-semibold">{units.length}</strong> юнитов
            </span>
            <span className="hidden sm:inline">•</span>
            <span className="flex items-center gap-1">
              <Play className="w-3 h-3" />
              Видео-уроки, практические задания и тесты в одном месте
            </span>
          </div>
        </div>

        {/* Поиск по юнитам */}
        <div className="w-full md:max-w-xs">
          <label className="block text-xs font-medium text-primary-100 mb-1">
            {t('units.searchLabel') || 'Поиск по юнитам'}
          </label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-primary-200" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={t('units.searchPlaceholder') || 'Найти юнит по названию или описанию'}
              className="w-full rounded-lg border border-primary-300/50 bg-white/90 px-9 py-2 text-sm text-gray-900 placeholder:text-gray-400 shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-primary-400"
            />
          </div>
          <p className="mt-1 text-[11px] text-primary-100">
            {t('units.searchHint') || 'Например: «Приветствия», «Семья», «Числа»'}
          </p>
        </div>
      </div>

      {/* Заголовок списка */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">
            {t('units.listTitle') || 'Все юниты курса'}
          </h2>
          <p className="mt-1 text-xs text-gray-500">
            {filteredUnits.length} из {units.length}{' '}
            {t('units.filteredLabel') || 'юнитов по вашему запросу'}
          </p>
        </div>
      </div>

      {/* Сетка юнитов в стиле карточек курса */}
      {filteredUnits.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {filteredUnits.map((unit) => {
            // Count of videos in this unit
            const videosCount = unit.content_count?.videos || 0;
            // Estimated minutes based on video count (10 min per video)
            const estimatedMinutes = Math.max(1, videosCount) * 10;

            return (
              <Link
                key={unit.id}
                to={`/units/${unit.id}`}
                className="group bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md hover:border-primary-200 transition-all duration-200 flex flex-col"
              >
                {/* «Картинка» курса */}
                <div className="h-32 bg-gradient-to-r from-primary-600 to-primary-500 flex items-center justify-center">
                  <div className="w-12 h-12 rounded-full border border-white/30 bg-white/10 flex items-center justify-center group-hover:bg-white/20 transition-colors">
                    <Play className="w-6 h-6 text-white" />
                  </div>
                </div>

                {/* Контент карточки */}
                <div className="p-4 flex-1 flex flex-col">
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <h3 className="text-sm md:text-base font-semibold text-gray-900 line-clamp-2">
                      {unit.title}
                    </h3>
                    {unit.level && getLevelBadge(unit.level)}
                  </div>

                  {unit.description && (
                    <p className="text-xs md:text-sm text-gray-600 line-clamp-2 mb-3">
                      {unit.description}
                    </p>
                  )}

                  <div className="mt-auto flex items-center justify-between text-[11px] md:text-xs text-gray-500">
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-1">
                        <Play className="w-4 h-4 text-primary-500" />
                        <span>{videosCount} видео</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Clock className="w-4 h-4 text-primary-500" />
                        <span>~{estimatedMinutes} мин</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <CheckCircle className="w-4 h-4 text-emerald-500" />
                      <span>{unitProgress[unit.id] ?? 0}% завершено</span>
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      ) : (
        <div className="text-center py-12 bg-white rounded-2xl border border-dashed border-gray-300">
          <div className="mx-auto h-12 w-12 text-gray-400 mb-3">
            <Play className="h-12 w-12" />
          </div>
          <h3 className="mt-1 text-sm font-medium text-gray-900">
            {t('units.emptyTitle') || 'Нет доступных юнитов'}
          </h3>
          <p className="mt-1 text-sm text-gray-500">
            {t('units.emptySubtitle') ||
              'Пока нет опубликованных учебных юнитов. Как только преподаватель их добавит, они появятся здесь.'}
          </p>
        </div>
      )}
    </div>
  );
}
