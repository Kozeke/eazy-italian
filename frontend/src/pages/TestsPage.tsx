/**
 * Tests Page
 * 
 * Student-facing tests listing page with clean, compact list layout.
 * Optimized for fast scanning and quick actions.
 */

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { 
  Clock, 
  Percent, 
  Play, 
  RotateCcw, 
  FileText,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  BookOpen
} from 'lucide-react';
import { studentTestsApi } from '../services/api';
import toast from 'react-hot-toast';
import SearchFilters from '../components/SearchFilters';

interface Test {
  id: number;
  title: string;
  description?: string;
  time_limit_minutes?: number;
  passing_score?: number;
  unit_id?: number;
  unit?: {
    id: number;
    title?: string;
    level?: string;
  };
  status?: 'not_started' | 'in_progress' | 'completed';
  questions_count?: number;
}

export default function TestsPage() {
  const { t } = useTranslation();
  const [tests, setTests] = useState<Test[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedLevel, setSelectedLevel] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 15; // More items per page for list layout
  const navigate = useNavigate();

  useEffect(() => {
    const loadTests = async () => {
      try {
        setLoading(true);
        const data = await studentTestsApi.getTests();
        const testsData: Test[] = Array.isArray(data) ? data : [];
        setTests(testsData);
      } catch (error) {
        console.error(error);
        toast.error(t('tests.errorLoading') || 'Ошибка при загрузке тестов');
      } finally {
        setLoading(false);
      }
    };

    loadTests();
  }, [t]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, selectedLevel]);

  // Filter tests based on search and level
  const filteredTests = tests.filter((test) => {
    if (searchQuery.trim()) {
      const title = (test.title || '').toLowerCase();
      const desc = (test.description || '').toLowerCase();
      const q = searchQuery.toLowerCase();
      if (!title.includes(q) && !desc.includes(q)) return false;
    }
    if (selectedLevel && test.unit?.level !== selectedLevel) return false;
    return true;
  });

  // Calculate pagination
  const totalPages = Math.ceil(filteredTests.length / pageSize);
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const paginatedTests = filteredTests.slice(startIndex, endIndex);
  const showPagination = filteredTests.length > pageSize;

  const getAction = (test: Test) => {
    if (test.status === 'completed') {
      return (
        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            navigate(`/tests/${test.id}/results`);
          }}
          className="inline-flex items-center px-4 py-2 text-sm font-medium rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors"
        >
          <CheckCircle className="w-4 h-4 mr-1.5" />
          {t('tests.viewResult') || 'Результат'}
        </button>
      );
    }

    if (test.status === 'in_progress') {
      return (
        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            navigate(`/tests/${test.id}`);
          }}
          className="inline-flex items-center px-4 py-2 text-sm font-medium rounded-lg bg-primary-600 text-white hover:bg-primary-700 transition-colors"
        >
          <RotateCcw className="w-4 h-4 mr-1.5" />
          {t('tests.continue') || 'Продолжить'}
        </button>
      );
    }

    return (
      <button
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          navigate(`/tests/${test.id}`);
        }}
        className="inline-flex items-center px-4 py-2 text-sm font-medium rounded-lg bg-primary-600 text-white hover:bg-primary-700 transition-colors"
      >
        <Play className="w-4 h-4 mr-1.5" />
        {t('tests.start') || 'Начать тест'}
      </button>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Compact Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">
            {t('tests.title') || 'Тесты'}
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            {t('tests.subtitle') || 'Проверьте свои знания и закрепите материал'}
          </p>
        </div>
        {tests.length > 0 && (
          <div className="text-sm text-gray-500">
            {filteredTests.length} {t('tests.of') || 'из'} {tests.length}
          </div>
        )}
      </div>

      {/* Search & Filters */}
      <SearchFilters
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        searchPlaceholder={t('tests.searchPlaceholder') || 'Поиск по названию или описанию'}
        showFilters={showFilters}
        onToggleFilters={() => setShowFilters(!showFilters)}
        filters={
          <>
            {/* Level */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('tests.level') || 'Уровень'}
              </label>
              <select
                value={selectedLevel}
                onChange={(e) => setSelectedLevel(e.target.value)}
                className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              >
                <option value="">{t('tests.allLevels') || 'Все уровни'}</option>
                <option value="A1">A1</option>
                <option value="A2">A2</option>
                <option value="B1">B1</option>
                <option value="B2">B2</option>
                <option value="C1">C1</option>
                <option value="C2">C2</option>
              </select>
            </div>
          </>
        }
      />

      {/* Tests List */}
      {filteredTests.length > 0 ? (
        <>
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="divide-y divide-gray-200">
              {paginatedTests.map((test) => (
                <div
                  key={test.id}
                  className="group flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors cursor-pointer"
                  onClick={() => {
                    if (test.status === 'completed') {
                      navigate(`/tests/${test.id}/results`);
                    } else {
                      navigate(`/tests/${test.id}`);
                    }
                  }}
                >
                  {/* Left: Icon + Title */}
                  <div className="flex items-start gap-4 flex-1 min-w-0">
                    <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center">
                      <FileText className="w-5 h-5 text-purple-600" />
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm font-semibold text-gray-900 truncate">
                        {test.title}
                      </h3>
                      
                      {/* Metadata */}
                      <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
                        {test.time_limit_minutes && (
                          <span className="inline-flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5" />
                            {test.time_limit_minutes} {t('tests.minutes') || 'мин'}
                          </span>
                        )}
                        {test.passing_score && (
                          <span className="inline-flex items-center gap-1">
                            <Percent className="w-3.5 h-3.5" />
                            {t('tests.passingScore') || 'Проходной балл'} {test.passing_score}%
                          </span>
                        )}
                        {test.unit?.title && (
                          <span className="inline-flex items-center gap-1">
                            <BookOpen className="w-3.5 h-3.5" />
                            {test.unit.title}
                          </span>
                        )}
                        {test.questions_count && (
                          <span>
                            {test.questions_count} {t('tests.questions') || 'вопросов'}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Right: Action Button */}
                  <div className="flex-shrink-0 ml-4" onClick={(e) => e.stopPropagation()}>
                    {getAction(test)}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Pagination */}
          {showPagination && (
            <div className="flex items-center justify-between px-4 py-4 bg-white rounded-xl border border-gray-200">
              <span className="text-sm text-gray-600">
                {t('tests.showing', {
                  start: filteredTests.length > 0 ? startIndex + 1 : 0,
                  end: Math.min(endIndex, filteredTests.length),
                  total: filteredTests.length
                }) || `Показано ${startIndex + 1}–${Math.min(endIndex, filteredTests.length)} из ${filteredTests.length}`}
              </span>

              <div className="flex items-center space-x-2">
                <button
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage(currentPage - 1)}
                  className="inline-flex items-center px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  {t('common.previous') || 'Назад'}
                </button>

                <div className="flex items-center space-x-1">
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => {
                    // Show first page, last page, current page, and pages around current
                    if (
                      page === 1 ||
                      page === totalPages ||
                      (page >= currentPage - 1 && page <= currentPage + 1)
                    ) {
                      return (
                        <button
                          key={page}
                          onClick={() => setCurrentPage(page)}
                          className={`px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                            currentPage === page
                              ? 'bg-primary-600 text-white'
                              : 'text-gray-700 bg-white border border-gray-300 hover:bg-gray-50'
                          }`}
                        >
                          {page}
                        </button>
                      );
                    } else if (
                      page === currentPage - 2 ||
                      page === currentPage + 2
                    ) {
                      return (
                        <span key={page} className="px-2 text-gray-500">
                          ...
                        </span>
                      );
                    }
                    return null;
                  })}
                </div>

                <button
                  disabled={currentPage >= totalPages}
                  onClick={() => setCurrentPage(currentPage + 1)}
                  className="inline-flex items-center px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {t('common.next') || 'Далее'}
                  <ChevronRight className="h-4 w-4 ml-1" />
                </button>
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="text-center py-12 bg-white rounded-xl border border-dashed border-gray-300">
          <div className="mx-auto h-12 w-12 text-gray-400 mb-3">
            <FileText className="h-12 w-12" />
          </div>
          <h3 className="mt-1 text-sm font-medium text-gray-900">
            {t('tests.emptyTitle') || 'Нет доступных тестов'}
          </h3>
          <p className="mt-1 text-sm text-gray-500">
            {t('tests.emptySubtitle') ||
              'Пока нет доступных тестов. Как только преподаватель их добавит, они появятся здесь.'}
          </p>
        </div>
      )}
    </div>
  );
}
