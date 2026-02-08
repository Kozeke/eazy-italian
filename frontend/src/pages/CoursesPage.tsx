/**
 * Courses Page — Udemy/Coursera Style (Production Ready)
 * 
 * Features:
 * - Card-row hybrid layout for better scanning
 * - Enrollment status badges
 * - Hover-triggered CTA buttons
 * - Price/subscription indicators
 * - Progress tracking for enrolled courses
 * - Skeleton loaders
 * - Mobile-responsive design
 */

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { 
  BookMarked, 
  Play, 
  ChevronLeft, 
  ChevronRight, 
  Lock, 
  Clock, 
  Search 
} from 'lucide-react';
import { coursesApi } from '../services/api';
import toast from 'react-hot-toast';

// Helper function to strip HTML tags from description
const stripHtml = (html: string): string => {
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  return tmp.textContent || tmp.innerText || '';
};

interface Course {
  id: number;
  title: string;
  description?: string;
  level: string;
  status: string;
  publish_at: string | null;
  order_index: number;
  thumbnail_url?: string;
  thumbnail_path?: string;
  units_count: number;
  published_units_count: number;
  created_at: string;
  updated_at: string | null;
  is_enrolled?: boolean;
  user_subscription?: string;
  enrolled_courses_count?: number;
  duration_hours?: number;
  progress?: number; // Optional progress percentage for enrolled courses
}

