import { useTranslation } from 'react-i18next';
import { useEffect, useState } from 'react';
import { gradesApi } from '../../services/api';
import { Eye, Users, ChevronUp, ChevronDown, GraduationCap } from 'lucide-react';
import i18n from '../../i18n';
import AdminSearchFilters from '../../components/admin/AdminSearchFilters';

type GradeRow = {
  attempt_id: number;
  student: string;
  course: string;
  unit: string;
  test: string;
  score: number;
  passing_score: number;
  passed: boolean;
  status: string;
  submitted_at: string;
};
export default function AdminGradesPage() {
  const { t } = useTranslation();
  const [grades, setGrades] = useState<GradeRow[]>([]);
  const [allGrades, setAllGrades] = useState<GradeRow[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const pageSize = 20;
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [searchQuery, setSearchQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState('');

  const [selectedAttempt, setSelectedAttempt] = useState<number | null>(null);
  const [detail, setDetail] = useState<any | null>(null);
  const closeModal = () => {
    setSelectedAttempt(null);
    setDetail(null);
  };
  
  useEffect(() => {
    if (!selectedAttempt) return;
    gradesApi.getGradeDetail(selectedAttempt).then(setDetail);
  }, [selectedAttempt]);
  
  useEffect(() => {
    gradesApi.getGrades({
      page,
      page_size: 1000, // Get all for filtering
      sort_by: 'submitted_at',
      sort_dir: sortDir,
    }).then((res) => {
      setAllGrades(res.items);
      setTotal(res.total);
    });
  }, [sortDir]);

  // Filter grades based on search and filters
  useEffect(() => {
    let filtered = [...allGrades];

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter((g) =>
        g.student.toLowerCase().includes(query) ||
        g.course.toLowerCase().includes(query) ||
        g.unit.toLowerCase().includes(query) ||
        g.test.toLowerCase().includes(query)
      );
    }

    // Status filter
    if (selectedStatus) {
      filtered = filtered.filter((g) => {
        if (selectedStatus === 'passed') return g.passed;
        if (selectedStatus === 'failed') return !g.passed;
        return true;
      });
    }

    // Apply pagination
    const startIndex = (page - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    setGrades(filtered.slice(startIndex, endIndex));
    setTotal(filtered.length);
  }, [allGrades, searchQuery, selectedStatus, page]);
  
  
  // Returns a badge component showing whether a test was passed or failed
  const getResultBadge = (passed: boolean) => {
    return passed ? (
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
        {t('admin.grades.passed')}
      </span>
    ) : (
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
        {t('admin.grades.failed')}
      </span>
    );
  };
  
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Sticky top bar */}
      <div className="sticky top-0 z-20 border-b bg-white/90 backdrop-blur">
        <div className="max-w-7xl mx-auto px-4 lg:px-8 py-4 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <GraduationCap className="h-6 w-6 text-primary-600" />
              <h1 className="text-xl md:text-2xl font-semibold text-gray-900">
                {t('admin.nav.grades')}
              </h1>
              {grades.length > 0 && (
                <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600">
                  {total} оценок
                </span>
              )}
            </div>
            <p className="mt-1 text-xs md:text-sm text-gray-500">
              Просматривайте результаты тестов и оценки студентов
            </p>
          </div>
        </div>
      </div>

      {/* Main content */}
      <main className="max-w-7xl mx-auto px-4 lg:px-8 py-8 space-y-6">
        {/* Search & filters */}
        <AdminSearchFilters
          searchQuery={searchQuery}
          onSearchChange={(value) => {
            setSearchQuery(value);
            setPage(1); // Reset to first page when search changes
          }}
          searchPlaceholder="Поиск по студенту, курсу, юниту или тесту..."
          showFilters={showFilters}
          onToggleFilters={() => setShowFilters(!showFilters)}
          filters={
            <>
              {/* Status Filter */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Результат
                </label>
                <select
                  value={selectedStatus}
                  onChange={(e) => {
                    setSelectedStatus(e.target.value);
                    setPage(1); // Reset to first page when filter changes
                  }}
                  className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                >
                  <option value="">Все результаты</option>
                  <option value="passed">Пройдено</option>
                  <option value="failed">Не пройдено</option>
                </select>
              </div>
            </>
          }
        />

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
  <div className="overflow-x-auto">
    <table className="min-w-full divide-y divide-gray-200">
      <thead className="bg-gray-50">
        <tr>
          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
            {t('admin.grades.student')}
          </th>
          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
            {t('admin.grades.course')}
          </th>
          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
            {t('admin.grades.unit')}
          </th>
          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
            {t('admin.grades.test')}
          </th>
          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
            {t('admin.grades.score')}
          </th>
          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
            {t('admin.grades.result')}
          </th>
          <th
            onClick={() =>
              setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'))
            }            
            className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
          >
            <div className="flex items-center">
              {t('admin.grades.date')}
              {sortDir === 'asc' ? (
                <ChevronUp className="w-4 h-4 ml-1" />
              ) : (
                <ChevronDown className="w-4 h-4 ml-1" />
              )}
            </div>
          </th>
          <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider sticky right-0 bg-gray-50 z-10 border-l border-gray-200">
            {t('admin.grades.actions')}
          </th>
          
        </tr>
      </thead>

      <tbody className="bg-white divide-y divide-gray-200">
        {grades.map((g) => (
          <tr key={g.attempt_id} className="hover:bg-gray-50">
            <td className="px-6 py-4 whitespace-nowrap">
              <div className="text-sm font-medium text-gray-900">
                {g.student}
              </div>
            </td>

            <td className="px-6 py-4 whitespace-nowrap">
              <div className="text-sm font-semibold text-gray-900">
                {g.course}
              </div>
            </td>

            <td className="px-6 py-4 whitespace-nowrap">
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                {g.unit}
              </span>
            </td>

            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
              {g.test}
            </td>

            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
              {g.score} / {g.passing_score}
            </td>

            <td className="px-6 py-4 whitespace-nowrap">
              {getResultBadge(g.passed)}
            </td>

            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
              {g.submitted_at
                ? new Date(g.submitted_at).toLocaleDateString(i18n.language === 'ru' ? 'ru-RU' : 'en-US')
                : t('admin.grades.emptyAnswer')}
            </td>

            <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium sticky right-0 bg-white z-10 border-l border-gray-200">
              <button
                onClick={() => setSelectedAttempt(g.attempt_id)}
                className="text-primary-600 hover:text-primary-900"
                title={t('admin.grades.viewErrors')}
              >
                <Eye className="w-4 h-4" />
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
    <div className="flex items-center justify-between px-6 py-4 border-t">
  <span className="text-sm text-gray-600">
    {t('admin.grades.showing', {
      start: grades.length > 0 ? (page - 1) * pageSize + 1 : 0,
      end: Math.min(page * pageSize, total),
      total: total
    })}
  </span>

  <div className="flex space-x-2">
    <button
      disabled={page === 1}
      onClick={() => setPage(page - 1)}
      className="px-3 py-1 border rounded disabled:opacity-50"
    >
      ←
    </button>

    <button
      disabled={page * pageSize >= total || grades.length === 0}
      onClick={() => setPage(page + 1)}
      className="px-3 py-1 border rounded disabled:opacity-50"
    >
      →
    </button>
  </div>
</div>

  </div>

  {/* Empty State (same UX as students) */}
  {grades.length === 0 && (
    <div className="text-center py-12">
      <Users className="mx-auto h-12 w-12 text-gray-400" />
      <h3 className="mt-2 text-sm font-medium text-gray-900">
        {t('admin.grades.noGrades')}
      </h3>
      <p className="mt-1 text-sm text-gray-500">
        {t('admin.grades.noGradesDescription')}
      </p>
    </div>
  )}
  {/* Grade Details Modal */}
{detail && (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
    <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-gray-900">
          {t('admin.grades.testDetails')}
        </h2>
        <button
          onClick={closeModal}
          className="text-gray-400 hover:text-gray-600"
        >
          ✕
        </button>
      </div>
      <div className="mb-4 text-sm text-gray-600">
        Время: {detail.time_taken_seconds != null
          ? `${Math.floor(detail.time_taken_seconds / 60)}:${String(detail.time_taken_seconds % 60).padStart(2, '0')}`
          : '—'}
      </div>

      {/* Questions table */}
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                {t('admin.grades.question')}
              </th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                {t('admin.grades.studentAnswer')}
              </th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                {t('admin.grades.correctAnswer')}
              </th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                {t('admin.grades.result')}
              </th>
            </tr>
          </thead>

          <tbody className="divide-y divide-gray-200">
            {(Array.isArray(detail.detail) ? detail.detail : []).map((q: any) => {
              const correctIds = q.correct_answer?.correct_option_ids || [];
              const correctText = q.type === 'multiple_choice' && q.options
                ? q.options
                    .filter((opt: any) => correctIds.includes(opt.id))
                    .map((opt: any) => `${opt.id}. ${opt.text}`)
                    .join(', ')
                : q.type === 'open_answer'
                  ? q.correct_answer?.expected?.keywords?.map((kw: any) => kw.text).join(', ') || q.correct_answer?.expected?.pattern
                  : q.correct_answer?.gaps
                    ? q.correct_answer.gaps.map((g: any) => `${g.id}: ${g.answer}`).join(', ')
                    : '—';

              const studentAnswerText = (() => {
                if (q.type === 'multiple_choice' && q.options) {
                  const answerIds = Array.isArray(q.student_answer)
                    ? q.student_answer
                    : q.student_answer
                      ? [q.student_answer]
                      : [];
                  return answerIds
                    .map((id: string) => {
                      const opt = q.options.find((o: any) => o.id === id);
                      return opt ? `${opt.id}. ${opt.text}` : id;
                    })
                    .join(', ') || t('admin.grades.emptyAnswer');
                }
                if (q.type === 'cloze' && q.student_answer && typeof q.student_answer === 'object') {
                  return Object.entries(q.student_answer)
                    .map(([key, value]) => `${key}: ${value}`)
                    .join(', ') || t('admin.grades.emptyAnswer');
                }
                return String(q.student_answer ?? t('admin.grades.emptyAnswer'));
              })();

              return (
              <tr key={q.question_id}>
                <td className="px-4 py-2 text-sm text-gray-900">
                  <div className="font-medium">{t('admin.grades.questionNumber', { id: q.question_id })}</div>
                  {q.prompt && (
                    <div
                      className="text-xs text-gray-500 mt-1"
                      dangerouslySetInnerHTML={{ __html: q.prompt }}
                    />
                  )}
                </td>

                <td className="px-4 py-2 text-sm text-gray-900">
                  {studentAnswerText}
                </td>

                <td className="px-4 py-2 text-sm text-gray-900">
                  {correctText || t('admin.grades.emptyAnswer')}
                </td>

                <td className="px-4 py-2">
                  {q.is_correct ? (
                    <span className="text-green-600 font-medium">✔</span>
                  ) : (
                    <span className="text-red-600 font-medium">✘</span>
                  )}
                </td>
              </tr>
            );})}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      <div className="mt-6 text-right">
        <button
          onClick={closeModal}
          className="px-4 py-2 bg-gray-200 rounded-md hover:bg-gray-300"
        >
          {t('common.close')}
        </button>
      </div>
    </div>
  </div>
)}
        </div>
      </main>
    </div>
  );
}
