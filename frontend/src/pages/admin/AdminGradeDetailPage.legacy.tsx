import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Clock, CheckCircle, XCircle, FileText } from 'lucide-react';
import toast from 'react-hot-toast';
import { gradesApi } from '../../services/api';
import { useTranslation } from 'react-i18next';

export default function AdminGradeDetailPage() {
  const { t } = useTranslation();
  const { attemptId } = useParams<{ attemptId: string }>();
  const navigate = useNavigate();
  const [detail, setDetail] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!attemptId) return;
    
    setLoading(true);
    gradesApi.getGradeDetail(parseInt(attemptId))
      .then(setDetail)
      .catch((error) => {
        toast.error('Failed to load grade details');
        console.error(error);
      })
      .finally(() => setLoading(false));
  }, [attemptId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading grade details...</p>
        </div>
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <FileText className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-sm font-medium text-gray-900">Grade not found</h3>
          <button
            onClick={() => navigate('/admin/grades')}
            className="mt-4 text-primary-600 hover:text-primary-700"
          >
            Back to Grades
          </button>
        </div>
      </div>
    );
  }

  const correctCount = detail.detail?.filter((q: any) => q.is_correct).length || 0;
  const totalCount = detail.detail?.length || 0;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="sticky top-0 z-20 border-b bg-white/90 backdrop-blur">
        <div className="max-w-5xl mx-auto px-4 lg:px-8 py-4">
          <button
            onClick={() => navigate('/admin/grades')}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-3"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="text-sm font-medium">Back to Grades</span>
          </button>
          
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl md:text-2xl font-semibold text-gray-900">
                {t('admin.grades.testDetails')}
              </h1>
              <p className="mt-1 text-xs md:text-sm text-gray-500">
                Detailed test results and answers
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="max-w-5xl mx-auto px-4 lg:px-8 py-8 space-y-6">
        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Score Card */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary-100 rounded-lg">
                <FileText className="w-5 h-5 text-primary-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">Score</p>
                <p className="text-2xl font-bold text-gray-900">{Number(detail.score).toFixed(2)}%</p>
              </div>
            </div>
          </div>

          {/* Time Card */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Clock className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">Time Taken</p>
                <p className="text-2xl font-bold text-gray-900">
                  {detail.time_taken_seconds != null
                    ? `${Math.floor(detail.time_taken_seconds / 60)}:${String(detail.time_taken_seconds % 60).padStart(2, '0')}`
                    : '—'}
                </p>
              </div>
            </div>
          </div>

          {/* Results Card */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 rounded-lg">
                <CheckCircle className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">Correct Answers</p>
                <p className="text-2xl font-bold text-gray-900">
                  {correctCount} / {totalCount}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Questions List */}
        <div className="space-y-4">
          {(Array.isArray(detail.detail) ? detail.detail : []).map((q: any, index: number) => {
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
              <div
                key={q.question_id}
                className={`bg-white rounded-lg shadow-sm border-2 p-6 ${
                  q.is_correct ? 'border-green-200' : 'border-red-200'
                }`}
              >
                {/* Question Header */}
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <span className="flex items-center justify-center w-8 h-8 rounded-full bg-gray-100 text-sm font-semibold text-gray-700">
                      {index + 1}
                    </span>
                    <div>
                      <span className="text-xs text-gray-500">Question #{q.question_id}</span>
                      {q.type && (
                        <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                          {q.type.replace('_', ' ')}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {q.is_correct ? (
                      <>
                        <CheckCircle className="w-5 h-5 text-green-600" />
                        <span className="text-sm font-medium text-green-600">Correct</span>
                      </>
                    ) : (
                      <>
                        <XCircle className="w-5 h-5 text-red-600" />
                        <span className="text-sm font-medium text-red-600">Incorrect</span>
                      </>
                    )}
                  </div>
                </div>

                {/* Question Prompt */}
                {q.prompt && (
                  <div className="mb-4 pb-4 border-b border-gray-200">
                    <p className="text-sm font-medium text-gray-700 mb-2">Question:</p>
                    <div
                      className="text-gray-900 prose prose-sm max-w-none"
                      dangerouslySetInnerHTML={{ __html: q.prompt }}
                    />
                  </div>
                )}

                {/* Answer Details */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Student Answer */}
                  <div className={`rounded-lg p-4 ${q.is_correct ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
                    <p className="text-xs font-medium text-gray-600 mb-2">Student's Answer</p>
                    <p className={`text-sm font-medium ${q.is_correct ? 'text-green-900' : 'text-red-900'}`}>
                      {studentAnswerText}
                    </p>
                  </div>

                  {/* Correct Answer */}
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <p className="text-xs font-medium text-gray-600 mb-2">Correct Answer</p>
                    <p className="text-sm font-medium text-blue-900">
                      {correctText || t('admin.grades.emptyAnswer')}
                    </p>
                  </div>
                </div>

                {/* Points */}
                <div className="mt-4 pt-4 border-t border-gray-200">
                  <p className="text-xs text-gray-500">
                    Points: <span className="font-medium text-gray-700">{q.points_earned} / {q.points_possible}</span>
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
}
