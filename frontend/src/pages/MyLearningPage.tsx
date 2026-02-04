/**
 * My Courses Page
 * 
 * Shows only enrolled courses with progress bars and Continue buttons.
 * Displays the user's personal learning dashboard.
 */

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { BookOpen, ArrowRight } from 'lucide-react';
import { coursesApi } from '../services/api';
import toast from 'react-hot-toast';

interface EnrolledCourse {
  id: number;
  title: string;
  description?: string;
  level: string;
  thumbnail_url?: string;
  thumbnail_path?: string;
  units_count: number;
  published_units_count: number;
  progress_percent: number;
  completed_units: number;
  last_accessed_at?: string;
}

export default function MyLearningPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [courses, setCourses] = useState<EnrolledCourse[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchEnrolledCourses = async () => {
      try {
        setLoading(true);
        const enrolledCourses = await coursesApi.getEnrolledCourses();
        setCourses(enrolledCourses);
      } catch (error: any) {
        console.error('Error fetching enrolled courses:', error);
        toast.error('Ошибка при загрузке курсов');
        setCourses([]);
      } finally {
        setLoading(false);
      }
    };

    fetchEnrolledCourses();
  }, []);

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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Hero Section */}
      <div className="bg-gradient-to-r from-primary-600 to-primary-700 text-white rounded-2xl px-6 py-6 md:px-8 md:py-7 shadow-lg">
        <div>
          <p className="inline-flex items-center px-3 py-1 rounded-full bg-white/15 text-xs font-semibold mb-2 uppercase tracking-wide">
            {t('myCourses.badge') || 'My Courses'}
          </p>
          <h1 className="text-2xl md:text-3xl font-bold leading-tight">
            {t('myCourses.title') || 'My Courses'}
          </h1>
          <p className="mt-2 text-sm md:text-base text-primary-100 max-w-xl">
            {t('myCourses.subtitle') ||
              'Continue your learning journey. All your enrolled courses in one place.'}
          </p>
        </div>
      </div>

      {/* Enrolled Courses */}
      {courses.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {courses.map((course) => {
            const apiBase = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api/v1';
            let thumbnailUrl = '/placeholder-course.jpg';
            
            if (course.thumbnail_url) {
              thumbnailUrl = course.thumbnail_url;
            } else if (course.thumbnail_path) {
              const thumbnailFilename = course.thumbnail_path.split('/').pop();
              thumbnailUrl = `${apiBase}/static/thumbnails/${thumbnailFilename}`;
            }

            return (
              <div
                key={course.id}
                className="bg-white rounded-2xl border border-gray-200 hover:border-primary-200 overflow-hidden transition-all duration-200 flex flex-col shadow-sm"
              >
                {/* Course Thumbnail */}
                <div className="h-40 bg-gradient-to-r from-primary-600 to-primary-500 flex items-center justify-center relative overflow-hidden">
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
                    <div className="w-16 h-16 rounded-full border border-white/30 bg-white/10 flex items-center justify-center">
                      <BookOpen className="w-8 h-8 text-white" />
                    </div>
                  </div>
                </div>

                {/* Course Content */}
                <div className="p-5 flex-1 flex flex-col">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <h3 className="text-base font-semibold text-gray-900 line-clamp-2 flex-1">
                      {course.title}
                    </h3>
                    {course.level && getLevelBadge(course.level)}
                  </div>

                  {/* Progress Bar */}
                  <div className="mb-4">
                    <div className="flex items-center justify-between text-xs text-gray-600 mb-1">
                      <span>Progress</span>
                      <span className="font-semibold">{course.progress_percent}%</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-primary-600 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${course.progress_percent}%` }}
                      />
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      {course.completed_units} of {course.published_units_count} units completed
                    </div>
                  </div>

                  {/* Continue Button */}
                  <button
                    onClick={() => navigate(`/courses/${course.id}/units`)}
                    className="mt-auto w-full py-2.5 px-4 rounded-lg bg-primary-600 hover:bg-primary-700 text-white font-medium text-sm transition-colors flex items-center justify-center gap-2"
                  >
                    <span>Continue</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="text-center py-12 bg-white rounded-2xl border border-dashed border-gray-300">
          <div className="mx-auto h-12 w-12 text-gray-400 mb-3">
            <BookOpen className="h-12 w-12" />
          </div>
          <h3 className="mt-1 text-sm font-medium text-gray-900">
            {t('learning.noCourses') || 'Нет записанных курсов'}
          </h3>
          <p className="mt-1 text-sm text-gray-500 mb-4">
            {t('learning.noCoursesDescription') ||
              'Запишитесь на курс, чтобы начать обучение.'}
          </p>
          <button
            onClick={() => navigate('/courses')}
            className="inline-flex items-center px-4 py-2 rounded-lg bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium transition-colors"
          >
            Browse Courses
            <ArrowRight className="w-4 h-4 ml-2" />
          </button>
        </div>
      )}
    </div>
  );
}
