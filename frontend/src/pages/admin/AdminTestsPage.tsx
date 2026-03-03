import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { testsApi } from '../../services/api';
import AdminSearchFilters from '../../components/admin/AdminSearchFilters';
import { Plus, Edit, Trash2, Eye, ClipboardList, Clock, Brain, Percent, BookOpen } from 'lucide-react';

const levels = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
const statuses = ['draft', 'published', 'scheduled', 'archived'];
const types = ['grammar', 'vocabulary', 'listening', 'reading', 'writing', 'speaking'];

export default function AdminTestsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [tests, setTests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedLevel, setSelectedLevel] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');
  const [selectedType, setSelectedType] = useState('');
  const [selectedTests, setSelectedTests] = useState<number[]>([]);
  const [sortField] = useState('createdAt');
  const [sortDirection] = useState<'asc' | 'desc'>('desc');
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => { loadTests(); }, []);

  const loadTests = async () => {
    try {
      setLoading(true);
      const response = await testsApi.getTests();
      const fetchedTests = Array.isArray(response) ? response : response.items || [];
      const mappedTests = fetchedTests.map((test: any) => ({
        id: test.id,
        title: test.title,
        description: test.description || '',
        level: test.unit?.level || 'A1',
        status: test.status,
        type: 'grammar',
        duration: test.time_limit_minutes || 30,
        questionsCount: test.questions_count || 0,
        passingScore: test.passing_score || 70,
        lastUpdated: test.updated_at || test.created_at,
        createdAt: test.created_at || test.updated_at || new Date().toISOString(),
        unit_title: test.unit_title || test.unit?.title || null,
      }));
      setTests(mappedTests);
    } catch (error) {
      console.error('Error loading tests:', error);
      toast.error('Ошибка загрузки тестов');
      setTests([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectTest = (testId: number) => {
    setSelectedTests(prev =>
      prev.includes(testId) ? prev.filter(id => id !== testId) : [...prev, testId]
    );
  };

  const handleBulkAction = (action: string) => {
    console.log(`Bulk action: ${action}`, selectedTests);
    setSelectedTests([]);
  };

  const handleDeleteTest = async (testId: number) => {
    if (!window.confirm('Вы уверены, что хотите удалить этот тест?')) return;
    try {
      await testsApi.deleteTest(testId);
      toast.success('Тест успешно удален');
      await loadTests();
    } catch (error: any) {
      toast.error(error.response?.data?.detail || 'Ошибка при удалении теста');
    }
  };

  const getStatusBadge = (status: string) => {
    const cfg: Record<string, { color: string; label: string }> = {
      draft:     { color: 'bg-gray-100 text-gray-700',   label: 'Черновик' },
      published: { color: 'bg-green-100 text-green-800', label: 'Опубликован' },
      scheduled: { color: 'bg-blue-100 text-blue-800',   label: 'Запланирован' },
      archived:  { color: 'bg-red-100 text-red-700',     label: 'Архив' },
    };
    const c = cfg[status] || cfg.draft;
    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${c.color}`}>
        {c.label}
      </span>
    );
  };

  const filteredTests = tests.filter(test => {
    const matchesSearch = test.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          test.description.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesSearch &&
      (!selectedLevel  || test.level  === selectedLevel) &&
      (!selectedStatus || test.status === selectedStatus) &&
      (!selectedType   || test.type   === selectedType);
  });

  const sortedTests = [...filteredTests].sort((a, b) => {
    const aV = a[sortField as keyof typeof a];
    const bV = b[sortField as keyof typeof b];
    if (!aV && !bV) return 0;
    if (!aV) return 1;
    if (!bV) return -1;
    if (['createdAt', 'lastUpdated'].includes(sortField)) {
      const diff = new Date(aV as string).getTime() - new Date(bV as string).getTime();
      return sortDirection === 'asc' ? diff : -diff;
    }
    return sortDirection === 'asc' ? (aV < bV ? -1 : 1) : (aV > bV ? -1 : 1);
  });

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="sticky top-0 z-20 border-b bg-white/90 backdrop-blur">
        <div className="max-w-7xl mx-auto px-4 lg:px-8 py-4 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <ClipboardList className="h-6 w-6 text-primary-600" />
              <h1 className="text-xl md:text-2xl font-semibold text-gray-900">{t('admin.nav.tests')}</h1>
              {tests.length > 0 && (
                <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600">
                  {tests.length} тестов
                </span>
              )}
            </div>
            <p className="mt-1 text-xs md:text-sm text-gray-500">Управляйте тестами и проверяйте знания студентов</p>
          </div>
          <button
            onClick={() => navigate('/admin/tests/new')}
            className="inline-flex items-center rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-primary-700"
          >
            <Plus className="h-4 w-4 mr-2" />
            Создать тест
          </button>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-4 lg:px-8 py-8 space-y-6">
        <AdminSearchFilters
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          searchPlaceholder="Поиск по названию или описанию..."
          showFilters={showFilters}
          onToggleFilters={() => setShowFilters(!showFilters)}
          filters={
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Уровень</label>
                <select value={selectedLevel} onChange={(e) => setSelectedLevel(e.target.value)}
                  className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500">
                  <option value="">Все уровни</option>
                  {levels.map(l => <option key={l} value={l}>{l}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Статус</label>
                <select value={selectedStatus} onChange={(e) => setSelectedStatus(e.target.value)}
                  className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500">
                  <option value="">Все статусы</option>
                  {statuses.map(s => (
                    <option key={s} value={s}>
                      {s === 'draft' ? 'Черновик' : s === 'published' ? 'Опубликовано' : s === 'scheduled' ? 'Запланировано' : 'Архивировано'}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Тип</label>
                <select value={selectedType} onChange={(e) => setSelectedType(e.target.value)}
                  className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500">
                  <option value="">Все типы</option>
                  {types.map(ty => (
                    <option key={ty} value={ty}>
                      {ty === 'grammar' ? 'Грамматика' : ty === 'vocabulary' ? 'Лексика' : ty === 'listening' ? 'Аудирование' : ty === 'reading' ? 'Чтение' : ty === 'writing' ? 'Письмо' : 'Говорение'}
                    </option>
                  ))}
                </select>
              </div>
            </>
          }
        />

        {selectedTests.length > 0 && (
          <div className="rounded-2xl border border-primary-100 bg-primary-50 px-4 py-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-blue-800">Выбрано {selectedTests.length} тестов</span>
              <div className="flex space-x-2">
                <button onClick={() => handleBulkAction('publish')}
                  className="inline-flex items-center px-3 py-1 text-sm font-medium rounded text-blue-700 bg-blue-100 hover:bg-blue-200">
                  Опубликовать
                </button>
                <button onClick={() => handleBulkAction('archive')}
                  className="inline-flex items-center px-3 py-1 text-sm font-medium rounded text-red-700 bg-red-100 hover:bg-red-200">
                  Архивировать
                </button>
                <button onClick={() => setSelectedTests([])}
                  className="inline-flex items-center px-3 py-1 border border-gray-300 text-sm font-medium rounded text-gray-700 bg-white hover:bg-gray-50">
                  Отменить
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          {loading ? (
            <div className="divide-y divide-gray-200">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="px-6 py-4 animate-pulse flex items-center gap-4">
                  <div className="w-4 h-4 bg-gray-200 rounded" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 bg-gray-200 rounded w-2/3" />
                    <div className="h-3 bg-gray-200 rounded w-1/3" />
                  </div>
                  <div className="flex gap-3">
                    {[...Array(3)].map((_, j) => <div key={j} className="w-16 h-4 bg-gray-200 rounded" />)}
                  </div>
                  <div className="flex gap-1">
                    {[...Array(3)].map((_, j) => <div key={j} className="w-8 h-8 bg-gray-200 rounded-lg" />)}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {sortedTests.length > 0 ? (
                sortedTests.map((test) => (
                  <div key={test.id} className="flex items-center justify-between px-6 py-3.5 hover:bg-gray-50 transition-colors">
                    {/* Left: checkbox + info */}
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div onClick={(e) => e.stopPropagation()}>
                        <input type="checkbox" checked={selectedTests.includes(test.id)}
                          onChange={() => handleSelectTest(test.id)}
                          className="rounded border-gray-300 text-primary-600 focus:ring-primary-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium text-gray-900 truncate">{test.title}</span>
                          {getStatusBadge(test.status)}
                        </div>
                        {test.unit_title && (
                          <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1 truncate">
                            <BookOpen className="w-3 h-3 flex-shrink-0" />
                            {test.unit_title}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Center: stats */}
                    <div className="hidden md:flex items-center gap-5 flex-shrink-0 text-xs text-gray-400 mx-6">
                      <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" />{test.duration} мин</span>
                      <span className="flex items-center gap-1"><Brain className="w-3.5 h-3.5" />{test.questionsCount} вопр.</span>
                      <span className="flex items-center gap-1"><Percent className="w-3.5 h-3.5" />{test.passingScore}%</span>
                    </div>

                    {/* Right: actions */}
                    <div className="flex items-center gap-0.5 flex-shrink-0">
                      <button onClick={() => navigate(`/admin/tests/${test.id}`)}
                        className="p-2 text-primary-500 hover:text-primary-700 hover:bg-primary-50 rounded-lg transition-colors" title="Подробнее">
                        <Eye className="h-4 w-4" />
                      </button>
                      <button onClick={() => navigate(`/admin/tests/${test.id}/edit`)}
                        className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors" title="Редактировать">
                        <Edit className="h-4 w-4" />
                      </button>
                      <button onClick={() => handleDeleteTest(test.id)}
                        className="p-2 text-red-400 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors" title="Удалить">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-12">
                  <ClipboardList className="mx-auto h-12 w-12 text-gray-400" />
                  <h3 className="mt-2 text-sm font-medium text-gray-900">Нет тестов</h3>
                  <p className="mt-1 text-sm text-gray-500">
                    {searchQuery || selectedLevel || selectedStatus || selectedType
                      ? 'Попробуйте изменить фильтры поиска.'
                      : 'Начните с создания первого теста.'}
                  </p>
                  {!searchQuery && !selectedLevel && !selectedStatus && !selectedType && (
                    <div className="mt-6">
                      <button onClick={() => navigate('/admin/tests/new')}
                        className="inline-flex items-center px-4 py-2 text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700">
                        <Plus className="w-4 h-4 mr-2" />Создать тест
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}