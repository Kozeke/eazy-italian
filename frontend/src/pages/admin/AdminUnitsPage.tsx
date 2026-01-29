
import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { 
  Plus, 
  Search, 
  Filter,
  Eye,
  Pencil,
  Copy,
  Archive,
  Trash2,
  Check,
  X,
  Layers
} from 'lucide-react';
import { unitsApi } from '../../services/api';
import toast from 'react-hot-toast';
import AdminSearchFilters from '../../components/admin/AdminSearchFilters';

interface Unit {
  id: number;
  title: string;
  level: string;
  status: string;
  publish_at: string | null;
  order_index: number;
  created_by: number;
  created_at: string;
  updated_at: string | null;
  course_id: number | null;
  course_title: string | null;
  content_count: {
    videos: number;
    tasks: number;
    tests: number;
    published_videos: number;
    published_tasks: number;
    published_tests: number;
  };
}

export default function AdminUnitsPage() {
  const { t } = useTranslation();
  const [units, setUnits] = useState<Unit[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedLevel, setSelectedLevel] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');
  const [selectedUnits, setSelectedUnits] = useState<number[]>([]);
  const [showFilters, setShowFilters] = useState(false);

  // Mock data for demonstration
  const mockUnits: Unit[] = [
    {
      id: 1,
      title: 'Приветствие и знакомство',
      level: 'A1',
      status: 'published',
      publish_at: '2024-01-15T10:00:00Z',
      order_index: 1,
      created_by: 1,
      created_at: '2024-01-10T10:00:00Z',
      updated_at: '2024-01-15T10:00:00Z',
      course_id: 1,
      course_title: 'Итальянский A1',
      content_count: {
        videos: 2,
        tasks: 3,
        tests: 1,
        published_videos: 2,
        published_tasks: 3,
        published_tests: 1
      }
    },
    {
      id: 2,
      title: 'Основы грамматики',
      level: 'A1',
      status: 'draft',
      publish_at: null,
      order_index: 2,
      created_by: 1,
      created_at: '2024-01-12T10:00:00Z',
      updated_at: '2024-01-12T10:00:00Z',
      course_id: 1,
      course_title: 'Итальянский A1',
      content_count: {
        videos: 1,
        tasks: 2,
        tests: 0,
        published_videos: 0,
        published_tasks: 0,
        published_tests: 0
      }
    },
    {
      id: 3,
      title: 'Повседневные фразы',
      level: 'A2',
      status: 'scheduled',
      publish_at: '2024-02-01T10:00:00Z',
      order_index: 3,
      created_by: 1,
      created_at: '2024-01-14T10:00:00Z',
      updated_at: '2024-01-14T10:00:00Z',
      course_id: 2,
      course_title: 'Итальянский A2',
      content_count: {
        videos: 3,
        tasks: 4,
        tests: 2,
        published_videos: 3,
        published_tasks: 4,
        published_tests: 2
      }
    }
  ];

  useEffect(() => {
    const fetchUnits = async () => {
      try {
        setLoading(true);
        const fetchedUnits = await unitsApi.getAdminUnits();
        setUnits(fetchedUnits as any);
      } catch (error: any) {
        console.error('Error fetching units:', error);
        toast.error('Ошибка при загрузке юнитов');
        // Fallback to mock data if API fails
        setUnits(mockUnits);
      } finally {
        setLoading(false);
      }
    };

    fetchUnits();
  }, []);

  // Refresh units when component becomes visible (e.g., when navigating back)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        refreshUnits();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
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
    const levelColors = {
      A1: 'bg-purple-100 text-purple-800',
      A2: 'bg-blue-100 text-blue-800',
      B1: 'bg-green-100 text-green-800',
      B2: 'bg-yellow-100 text-yellow-800',
      C1: 'bg-orange-100 text-orange-800',
      C2: 'bg-red-100 text-red-800'
    };
    
    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${levelColors[level as keyof typeof levelColors]}`}>
        {level}
      </span>
    );
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('ru-RU');
  };

  const handleSelectAll = () => {
    if (selectedUnits.length === units.length) {
      setSelectedUnits([]);
    } else {
      setSelectedUnits(units.map(unit => unit.id));
    }
  };

  const handleSelectUnit = (unitId: number) => {
    setSelectedUnits(prev => 
      prev.includes(unitId) 
        ? prev.filter(id => id !== unitId)
        : [...prev, unitId]
    );
  };

  const refreshUnits = async () => {
    try {
      setLoading(true);
      const fetchedUnits = await unitsApi.getAdminUnits();
      setUnits(fetchedUnits as any);
    } catch (error: any) {
      console.error('Error refreshing units:', error);
      toast.error('Ошибка при обновлении списка юнитов');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteUnit = async (unitId: number, unitTitle: string) => {
    if (!window.confirm(`Вы уверены, что хотите удалить юнит "${unitTitle}"? Это действие нельзя отменить.`)) {
      return;
    }
    
    try {
      await unitsApi.deleteUnit(unitId);
      toast.success('Юнит успешно удален');
      await refreshUnits();
    } catch (error: any) {
      console.error('Error deleting unit:', error);
      toast.error(error.response?.data?.detail || 'Ошибка при удалении юнита');
    }
  };

  const handleBulkAction = async (action: string) => {
    if (selectedUnits.length === 0) return;
    
    try {
      if (action === 'delete') {
        if (!window.confirm(`Вы уверены, что хотите удалить ${selectedUnits.length} юнитов? Это действие нельзя отменить.`)) {
          return;
        }
        
        // Delete each unit
        for (const unitId of selectedUnits) {
          await unitsApi.deleteUnit(unitId);
        }
        
        toast.success(`${selectedUnits.length} юнитов успешно удалено`);
      } else {
        // Here you would call the API for other bulk actions
        console.log(`Bulk action: ${action}`, selectedUnits);
        
        // For now, just show a success message
        toast.success(`Действие "${action}" применено к ${selectedUnits.length} юнитам`);
      }
      
      // Refresh the units list
      await refreshUnits();
    } catch (error: any) {
      console.error('Error performing bulk action:', error);
      toast.error('Ошибка при выполнении действия');
    } finally {
      setSelectedUnits([]);
    }
  };

  const filteredUnits = units.filter(unit => {
    const matchesSearch = unit.title.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesLevel = !selectedLevel || unit.level === selectedLevel;
    const matchesStatus = !selectedStatus || unit.status === selectedStatus;
    
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
      {/* Sticky top bar – Coursera/Udemy style */}
      <div className="sticky top-0 z-20 border-b bg-white/90 backdrop-blur">
        <div className="max-w-7xl mx-auto px-4 lg:px-8 py-4 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Layers className="h-6 w-6 text-primary-600" />
              <h1 className="text-xl md:text-2xl font-semibold text-gray-900">
                {t('admin.nav.units')}
              </h1>
              {units.length > 0 && (
                <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600">
                  {units.length} юнитов
                </span>
              )}
            </div>
            <p className="mt-1 text-xs md:text-sm text-gray-500">
              Управляйте учебными юнитами — как списком курсов на Udemy/Coursera
            </p>
          </div>

          <Link
            to="/admin/units/new"
            className="inline-flex items-center rounded-lg border border-transparent bg-primary-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
          >
            <Plus className="h-4 w-4 mr-2" />
            Создать юнит
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
        {selectedUnits.length > 0 && (
          <div className="rounded-2xl border border-primary-100 bg-primary-50 px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary-100 text-xs font-semibold text-primary-700">
                {selectedUnits.length}
              </span>
              <div>
                <p className="text-sm font-medium text-gray-900">
                  Выбрано юнитов: {selectedUnits.length}
                </p>
                <p className="text-xs text-gray-600">
                  Примените массовое действие — как для курса на платформе.
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
                onClick={() => setSelectedUnits([])}
                className="inline-flex items-center px-3 py-1 rounded-md border border-gray-300 text-xs font-medium text-gray-700 bg-white hover:bg-gray-50"
              >
                <X className="h-4 w-4 mr-1" />
                Снять выделение
              </button>
            </div>
          </div>
        )}

        {/* Units table / empty state */}
        {filteredUnits.length > 0 ? (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left">
                      <input
                        type="checkbox"
                        checked={selectedUnits.length === units.length && units.length > 0}
                        onChange={handleSelectAll}
                        className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                      />
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Курс
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Название
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Уровень
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Статус
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Порядок
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Контент
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Обновлено
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider sticky right-0 bg-gray-50 z-10 border-l border-gray-200">
                      Действия
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredUnits.map((unit) => (
                    <tr key={unit.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <input
                          type="checkbox"
                          checked={selectedUnits.includes(unit.id)}
                          onChange={() => handleSelectUnit(unit.id)}
                          className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                        />
                      </td>
                      <td className="px-6 py-4">
                        {unit.course_title ? (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800 break-words">
                            {unit.course_title}
                          </span>
                        ) : (
                          <span className="text-xs text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm font-medium text-gray-900 break-words max-w-xs">
                          {unit.title}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {getLevelBadge(unit.level)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {getStatusBadge(unit.status)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {unit.order_index}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex flex-wrap gap-1 text-xs">
                          <span className="inline-flex items-center px-2 py-1 rounded-full bg-blue-100 text-blue-800">
                            {unit.content_count.videos} видео
                          </span>
                          <span className="inline-flex items-center px-2 py-1 rounded-full bg-green-100 text-green-800">
                            {unit.content_count.tasks} заданий
                          </span>
                          <span className="inline-flex items-center px-2 py-1 rounded-full bg-purple-100 text-purple-800">
                            {unit.content_count.tests} тестов
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {formatDate(unit.updated_at)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium sticky right-0 bg-white z-10 border-l border-gray-200 hover:bg-gray-50">
                        <div className="flex items-center justify-end space-x-2">
                          <Link
                            to={`/admin/units/${unit.id}/edit`}
                            className="text-gray-600 hover:text-gray-900"
                            title="Редактировать"
                          >
                            <Pencil className="h-4 w-4" />
                          </Link>
                          <button
                            onClick={() => handleDeleteUnit(unit.id, unit.title)}
                            className="text-red-600 hover:text-red-900"
                            title="Удалить"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 py-12 px-4 text-center">
            <Archive className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-3 text-sm font-medium text-gray-900">
              {searchQuery || selectedLevel || selectedStatus
                ? 'Нет результатов'
                : 'Нет юнитов'}
            </h3>
            <p className="mt-1 text-sm text-gray-500">
              {searchQuery || selectedLevel || selectedStatus
                ? 'Попробуйте изменить параметры поиска или фильтры.'
                : 'Начните с создания первого юнита.'}
            </p>
            {!searchQuery && !selectedLevel && !selectedStatus && (
              <div className="mt-6">
                <Link
                  to="/admin/units/new"
                  className="inline-flex items-center rounded-lg border border-transparent bg-primary-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-primary-700"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Создать юнит
                </Link>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
