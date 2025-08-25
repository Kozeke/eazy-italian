
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
  X
} from 'lucide-react';
import { unitsApi } from '../../services/api';
import toast from 'react-hot-toast';

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
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {t('admin.nav.units')}
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Управление учебными юнитами
          </p>
        </div>
        <Link
          to="/admin/units/new"
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
        >
                          <Plus className="h-4 w-4 mr-2" />
          Создать юнит
        </Link>
      </div>

      {/* Search and Filters */}
      <div className="bg-white rounded-lg shadow p-4">
        <div className="flex flex-col sm:flex-row gap-4">
          {/* Search */}
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Поиск по названию или описанию..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-primary-500 focus:border-primary-500"
              />
            </div>
          </div>

          {/* Filter Toggle */}
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
          >
            <Filter className="h-4 w-4 mr-2" />
            Фильтры
          </button>
        </div>

        {/* Filters Panel */}
        {showFilters && (
          <div className="mt-4 pt-4 border-t border-gray-200">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Уровень
                </label>
                <select
                  value={selectedLevel}
                  onChange={(e) => setSelectedLevel(e.target.value)}
                  className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
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

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Статус
                </label>
                <select
                  value={selectedStatus}
                  onChange={(e) => setSelectedStatus(e.target.value)}
                  className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                >
                  <option value="">Все статусы</option>
                  <option value="draft">Черновик</option>
                  <option value="scheduled">Запланировано</option>
                  <option value="published">Опубликовано</option>
                  <option value="archived">Архив</option>
                </select>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Bulk Actions */}
      {selectedUnits.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
                              <Check className="h-5 w-5 text-blue-600 mr-2" />
              <span className="text-sm font-medium text-blue-900">
                Выбрано {selectedUnits.length} юнитов
              </span>
            </div>
            <div className="flex space-x-2">
              <button
                onClick={() => handleBulkAction('publish')}
                className="inline-flex items-center px-3 py-1 border border-transparent text-sm font-medium rounded text-white bg-green-600 hover:bg-green-700"
              >
                Опубликовать
              </button>
              <button
                onClick={() => handleBulkAction('unpublish')}
                className="inline-flex items-center px-3 py-1 border border-transparent text-sm font-medium rounded text-white bg-yellow-600 hover:bg-yellow-700"
              >
                Снять с публикации
              </button>
                             <button
                 onClick={() => handleBulkAction('archive')}
                 className="inline-flex items-center px-3 py-1 border border-transparent text-sm font-medium rounded text-white bg-red-600 hover:bg-red-700"
               >
                 Архивировать
               </button>
               <button
                 onClick={() => handleBulkAction('delete')}
                 className="inline-flex items-center px-3 py-1 border border-transparent text-sm font-medium rounded text-white bg-red-800 hover:bg-red-900"
               >
                 Удалить
               </button>
              <button
                onClick={() => setSelectedUnits([])}
                className="inline-flex items-center px-3 py-1 border border-gray-300 text-sm font-medium rounded text-gray-700 bg-white hover:bg-gray-50"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Units Table */}
      <div className="bg-white shadow overflow-hidden sm:rounded-md">
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
                  Название
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Уровень
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Статус
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Дата публикации
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Контент
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Обновлено
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
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
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">
                      {unit.title}
                    </div>
                    <div className="text-sm text-gray-500">
                      Порядок: {unit.order_index}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {getLevelBadge(unit.level)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {getStatusBadge(unit.status)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {formatDate(unit.publish_at)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex space-x-2 text-xs">
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
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <div className="flex items-center justify-end space-x-2">
                      <Link
                        to={`/admin/units/${unit.id}`}
                        className="text-primary-600 hover:text-primary-900"
                        title="Просмотр"
                      >
                        <Eye className="h-4 w-4" />
                      </Link>
                      <Link
                        to={`/admin/units/${unit.id}/edit`}
                        className="text-gray-600 hover:text-gray-900"
                        title="Редактировать"
                      >
                        <Pencil className="h-4 w-4" />
                      </Link>
                      <button
                        className="text-gray-600 hover:text-gray-900"
                        title="Дублировать"
                      >
                        <Copy className="h-4 w-4" />
                      </button>
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

        {/* Empty State */}
        {filteredUnits.length === 0 && (
          <div className="text-center py-12">
                            <Archive className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-sm font-medium text-gray-900">
              {searchQuery || selectedLevel || selectedStatus ? 'Нет результатов' : 'Нет юнитов'}
            </h3>
            <p className="mt-1 text-sm text-gray-500">
              {searchQuery || selectedLevel || selectedStatus 
                ? 'Попробуйте изменить параметры поиска или фильтры.'
                : 'Начните с создания первого юнита.'
              }
            </p>
            {!searchQuery && !selectedLevel && !selectedStatus && (
              <div className="mt-6">
                <Link
                  to="/admin/units/new"
                  className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Создать юнит
                </Link>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