export default function CoursesPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedLevel, setSelectedLevel] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 6;

  useEffect(() => {
    const fetchCourses = async () => {
      try {
        setLoading(true);
        const params: any = {};
        if (selectedLevel) {
          params.level = selectedLevel;
        }
        const fetchedCourses = await coursesApi.getCourses(params);
        setCourses(fetchedCourses as Course[]);
      } catch (error: any) {
        console.error('Error fetching courses:', error);
        toast.error(t('courses.errorLoading') || 'Ошибка при загрузке курсов');
        setCourses([]);
      } finally {
        setLoading(false);
      }
    };

    fetchCourses();
  }, [selectedLevel, t]);

  // Reset pagination on filter change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, selectedLevel]);

  // Filter courses
  const filteredCourses = courses.filter((course) => {
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      const matchTitle = (course.title || '').toLowerCase().includes(query);
      const matchDesc = stripHtml(course.description || '').toLowerCase().includes(query);
      if (!matchTitle && !matchDesc) return false;
    }
    if (selectedLevel && course.level !== selectedLevel) return false;
    return true;
  });

  // Pagination
  const totalPages = Math.ceil(filteredCourses.length / pageSize);
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const paginatedCourses = filteredCourses.slice(startIndex, endIndex);

  // Badge helpers
  const getLevelBadge = (level: string) => {
    const colors: Record<string, string> = {
      A1: 'bg-purple-100 text-purple-700',
      A2: 'bg-blue-100 text-blue-700',
      B1: 'bg-green-100 text-green-700',
      B2: 'bg-yellow-100 text-yellow-700',
      C1: 'bg-orange-100 text-orange-700',
      C2: 'bg-red-100 text-red-700',
      mixed: 'bg-indigo-100 text-indigo-700'
    };
    return (
      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${colors[level] || colors.A1}`}>
        {level === 'mixed' ? 'A1-B2' : level}
      </span>
    );
  };

  // Get thumbnail URL
  const getThumbnailUrl = (course: Course): string | null => {
    const apiBase = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api/v1';
    
    if (course.thumbnail_url) {
      return course.thumbnail_url;
    } else if (course.thumbnail_path) {
      const thumbnailFilename = course.thumbnail_path.split('/').pop();
      return `${apiBase}/static/thumbnails/${thumbnailFilename}`;
    }
    return null;
  };

  // Handle course card click
  const handleCardClick = (courseId: number) => {
    navigate(`/courses/${courseId}`);
  };

  // Handle button click
  const handleButtonClick = async (e: React.MouseEvent, course: Course) => {
    e.stopPropagation();
    
    const isEnrolled = course.is_enrolled || false;
    const subscription = course.user_subscription || 'free';
    const enrolledCount = course.enrolled_courses_count || 0;
    const isFreeUser = subscription === 'free';
    const showUpgradeButton = isFreeUser && enrolledCount >= 1 && !isEnrolled;

    if (showUpgradeButton) {
      toast.error(t('courses.upgradeRequired') || 'Please upgrade to Premium to enroll in more courses');
      return;
    }
    
    if (isEnrolled) {
      navigate(`/courses/${course.id}`);
    } else {
      // Enroll in course
      try {
        await coursesApi.enrollInCourse(course.id);
        toast.success(t('courses.enrolledSuccess') || `Successfully enrolled in ${course.title}`);
        // Refresh courses to update enrollment status
        const fetchedCourses = await coursesApi.getCourses();
        setCourses(fetchedCourses as Course[]);
      } catch (error: any) {
        console.error('Error enrolling in course:', error);
        const errorMessage = error.response?.data?.detail || t('courses.enrollError') || 'Failed to enroll in course';
        toast.error(errorMessage);
      }
    }
  };

  // Skeleton loader
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-7xl mx-auto space-y-6">
          <div className="bg-gradient-to-r from-gray-200 to-gray-300 rounded-2xl h-48 animate-pulse" />
          <div className="bg-white rounded-xl border border-gray-200 p-4 animate-pulse">
            <div className="h-10 bg-gray-200 rounded-lg" />
          </div>
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="bg-white rounded-xl border border-gray-200 p-5 animate-pulse">
                <div className="flex items-center gap-4">
                  <div className="w-24 h-24 bg-gray-200 rounded-lg flex-shrink-0" />
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
            {t('courses.badge') || 'Итальянские курсы'}
          </p>
          <h1 className="text-4xl font-bold leading-tight mb-3">
            {t('courses.title') || 'Курсы'}
          </h1>
          <p className="text-base text-indigo-100 max-w-2xl mb-4">
            {t('courses.subtitle') ||
              'Изучайте итальянский язык через структурированные курсы с видео-уроками, заданиями и тестами.'}
          </p>
          <div className="flex items-center gap-4 text-sm text-indigo-100">
            <span>
              <strong className="font-semibold">{courses.length}</strong> {t('courses.coursesCount') || 'курсов'}
            </span>
            <span>•</span>
            <span className="flex items-center gap-1">
              <Play className="w-4 h-4" />
              {t('courses.features') || 'Видео-уроки, практические задания и тесты'}
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
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchQuery(e.target.value)}
                placeholder={t('courses.searchPlaceholder') || 'Поиск по названию или описанию...'}
                className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm"
              />
            </div>
            <select
              value={selectedLevel}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setSelectedLevel(e.target.value)}
              className="sm:w-48 px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm"
            >
              <option value="">{t('courses.allLevels') || 'Все уровни'}</option>
              <option value="A1">A1</option>
              <option value="A2">A2</option>
              <option value="B1">B1</option>
              <option value="B2">B2</option>
              <option value="C1">C1</option>
              <option value="C2">C2</option>
              <option value="mixed">{t('courses.mixed') || 'Смешанный'}</option>
            </select>
          </div>
          <p className="mt-3 text-xs text-gray-500">
            {t('courses.showing', {
              start: filteredCourses.length > 0 ? startIndex + 1 : 0,
              end: Math.min(endIndex, filteredCourses.length),
              total: filteredCourses.length
            }) || `Показано ${startIndex + 1}–${Math.min(endIndex, filteredCourses.length)} из ${filteredCourses.length}`}
          </p>
        </div>

        {/* COURSES LIST — Card-Row Hybrid */}
        {filteredCourses.length > 0 ? (
          <>
            <div className="space-y-4">
              {paginatedCourses.map((course) => {
                const thumbnailUrl = getThumbnailUrl(course);
                const isEnrolled = course.is_enrolled || false;
                const subscription = course.user_subscription || 'free';
                const enrolledCount = course.enrolled_courses_count || 0;
                const isFreeUser = subscription === 'free';
                const showUpgradeButton = isFreeUser && enrolledCount >= 1 && !isEnrolled;
                const requiresPremium = false; // Can be set based on course settings if needed

                return (
                  <div
                    key={course.id}
                    onClick={() => handleCardClick(course.id)}
                    className="group bg-white rounded-xl border border-gray-200 hover:border-indigo-300 hover:shadow-lg transition-all duration-200 cursor-pointer overflow-hidden"
                  >
                    <div className="flex flex-col sm:flex-row">
                      {/* Thumbnail */}
                      <div className="sm:w-48 h-32 sm:h-auto bg-gradient-to-br from-indigo-500 to-indigo-600 flex-shrink-0 overflow-hidden relative">
                        {thumbnailUrl ? (
                          <img
                            src={thumbnailUrl}
                            alt={course.title}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                            onError={(e) => {
                              const target = e.target as HTMLImageElement;
                              target.style.display = 'none';
                            }}
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <BookMarked className="w-12 h-12 text-white opacity-50" />
                          </div>
                        )}
                        
                        {/* Badges */}
                        <div className="absolute top-2 left-2 flex gap-1">
                          {isEnrolled && (
                            <span className="px-2 py-0.5 bg-green-500 text-white text-xs font-medium rounded">
                              {t('courses.enrolled') || 'Enrolled'}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Content */}
                      <div className="flex-1 p-5">
                        <div className="flex flex-col h-full">
                          <div className="flex items-start justify-between gap-3 mb-2">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1.5">
                                <h3 className="text-lg font-semibold text-gray-900">
                                  {course.title}
                                </h3>
                                {getLevelBadge(course.level)}
                              </div>
                              <p className="text-sm text-gray-600 line-clamp-2 mb-3">
                                {stripHtml(course.description || '')}
                              </p>
                            </div>
                          </div>

                          {/* Stats */}
                          <div className="flex flex-wrap items-center gap-4 text-xs text-gray-500 mb-3">
                            <span className="flex items-center gap-1">
                              <BookMarked className="w-3.5 h-3.5" />
                              {course.published_units_count || course.units_count} {t('courses.units') || 'юнитов'}
                            </span>
                            {course.duration_hours && (
                              <span className="flex items-center gap-1">
                                <Clock className="w-3.5 h-3.5" />
                                {course.duration_hours} {t('courses.hours') || 'часов'}
                              </span>
                            )}
                          </div>

                          {/* Progress bar for enrolled courses */}
                          {isEnrolled && course.progress !== undefined && (
                            <div className="mb-3">
                              <div className="flex items-center justify-between text-xs text-gray-600 mb-1">
                                <span>{t('courses.yourProgress') || 'Ваш прогресс'}</span>
                                <span className="font-medium">{course.progress}%</span>
                              </div>
                              <div className="w-full bg-gray-200 rounded-full h-2">
                                <div
                                  className="h-2 rounded-full bg-gradient-to-r from-green-500 to-green-600 transition-all"
                                  style={{ width: `${course.progress}%` }}
                                />
                              </div>
                            </div>
                          )}

                          {/* CTA Button */}
                          <div className="mt-auto">
                            <button
                              onClick={(e: React.MouseEvent<HTMLButtonElement>) => handleButtonClick(e, course)}
                              className={`w-full sm:w-auto px-6 py-2.5 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
                                requiresPremium
                                  ? 'bg-amber-500 hover:bg-amber-600 text-white'
                                  : showUpgradeButton
                                  ? 'bg-amber-500 hover:bg-amber-600 text-white'
                                  : isEnrolled
                                  ? 'bg-indigo-600 hover:bg-indigo-700 text-white'
                                  : 'bg-indigo-100 hover:bg-indigo-200 text-indigo-700'
                              }`}
                            >
                              {requiresPremium || showUpgradeButton ? (
                                <>
                                  <Lock className="w-4 h-4" />
                                  {t('courses.upgradeToPremium') || 'Upgrade to Premium'}
                                </>
                              ) : isEnrolled ? (
                                <>
                                  <Play className="w-4 h-4" />
                                  {t('courses.continueLearning') || 'Continue Learning'}
                                </>
                              ) : (
                                <>
                                  {t('courses.enrollNow') || 'Enroll Now'}
                                  <ChevronRight className="w-4 h-4" />
                                </>
                              )}
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* PAGINATION */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-4 bg-white rounded-xl border border-gray-200">
                <span className="text-sm text-gray-600">
                  {t('courses.showing', {
                    start: startIndex + 1,
                    end: Math.min(endIndex, filteredCourses.length),
                    total: filteredCourses.length
                  }) || `Показано ${startIndex + 1}–${Math.min(endIndex, filteredCourses.length)} из ${filteredCourses.length}`}
                </span>

                <div className="flex items-center gap-2">
                  <button
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage(currentPage - 1)}
                    className="p-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
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
                    className="p-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
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
              <BookMarked className="w-12 h-12 text-gray-400" />
            </div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">
              {t('courses.emptyTitle') || 'Нет доступных курсов'}
            </h3>
            <p className="text-sm text-gray-500 max-w-md mx-auto mb-6">
              {searchQuery 
                ? (t('courses.noResults') || 'По вашему запросу ничего не найдено. Попробуйте изменить фильтры.')
                : (t('courses.emptySubtitle') || 'Пока нет опубликованных курсов. Как только преподаватель их добавит, они появятся здесь.')
              }
            </p>
            {searchQuery && (
              <button
                onClick={() => {
                  setSearchQuery('');
                  setSelectedLevel('');
                }}
                className="px-4 py-2 text-sm font-medium text-indigo-600 hover:text-indigo-700 border border-indigo-200 rounded-lg hover:bg-indigo-50"
              >
                {t('courses.resetFilters') || 'Сбросить фильтры'}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
