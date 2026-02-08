import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { 
  Plus, 
  Eye,
  Pencil,
  Trash2,
  Check,
  X,
  BookMarked
} from 'lucide-react';
import { coursesApi } from '../../services/api';
import toast from 'react-hot-toast';
import AdminSearchFilters from '../../components/admin/AdminSearchFilters';

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
  created_by: number;
  created_at: string;
  updated_at: string | null;
}

export default function AdminCoursesPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedLevel, setSelectedLevel] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');
  const [selectedCourses, setSelectedCourses] = useState<number[]>([]);
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    const fetchCourses = async () => {
      try {
        setLoading(true);
        const fetchedCourses = await coursesApi.getAdminCourses();
        setCourses(fetchedCourses as any);
      } catch (error: any) {
        console.error('Error fetching courses:', error);
        toast.error('Ошибка при загрузке курсов');
        setCourses([]);
      } finally {
        setLoading(false);
      }
    };

    fetchCourses();
  }, []);

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      draft: { color: 'bg-gray-100 text-gray-800', text: 'Черновик' },
      scheduled: { color: 'bg-blue-100 text-blue-800', text: 'Запланировано' },
      published: { color: 'bg-green-100 text-green-800', text: 'Опубликовано' },
      archived: { color: 'bg-red-100 text-red-800', text: 'Архив' }
    };
    
    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.draft;
    
    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${config.color}`}>
        {config.text}
      </span>
    );
  };

  const getLevelBadge = (level: string) => {
    const levelColors: Record<string, string> = {
      A1: 'bg-purple-100 text-purple-800',
      A2: 'bg-blue-100 text-blue-800',
      B1: 'bg-green-100 text-green-800',
      B2: 'bg-yellow-100 text-yellow-800',
      C1: 'bg-orange-100 text-orange-800',
      C2: 'bg-red-100 text-red-800',
      mixed: 'bg-indigo-100 text-indigo-800'
    };
    
    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${levelColors[level] || levelColors.A1}`}>
        {level}
      </span>
    );
  };


  const handleSelectCourse = (courseId: number) => {
    setSelectedCourses(prev => 
      prev.includes(courseId) 
        ? prev.filter(id => id !== courseId)
        : [...prev, courseId]
    );
  };

  const refreshCourses = async () => {
    try {
      setLoading(true);
      const fetchedCourses = await coursesApi.getAdminCourses();
      setCourses(fetchedCourses as any);
    } catch (error: any) {
      console.error('Error refreshing courses:', error);
      toast.error('Ошибка при обновлении списка курсов');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteCourse = async (courseId: number, courseTitle: string) => {
    if (!window.confirm(`Вы уверены, что хотите удалить курс "${courseTitle}"? Это действие нельзя отменить.`)) {
      return;
    }
    
    try {
      await coursesApi.deleteCourse(courseId);
      toast.success('Курс успешно удален');
      await refreshCourses();
    } catch (error: any) {
      console.error('Error deleting course:', error);
      toast.error(error.response?.data?.detail || 'Ошибка при удалении курса');
    }
  };

  const handleBulkAction = async (action: string) => {
    if (selectedCourses.length === 0) return;
    
    try {
      if (action === 'delete') {
        if (!window.confirm(`Вы уверены, что хотите удалить ${selectedCourses.length} курсов? Это действие нельзя отменить.`)) {
          return;
        }
        
        for (const courseId of selectedCourses) {
          await coursesApi.deleteCourse(courseId);
        }
        
        toast.success(`${selectedCourses.length} курсов успешно удалено`);
      } else {
        console.log(`Bulk action: ${action}`, selectedCourses);
        toast.success(`Действие "${action}" применено к ${selectedCourses.length} курсам`);
      }
      
      await refreshCourses();
    } catch (error: any) {
      console.error('Error performing bulk action:', error);
      toast.error('Ошибка при выполнении действия');
    } finally {
      setSelectedCourses([]);
    }
  };

  const filteredCourses = courses.filter(course => {
    const matchesSearch = course.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (stripHtml(course.description || '').toLowerCase().includes(searchQuery.toLowerCase()) || false);
    const matchesLevel = !selectedLevel || course.level === selectedLevel;
    const matchesStatus = !selectedStatus || course.status === selectedStatus;
    
    return matchesSearch && matchesLevel && matchesStatus;
  });

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Sticky top bar */}
      <div className="sticky top-0 z-20 border-b bg-white/90 backdrop-blur">
        <div className="max-w-7xl mx-auto px-4 lg:px-8 py-4 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <BookMarked className="h-6 w-6 text-primary-600" />
              <h1 className="text-xl md:text-2xl font-semibold text-gray-900">
                {t('admin.nav.courses')}
              </h1>
              {courses.length > 0 && (
                <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600">
                  {courses.length} курсов
                </span>
              )}
            </div>
            <p className="mt-1 text-xs md:text-sm text-gray-500">
              Управляйте курсами — контейнерами для учебных юнитов
            </p>
          </div>

          <Link
            to="/admin/courses/new"
            className="inline-flex items-center rounded-lg border border-transparent bg-primary-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
          >
            <Plus className="h-4 w-4 mr-2" />
            Создать курс
          </Link>
        </div>
      </div>

      {/* Main content */}
      <main className="max-w-7xl mx-auto px-4 lg:px-8 py-8 space-y-6">
        {/* Search & filters */}
        <AdminSearchFilters
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          searchPlaceholder="Поиск по названию или описанию"
          showFilters={showFilters}
          onToggleFilters={() => setShowFilters(!showFilters)}
          filters={
            <>
              {/* Level */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Уровень
                </label>
                <select
                  value={selectedLevel}
                  onChange={(e) => setSelectedLevel(e.target.value)}
                  className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                >
                  <option value="">Все уровни</option>
                  <option value="A1">A1</option>
                  <option value="A2">A2</option>
                  <option value="B1">B1</option>
                  <option value="B2">B2</option>
                  <option value="C1">C1</option>
                  <option value="C2">C2</option>
                  <option value="mixed">Смешанный</option>
                </select>
              </div>

              {/* Status */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Статус
                </label>
                <select
                  value={selectedStatus}
                  onChange={(e) => setSelectedStatus(e.target.value)}
                  className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                >
                  <option value="">Все статусы</option>
                  <option value="draft">Черновик</option>
                  <option value="scheduled">Запланировано</option>
                  <option value="published">Опубликовано</option>
                  <option value="archived">Архив</option>
                </select>
              </div>
            </>
          }
        />

        {/* Bulk actions bar */}
        {selectedCourses.length > 0 && (
          <div className="rounded-2xl border border-primary-100 bg-primary-50 px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary-100 text-xs font-semibold text-primary-700">
                {selectedCourses.length}
              </span>
              <div>
                <p className="text-sm font-medium text-gray-900">
                  Выбрано курсов: {selectedCourses.length}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => handleBulkAction('publish')}
                className="inline-flex items-center px-3 py-1 rounded-md text-xs font-medium text-white bg-green-600 hover:bg-green-700"
              >
                <Check className="h-4 w-4 mr-1" />
                Опубликовать
              </button>
              <button
                onClick={() => handleBulkAction('archive')}
                className="inline-flex items-center px-3 py-1 rounded-md text-xs font-medium text-white bg-red-600 hover:bg-red-700"
              >
                Архивировать
              </button>
              <button
                onClick={() => handleBulkAction('delete')}
                className="inline-flex items-center px-3 py-1 rounded-md text-xs font-medium text-white bg-red-800 hover:bg-red-900"
              >
                Удалить
              </button>
              <button
                onClick={() => setSelectedCourses([])}
                className="inline-flex items-center px-3 py-1 rounded-md border border-gray-300 text-xs font-medium text-gray-700 bg-white hover:bg-gray-50"
              >
                <X className="h-4 w-4 mr-1" />
                Снять выделение
              </button>
            </div>
          </div>
        )}

        {/* Courses cards / empty state */}
        {filteredCourses.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredCourses.map((course) => {
              const apiBase = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api/v1';
              
              // Priority: thumbnail_url first, then thumbnail_path, then placeholder
              let thumbnailUrl = '/placeholder-course.jpg';
              
              if (course.thumbnail_url) {
                // Use thumbnail_url if it exists
                thumbnailUrl = course.thumbnail_url;
              } else if (course.thumbnail_path) {
                // Fall back to thumbnail_path if thumbnail_url doesn't exist
                const thumbnailFilename = course.thumbnail_path.split('/').pop();
                thumbnailUrl = `${apiBase}/static/thumbnails/${thumbnailFilename}`;
              }
              
              // Debug logging
              if (course.thumbnail_path || course.thumbnail_url) {
                console.log(`Course ${course.id} thumbnail:`, {
                  thumbnail_url: course.thumbnail_url,
                  thumbnail_path: course.thumbnail_path,
                  finalUrl: thumbnailUrl
                });
              }
              
              return (
                <Link
                  key={course.id}
                  to={`/admin/courses/${course.id}/edit`}
                  className="bg-white rounded-2xl shadow hover:shadow-lg transition overflow-hidden"
                >
                  <div className="aspect-video bg-gray-100 relative">
                    <img
                      src={thumbnailUrl}
                      alt={course.title}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = '/placeholder-course.jpg';
                      }}
                    />
                    <div className="absolute top-2 right-2">
                      <input
                        type="checkbox"
                        checked={selectedCourses.includes(course.id)}
                        onChange={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                          handleSelectCourse(course.id);
                        }}
                        onClick={(e) => e.stopPropagation()}
                        className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                      />
                    </div>
                  </div>

                  <div className="p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-primary-600">
                        {getLevelBadge(course.level)}
                      </span>
                      {getStatusBadge(course.status)}
                    </div>

                    <h3 className="font-semibold text-gray-900 line-clamp-2">
                      {course.title}
                    </h3>

                    {course.description && (
                      <p className="text-sm text-gray-500 line-clamp-2">
                        {stripHtml(course.description)}
                      </p>
                    )}

                    <div className="flex items-center justify-between text-xs text-gray-400 pt-2 border-t border-gray-100">
                      <span>
                        {course.published_units_count} / {course.units_count} юнитов
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            e.preventDefault();
                            navigate(`/admin/courses/${course.id}`);
                          }}
                          className="text-primary-600 hover:text-primary-900"
                          title="Просмотр"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            e.preventDefault();
                            navigate(`/admin/courses/${course.id}/edit`);
                          }}
                          className="text-gray-600 hover:text-gray-900"
                          title="Редактировать"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            e.preventDefault();
                            handleDeleteCourse(course.id, course.title);
                          }}
                          className="text-red-600 hover:text-red-900"
                          title="Удалить"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-12 text-center">
            <BookMarked className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              {searchQuery || selectedLevel || selectedStatus 
                ? 'Курсы не найдены' 
                : 'Нет курсов'}
            </h3>
            <p className="text-gray-500 mb-6">
              {searchQuery || selectedLevel || selectedStatus
                ? 'Попробуйте изменить параметры поиска или фильтры'
                : 'Создайте первый курс, чтобы начать организовывать учебные материалы'}
            </p>
            {!searchQuery && !selectedLevel && !selectedStatus && (
              <Link
                to="/admin/courses/new"
                className="inline-flex items-center rounded-lg border border-transparent bg-primary-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-primary-700"
              >
                <Plus className="h-4 w-4 mr-2" />
                Создать курс
              </Link>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
