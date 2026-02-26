import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { testsApi } from '../../services/api';
import { 
  Plus, 
  Pencil,
  Trash2,
  Eye, 
  Search,
  Filter,
  Folder,
  FileText,
  Copy,
  Grid3x3,
  List,
  ArrowRight,
  X
} from 'lucide-react';
import './AdminTestsPage.css';

export default function AdminTestsPage() {
  const navigate = useNavigate();
  const [tests, setTests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedUnit, setSelectedUnit] = useState('');
  const [selectedQuestions, setSelectedQuestions] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  useEffect(() => {
    loadTests();
  }, []);

  const loadTests = async () => {
    try {
      setLoading(true);
      const response = await testsApi.getTests();
      const fetchedTests = Array.isArray(response) ? response : response.items || [];
      
      const mappedTests = fetchedTests.map((test: any) => ({
        id: test.id,
        title: test.title,
        description: test.description || '',
        unit_title: test.unit_title || test.unit?.title || null,
        duration: test.time_limit_minutes || 30,
        questionsCount: test.questions_count || test.test_questions?.length || 0,
        passingScore: test.passing_score || 70,
        createdAt: test.created_at || new Date().toISOString(),
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

  // Get unique units for filter
  const uniqueUnits = useMemo(() => {
    const units = new Set<string>();
    tests.forEach(test => {
      if (test.unit_title) {
        units.add(test.unit_title);
      } else {
        units.add('Без юнита');
      }
    });
    return Array.from(units).sort();
  }, [tests]);

  const handleDeleteTest = async (testId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm('Вы уверены, что хотите удалить этот тест? Это действие нельзя отменить.')) {
      return;
    }

    try {
      await testsApi.deleteTest(testId);
      setTests(prev => prev.filter(t => t.id !== testId));
      toast.success('Тест успешно удален');
    } catch (error: any) {
      console.error('Error deleting test:', error);
      toast.error(error.response?.data?.detail || 'Ошибка при удалении теста');
    }
  };

  // Filter tests
  const filteredTests = useMemo(() => {
    return tests.filter(test => {
      const matchesSearch = !searchQuery || 
        test.title.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesUnit = !selectedUnit || 
        (selectedUnit === 'Без юнита' ? !test.unit_title : test.unit_title === selectedUnit);
      const matchesQuestions = !selectedQuestions ||
        (selectedQuestions === '0' && test.questionsCount === 0) ||
        (selectedQuestions === '1+' && test.questionsCount >= 1);
      
      return matchesSearch && matchesUnit && matchesQuestions;
    });
  }, [tests, searchQuery, selectedUnit, selectedQuestions]);

  // Get card strip color based on test
  const getCardStripColor = (test: any): string => {
    // Use different colors based on test properties
    if (test.questionsCount === 0) {
      return 'linear-gradient(90deg, var(--muted), #8a7a6a)';
    }
    // You can add more logic here based on test properties
    return 'linear-gradient(90deg, var(--teal), var(--teal-light))';
  };

  // Get icon background color
  const getIconBgColor = (test: any): string => {
    if (test.questionsCount === 0) {
      return '#1a1a1a';
    }
    return 'var(--ink)';
  };

  // Get icon accent color
  const getIconAccentColor = (test: any): string => {
    if (test.questionsCount === 0) {
      return 'var(--muted)';
    }
    return 'var(--teal)';
  };

  // Animate threshold bars on mount
  useEffect(() => {
    if (!loading) {
      setTimeout(() => {
        const fills = document.querySelectorAll('.threshold-fill[data-target]');
        fills.forEach((el) => {
          const target = (el as HTMLElement).getAttribute('data-target');
          if (target) {
            (el as HTMLElement).style.width = target + '%';
          }
        });
      }, 400);
    }
  }, [loading, filteredTests]);

  if (loading) {
    return (
      <div className="admin-tests-wrapper min-h-screen bg-[#f5f0e8] flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#1a7070]"></div>
      </div>
    );
  }

  return (
    <div className="admin-tests-wrapper">
      <div className="page-content">
        {/* Page header */}
        <div className="page-header">
          <div>
            <h1 className="page-title">
              Тесты <em>/ {filteredTests.length} {filteredTests.length === 1 ? 'тест' : filteredTests.length < 5 ? 'теста' : 'тестов'}</em>
            </h1>
            <p className="page-meta">Управляйте тестами и проверяйте знания студентов</p>
          </div>
        </div>

        {/* Toolbar */}
        <div className="toolbar">
          <div className="search-wrap">
            <Search className="w-4 h-4" />
            <input
              className="search-input"
              type="text"
              placeholder="Поиск по названию…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <button
            className={`filter-btn ${showFilters ? 'active' : ''}`}
            onClick={() => setShowFilters(!showFilters)}
          >
            <Filter className="w-3 h-3" />
            Фильтры
          </button>
          <div className="view-toggle">
            <button
              className={`view-toggle-btn ${viewMode === 'grid' ? 'active' : ''}`}
              onClick={() => setViewMode('grid')}
              title="Сетка"
            >
              <Grid3x3 className="w-4 h-4" />
            </button>
            <button
              className={`view-toggle-btn ${viewMode === 'list' ? 'active' : ''}`}
              onClick={() => setViewMode('list')}
              title="Список"
            >
              <List className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Filter panel */}
        <div className={`filter-panel ${showFilters ? 'open' : ''}`}>
          <div className="filter-group">
            <label>Юнит</label>
            <select
              value={selectedUnit}
              onChange={(e) => setSelectedUnit(e.target.value)}
            >
              <option value="">Все юниты</option>
              {uniqueUnits.map(unit => (
                <option key={unit} value={unit}>{unit}</option>
              ))}
            </select>
          </div>
          <div className="filter-group">
            <label>Вопросы</label>
            <select
              value={selectedQuestions}
              onChange={(e) => setSelectedQuestions(e.target.value)}
            >
              <option value="">Любое кол-во</option>
              <option value="0">0 вопросов</option>
              <option value="1+">1+ вопросов</option>
            </select>
          </div>
          <div className="filter-group">
            <label>Сортировка</label>
            <select>
              <option>По дате создания</option>
              <option>По названию</option>
              <option>По кол-ву вопросов</option>
            </select>
          </div>
        </div>

        {/* Count bar */}
        <div className="count-bar">
          <div className="count-label">
            Показано <span className="count-num">{filteredTests.length}</span> тестов
          </div>
        </div>

        {/* Tests grid */}
        {filteredTests.length > 0 ? (
          <div className={`tests-grid ${viewMode === 'list' ? 'list-view' : ''}`} style={viewMode === 'list' ? {gridTemplateColumns: '1fr'} : {}}>
            {filteredTests.map((test) => (
              <div key={test.id} className="test-card">
                <div 
                  className="card-strip" 
                  style={{background: getCardStripColor(test)}}
                ></div>
                <div className="test-card-head">
                  <div 
                    className="test-icon-wrap"
                    style={{background: getIconBgColor(test)}}
                  >
                    <FileText className="w-5 h-5" />
                    <div 
                      className="icon-accent"
                      style={{background: getIconAccentColor(test)}}
                    ></div>
                  </div>
                  <div className="test-head-info">
                    <div className="test-name">{test.title}</div>
                    <div className={`test-unit-ref ${!test.unit_title ? 'no-unit' : ''}`}>
                      {test.unit_title ? (
                        <>
                          <Folder className="w-3 h-3" />
                          <span>{test.unit_title}</span>
                        </>
                      ) : (
                        <>
                          <X className="w-3 h-3" />
                          <span>Без юнита</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <div className="test-metrics">
                  <div className="metric">
                    <div className="metric-val teal">{test.duration}</div>
                    <div className="metric-lbl">Мин.</div>
                  </div>
                  <div className="metric">
                    <div className={`metric-val ${test.questionsCount === 0 ? 'muted' : ''}`}>
                      {test.questionsCount}
                    </div>
                    <div className="metric-lbl">Вопросов</div>
                  </div>
                  <div className="metric">
                    <div className="metric-val gold">{test.passingScore}%</div>
                    <div className="metric-lbl">Порог</div>
                  </div>
                </div>

                <div className="test-threshold">
                  <div className="threshold-row">
                    <span className="threshold-label">Порог прохождения</span>
                    <span className="threshold-pct">{test.passingScore}%</span>
                  </div>
                  <div 
                    className="threshold-track" 
                    style={{'--marker': `${test.passingScore}%`} as React.CSSProperties}
                  >
                    <div 
                      className="threshold-fill" 
                      data-target={test.passingScore}
                      style={{width: '0%', background: getCardStripColor(test).includes('muted') ? 'var(--muted)' : 'var(--teal)'}}
                    ></div>
                  </div>
                </div>

                <div className="card-actions">
                  <div className="action-group">
                    <button
                      className="icon-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        // TODO: Open preview
                      }}
                      title="Предпросмотр"
                    >
                      <Eye className="w-3 h-3" />
                    </button>
                    <button
                      className="icon-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        // TODO: Duplicate test
                      }}
                      title="Дублировать"
                    >
                      <Copy className="w-3 h-3" />
                    </button>
                    <button
                      className="icon-btn danger"
                      onClick={(e) => handleDeleteTest(test.id, e)}
                      title="Удалить"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                  <button
                    className="open-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(`/admin/tests/${test.id}`);
                    }}
                  >
                    Открыть <ArrowRight className="w-2.5 h-2.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{textAlign: 'center', padding: '4rem 2rem', gridColumn: '1/-1'}}>
            <FileText className="mx-auto h-12 w-12 text-[#6b6456]" />
            <h3 style={{marginTop: '1rem', fontFamily: "'Playfair Display', serif", fontSize: '1.1rem', fontWeight: 700}}>
              {searchQuery || selectedUnit || selectedQuestions
                ? 'Тесты не найдены'
                : 'Нет тестов'}
            </h3>
            <p style={{marginTop: '0.5rem', fontSize: '0.82rem', color: 'var(--muted)'}}>
              {searchQuery || selectedUnit || selectedQuestions
                ? 'Попробуйте изменить параметры поиска или фильтры'
                : 'Начните с создания первого теста'}
            </p>
            {!searchQuery && !selectedUnit && !selectedQuestions && (
              <button
                className="open-btn"
                onClick={() => navigate('/admin/tests/new')}
                style={{marginTop: '1.5rem'}}
              >
                <Plus className="w-3 h-3" />
                Создать тест
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
