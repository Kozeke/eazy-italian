/**
 * Units Page — Udemy/Coursera Style (Production Ready)
 * 
 * Features:
 * - Card-row hybrid layout for better scanning
 * - Compact content counters (videos/tasks/tests)
 * - Hover-triggered actions menu
 * - Progress bars on each unit
 * - Skeleton loaders
 * - Mobile-responsive design
 */

import { useState, useEffect } from 'react';

// Icons
const Play = ({ className = "w-6 h-6" }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

const CheckCircle = ({ className = "w-6 h-6" }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

const ChevronLeft = ({ className = "w-6 h-6" }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
  </svg>
);

const ChevronRight = ({ className = "w-6 h-6" }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
  </svg>
);

const MoreVertical = ({ className = "w-6 h-6" }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
  </svg>
);

const Video = ({ className = "w-6 h-6" }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
  </svg>
);

const FileText = ({ className = "w-6 h-6" }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
  </svg>
);

const ClipboardCheck = ({ className = "w-6 h-6" }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
  </svg>
);

const Search = ({ className = "w-6 h-6" }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
  </svg>
);

// Mock data with content counts
const mockUnits = [
  {
    id: 1,
    title: 'Приветствия и знакомство',
    description: 'Научитесь здороваться, представляться и вести базовую беседу',
    level: 'A1',
    progress: 75,
    content: { videos: 4, tasks: 3, tests: 2 },
    thumbnail: 'https://images.unsplash.com/photo-1523050854058-8df90110c9f1?w=400&h=200&fit=crop'
  },
  {
    id: 2,
    title: 'Еда и рестораны',
    description: 'Заказ еды, обсуждение предпочтений, итальянская кухня',
    level: 'A2',
    progress: 30,
    content: { videos: 5, tasks: 6, tests: 3 },
    thumbnail: null
  },
  {
    id: 3,
    title: 'Путешествия и транспорт',
    description: 'Покупка билетов, ориентация в городе, общение с местными',
    level: 'B1',
    progress: 100,
    content: { videos: 6, tasks: 4, tests: 2 }
  },
  {
    id: 4,
    title: 'Работа и профессии',
    description: 'Обсуждение карьеры, поиск работы, деловая переписка',
    level: 'B2',
    progress: 60,
    content: { videos: 7, tasks: 5, tests: 4 }
  },
  {
    id: 5,
    title: 'Культура и искусство',
    description: 'Итальянская история, музеи, живопись и литература',
    level: 'C1',
    progress: 20,
    content: { videos: 8, tasks: 7, tests: 5 }
  }
];

export default function UnitsPage() {
  const [units, setUnits] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedLevel, setSelectedLevel] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 6;

  // Simulate API fetch
  useEffect(() => {
    const fetchUnits = async () => {
      setLoading(true);
      await new Promise(resolve => setTimeout(resolve, 1000));
      setUnits(mockUnits);
      setLoading(false);
    };
    fetchUnits();
  }, []);

  // Reset pagination on filter change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, selectedLevel]);

  // Filter units
  const filteredUnits = units.filter((unit) => {
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      const matchTitle = (unit.title || '').toLowerCase().includes(query);
      const matchDesc = (unit.description || '').toLowerCase().includes(query);
      if (!matchTitle && !matchDesc) return false;
    }
    if (selectedLevel && unit.level !== selectedLevel) return false;
    return true;
  });

  // Pagination
  const totalPages = Math.ceil(filteredUnits.length / pageSize);
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const paginatedUnits = filteredUnits.slice(startIndex, endIndex);

  // Badge helpers
  const getLevelBadge = (level: string) => {
    const colors = {
      A1: 'bg-purple-100 text-purple-700',
      A2: 'bg-blue-100 text-blue-700',
      B1: 'bg-green-100 text-green-700',
      B2: 'bg-yellow-100 text-yellow-700',
      C1: 'bg-orange-100 text-orange-700',
      C2: 'bg-red-100 text-red-700',
    };
    return (
      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${colors[level as keyof typeof colors] || 'bg-gray-100 text-gray-700'}`}>
        {level}
      </span>
    );
  };

  // Skeleton loader
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-7xl mx-auto space-y-6">
          {/* Hero skeleton */}
          <div className="bg-gradient-to-r from-gray-200 to-gray-300 rounded-2xl h-48 animate-pulse" />
          
          {/* Search skeleton */}
          <div className="bg-white rounded-xl border border-gray-200 p-4 animate-pulse">
            <div className="h-10 bg-gray-200 rounded-lg" />
          </div>

          {/* Cards skeleton */}
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="bg-white rounded-xl border border-gray-200 p-5 animate-pulse">
                <div className="flex items-center gap-4">
                  <div className="w-20 h-20 bg-gray-200 rounded-lg flex-shrink-0" />
                  <div className="flex-1 space-y-3">
                    <div className="h-4 bg-gray-200 rounded w-1/3" />
                    <div className="h-3 bg-gray-100 rounded w-2/3" />
                    <div className="h-3 bg-gray-100 rounded w-1/2" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* HERO */}
        <div className="bg-gradient-to-r from-indigo-600 to-indigo-700 text-white rounded-2xl px-8 py-10 shadow-lg">
          <p className="inline-flex items-center px-3 py-1 rounded-full bg-white/15 text-xs font-semibold mb-3 uppercase tracking-wide">
            Мой курс итальянского
          </p>
          <h1 className="text-4xl font-bold leading-tight mb-3">Юниты курса</h1>
          <p className="text-base text-indigo-100 max-w-2xl mb-4">
            Изучайте итальянский шаг за шагом: видео, задания и тесты, как на Udemy или Coursera.
          </p>
          <div className="flex items-center gap-4 text-sm text-indigo-100">
            <span>
              <strong className="font-semibold">{units.length}</strong> юнитов
            </span>
            <span>•</span>
            <span className="flex items-center gap-1">
              <Play className="w-4 h-4" />
              Видео-уроки, практические задания и тесты в одном месте
            </span>
          </div>
        </div>

        {/* SEARCH & FILTERS */}
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Поиск по названию или описанию..."
                className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm"
              />
            </div>
            <select
              value={selectedLevel}
              onChange={(e) => setSelectedLevel(e.target.value)}
              className="sm:w-48 px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm"
            >
              <option value="">Все уровни</option>
              <option value="A1">A1</option>
              <option value="A2">A2</option>
              <option value="B1">B1</option>
              <option value="B2">B2</option>
              <option value="C1">C1</option>
              <option value="C2">C2</option>
            </select>
          </div>
          <p className="mt-3 text-xs text-gray-500">
            Показано <strong>{filteredUnits.length}</strong> из <strong>{units.length}</strong> юнитов
          </p>
        </div>

        {/* UNITS LIST — Card-Row Hybrid */}
        {filteredUnits.length > 0 ? (
          <>
            <div className="space-y-3">
              {paginatedUnits.map((unit) => (
                <div
                  key={unit.id}
                  onClick={() => alert(`Открыть юнит ${unit.id}`)}
                  className="group bg-white rounded-xl border border-gray-200 hover:border-indigo-300 hover:shadow-lg transition-all duration-200 cursor-pointer overflow-hidden"
                >
                  <div className="flex items-center gap-5 p-5">
                    {/* Thumbnail */}
                    <div className="flex-shrink-0 w-20 h-20 bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-lg flex items-center justify-center group-hover:scale-105 transition-transform overflow-hidden">
                      {unit.thumbnail ? (
                        <img
                          src={unit.thumbnail}
                          alt={unit.title}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <Play className="w-10 h-10 text-white" />
                      )}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1.5">
                        <h3 className="text-base font-semibold text-gray-900 truncate">
                          {unit.title}
                        </h3>
                        {getLevelBadge(unit.level)}
                      </div>
                      
                      <p className="text-sm text-gray-600 line-clamp-1 mb-2.5">
                        {unit.description}
                      </p>

                      {/* Content counters — compact, single line */}
                      <div className="flex items-center gap-4 text-xs text-gray-500">
                        <span className="flex items-center gap-1">
                          <Video className="w-3.5 h-3.5" />
                          {unit.content.videos}
                        </span>
                        <span className="flex items-center gap-1">
                          <FileText className="w-3.5 h-3.5" />
                          {unit.content.tasks}
                        </span>
                        <span className="flex items-center gap-1">
                          <ClipboardCheck className="w-3.5 h-3.5" />
                          {unit.content.tests}
                        </span>
                        <span className="text-gray-300">•</span>
                        <span className="flex items-center gap-1 text-emerald-600 font-medium">
                          <CheckCircle className="w-3.5 h-3.5" />
                          {unit.progress}% завершено
                        </span>
                      </div>
                    </div>

                    {/* Actions — appear on hover */}
                    <div className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          alert('Actions menu');
                        }}
                        className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                      >
                        <MoreVertical className="w-5 h-5 text-gray-600" />
                      </button>
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div className="h-1.5 bg-gray-100">
                    <div
                      className="h-full bg-gradient-to-r from-indigo-500 to-indigo-600 transition-all duration-500"
                      style={{ width: `${unit.progress}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>

            {/* PAGINATION */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-4 bg-white rounded-xl border border-gray-200">
                <span className="text-sm text-gray-600">
                  Показано {startIndex + 1}–{Math.min(endIndex, filteredUnits.length)} из {filteredUnits.length}
                </span>

                <div className="flex items-center gap-2">
                  <button
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage(currentPage - 1)}
                    className="p-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </button>

                  <div className="flex gap-1">
                    {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => {
                      if (
                        page === 1 ||
                        page === totalPages ||
                        (page >= currentPage - 1 && page <= currentPage + 1)
                      ) {
                        return (
                          <button
                            key={page}
                            onClick={() => setCurrentPage(page)}
                            className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                              currentPage === page
                                ? 'bg-indigo-600 text-white'
                                : 'text-gray-700 hover:bg-gray-50'
                            }`}
                          >
                            {page}
                          </button>
                        );
                      } else if (page === currentPage - 2 || page === currentPage + 2) {
                        return <span key={page} className="px-2 text-gray-400">...</span>;
                      }
                      return null;
                    })}
                  </div>

                  <button
                    disabled={currentPage >= totalPages}
                    onClick={() => setCurrentPage(currentPage + 1)}
                    className="p-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronRight className="h-5 w-5" />
                  </button>
                </div>
              </div>
            )}
          </>
        ) : (
          // EMPTY STATE
          <div className="text-center py-20 bg-white rounded-2xl border-2 border-dashed border-gray-300">
            <div className="mx-auto w-24 h-24 bg-gradient-to-br from-gray-100 to-gray-200 rounded-full flex items-center justify-center mb-5">
              <Play className="w-12 h-12 text-gray-400" />
            </div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">
              Нет доступных юнитов
            </h3>
            <p className="text-sm text-gray-500 max-w-md mx-auto mb-6">
              {searchQuery 
                ? 'По вашему запросу ничего не найдено. Попробуйте изменить фильтры.'
                : 'Юниты — это строительные блоки курса. Как только преподаватель их добавит, они появятся здесь.'
              }
            </p>
            {searchQuery && (
              <button
                onClick={() => {
                  setSearchQuery('');
                  setSelectedLevel('');
                }}
                className="px-4 py-2 text-sm font-medium text-indigo-600 hover:text-indigo-700 border border-indigo-200 rounded-lg hover:bg-indigo-50 transition-colors"
              >
                Сбросить фильтры
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}