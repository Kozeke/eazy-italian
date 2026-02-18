import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft,
  BookOpen,
  Clock,
  Lock,
  User,
  Target,
  CheckCircle2,
  FileText
} from 'lucide-react';
import { coursesApi } from '../services/api';
import toast from 'react-hot-toast';

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
  duration_hours?: number;
  instructor_name?: string;
  is_enrolled?: boolean;
  user_subscription?: string;
  enrolled_courses_count?: number;
  learning_outcomes?: string[];
  content_summary?: {
    total_videos: number;
    total_tasks: number;
    total_tests: number;
  };
  units?: Array<{
    id: number;
    title: string;
    level: string;
    status: string;
    order_index: number;
    content_count?: {
      videos: number;
      tasks: number;
      tests: number;
    };
  }>;
}

export default function CourseDetailPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [course, setCourse] = useState<Course | null>(null);
  const [loading, setLoading] = useState(true);
  const [enrolling, setEnrolling] = useState(false);

  useEffect(() => {
    const fetchCourse = async () => {
      if (!id) return;
      
      try {
        setLoading(true);
        const courseData = await coursesApi.getCourse(parseInt(id));
        setCourse(courseData);
      } catch (error: any) {
        console.error('Error fetching course:', error);
        toast.error(t('courses.errorLoading') || 'Ошибка при загрузке курса');
        navigate('/courses');
      } finally {
        setLoading(false);
      }
    };

    fetchCourse();
  }, [id, navigate, t]);

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

  const handleEnroll = async () => {
    if (!course || !id) return;

    const subscription = course.user_subscription || 'free';
    const isEnrolled = course.is_enrolled || false;
    const enrolledCount = course.enrolled_courses_count || 0;
    const isFreeUser = subscription === 'free';

    // If free user already enrolled in 1 course, show upgrade message
    if (isFreeUser && enrolledCount >= 1 && !isEnrolled) {
      toast.error('Please upgrade to Premium to enroll in more courses');
      // TODO: Navigate to upgrade/subscription page when available
      return;
    }

    try {
      setEnrolling(true);
      await coursesApi.enrollInCourse(parseInt(id));
      toast.success(`Successfully enrolled in ${course.title}`);
      
      // Refresh course data to update enrollment status
      const courseData = await coursesApi.getCourse(parseInt(id));
      setCourse(courseData);
    } catch (error: any) {
      console.error('Error enrolling in course:', error);
      const errorMessage = error.response?.data?.detail || 'Failed to enroll in course';
      toast.error(errorMessage);
    } finally {
      setEnrolling(false);
    }
  };

  const handleStartLearning = () => {
    if (!course || !course.units || course.units.length === 0) return;
    // Navigate to first unit
    navigate(`/units/${course.units[0].id}`);
  };

  const getButtonText = () => {
    if (!course) return '';
    
    const subscription = course.user_subscription || 'free';
    const isEnrolled = course.is_enrolled || false;
    const enrolledCount = course.enrolled_courses_count || 0;
    const isFreeUser = subscription === 'free';

    if (isEnrolled) {
      return 'Start Learning';
    }

    if (isFreeUser && enrolledCount >= 1) {
      return 'Upgrade to Premium';
    }

    if (isFreeUser) {
      return 'Enroll (1 free course)';
    }

    return 'Enroll / Start Learning';
  };

  const handleButtonClick = () => {
    if (!course) return;

    const subscription = course.user_subscription || 'free';
    const isEnrolled = course.is_enrolled || false;
    const enrolledCount = course.enrolled_courses_count || 0;
    const isFreeUser = subscription === 'free';

    if (isEnrolled) {
      handleStartLearning();
    } else if (isFreeUser && enrolledCount >= 1) {
      toast.error('Please upgrade to Premium to enroll in more courses');
      // TODO: Navigate to upgrade/subscription page when available
    } else {
      handleEnroll();
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (!course) {
    return null;
  }

  const apiBase = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api/v1';
  let thumbnailUrl = '/placeholder-course.jpg';
  
  if (course.thumbnail_url) {
    thumbnailUrl = course.thumbnail_url;
  } else if (course.thumbnail_path) {
    const thumbnailFilename = course.thumbnail_path.split('/').pop();
    thumbnailUrl = `${apiBase}/static/thumbnails/${thumbnailFilename}`;
  }

  const isEnrolled = course.is_enrolled || false;
  const subscription = course.user_subscription || 'free';
  const enrolledCount = course.enrolled_courses_count || 0;
  const isFreeUser = subscription === 'free';
  const showUpgradeButton = isFreeUser && enrolledCount >= 1 && !isEnrolled;

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-20">
      {/* Back Button */}
      <button
        onClick={() => navigate('/courses')}
        className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        <span className="text-sm font-medium">{t('common.back') || 'Назад к курсам'}</span>
      </button>

      {/* Course Header */}
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        {/* Thumbnail */}
        <div className="h-64 bg-gradient-to-r from-primary-600 to-primary-500 flex items-center justify-center relative overflow-hidden">
          {thumbnailUrl && thumbnailUrl !== '/placeholder-course.jpg' ? (
            <img
              src={thumbnailUrl}
              alt={course.title}
              className="w-full h-full object-cover"
              onError={(e) => {
                const target = e.target as HTMLImageElement;
                target.style.display = 'none';
                if (target.nextElementSibling) {
                  (target.nextElementSibling as HTMLElement).style.display = 'flex';
                }
              }}
            />
          ) : null}
          <div 
            className={`w-full h-full flex items-center justify-center ${thumbnailUrl && thumbnailUrl !== '/placeholder-course.jpg' ? 'hidden' : ''}`}
            style={{ display: thumbnailUrl && thumbnailUrl !== '/placeholder-course.jpg' ? 'none' : 'flex' }}
          >
            <div className="w-20 h-20 rounded-full border border-white/30 bg-white/10 flex items-center justify-center">
              <BookOpen className="w-10 h-10 text-white" />
            </div>
          </div>
        </div>

        {/* Course Info */}
        <div className="p-6">
          <div className="flex items-start justify-between gap-4 mb-4">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-3">
                {course.level && getLevelBadge(course.level)}
                {course.duration_hours && (
                  <div className="flex items-center gap-1 text-sm text-gray-500">
                    <Clock className="w-4 h-4" />
                    <span>{course.duration_hours} {t('courses.hours') || 'часов'}</span>
                  </div>
                )}
              </div>
              <h1 className="text-2xl md:text-3xl font-bold text-gray-900 mb-4">
                {course.title}
              </h1>
            </div>
          </div>

          {/* Description */}
          {course.description && (
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-gray-900 mb-2">Description</h3>
              <div 
                className="text-gray-600 leading-relaxed prose prose-sm max-w-none"
                dangerouslySetInnerHTML={{ __html: course.description }}
              />
            </div>
          )}

          {/* Instructor */}
          {course.instructor_name && (
            <div className="mb-6 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center">
                <User className="w-5 h-5 text-primary-600" />
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-0.5">Instructor</p>
                <p className="text-sm font-medium text-gray-900">{course.instructor_name}</p>
              </div>
            </div>
          )}

          {/* Learning Outcomes */}
          {course.learning_outcomes && course.learning_outcomes.length > 0 && (
            <div className="mb-6">
              <div className="flex items-center gap-2 mb-3">
                <Target className="w-5 h-5 text-primary-600" />
                <h3 className="text-sm font-semibold text-gray-900">Learning Outcomes</h3>
              </div>
              <ul className="space-y-2">
                {course.learning_outcomes.map((outcome, index) => (
                  <li key={index} className="flex items-start gap-2 text-sm text-gray-600">
                    <CheckCircle2 className="w-4 h-4 text-primary-600 mt-0.5 flex-shrink-0" />
                    <span>{outcome}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Stats */}
          <div className="flex items-center gap-6 pt-4 border-t border-gray-200">
            <div className="flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-primary-600" />
              <span className="text-sm text-gray-600">
                <strong className="font-semibold text-gray-900">{course.published_units_count || course.units_count}</strong>{' '}
                {t('courses.units') || 'юнитов'}
              </span>
            </div>
            {course.content_summary && course.content_summary.total_tests > 0 && (
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-primary-600" />
                <span className="text-sm text-gray-600">
                  <strong className="font-semibold text-gray-900">{course.content_summary.total_tests}</strong>{' '}
                  {course.content_summary.total_tests === 1 ? 'тест' : course.content_summary.total_tests < 5 ? 'теста' : 'тестов'}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Units List - All Locked */}
      {course.units && course.units.length > 0 ? (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">
            {t('courses.units') || 'Course Units'}
          </h2>
          <div className="space-y-3">
            {course.units.map((unit, index) => (
              <div
                key={unit.id}
                className={`bg-white rounded-xl border border-gray-200 p-5 ${
                  isEnrolled 
                    ? 'hover:border-primary-200 hover:shadow-md transition-all duration-200 cursor-pointer' 
                    : 'opacity-75'
                }`}
                onClick={() => {
                  if (isEnrolled) {
                    navigate(`/units/${unit.id}`);
                  }
                }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 flex-1">
                    <div className="flex items-center justify-center w-8 h-8 rounded-full bg-gray-100 text-gray-600 font-semibold text-sm flex-shrink-0">
                      {unit.order_index || index + 1}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-base font-semibold text-gray-900">
                          {unit.title}
                        </h3>
                        {!isEnrolled && (
                          <Lock className="w-4 h-4 text-gray-400 flex-shrink-0" />
                        )}
                      </div>
                      {index === 0 && !isEnrolled && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-800">
                          Preview
                        </span>
                      )}
                    </div>
                  </div>
                  {unit.level && getLevelBadge(unit.level)}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-dashed border-gray-300 p-8 text-center">
          <BookOpen className="w-12 h-12 text-gray-400 mx-auto mb-3" />
          <h3 className="text-sm font-medium text-gray-900 mb-1">
            {t('courses.noUnits') || 'Нет доступных юнитов'}
          </h3>
          <p className="text-sm text-gray-500">
            {t('courses.noUnitsDescription') || 'В этом курсе пока нет опубликованных юнитов.'}
          </p>
        </div>
      )}

      {/* Bottom CTA Button - Fixed at bottom, aligned to content column */}
      <div className="fixed bottom-0 left-0 lg:left-64 right-0 bg-white border-t border-gray-200 shadow-lg z-50">
        <div className="py-4 px-4 sm:px-6 lg:px-8">
          <button
            onClick={handleButtonClick}
            disabled={enrolling}
            className={`w-full py-3 px-6 rounded-lg text-base font-semibold transition-colors ${
              showUpgradeButton
                ? 'bg-yellow-500 hover:bg-yellow-600 text-white'
                : 'bg-primary-600 hover:bg-primary-700 text-white'
            } disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            {enrolling ? (
              <span className="flex items-center justify-center gap-2">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                Enrolling...
              </span>
            ) : (
              <>
                {showUpgradeButton && <Lock className="w-4 h-4 inline mr-2" />}
                {getButtonText()}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}