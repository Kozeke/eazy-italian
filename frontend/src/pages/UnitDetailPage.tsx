/**
 * Unit Detail Page — Udemy/Coursera Style
 * 
 * Features:
 * - Sticky sidebar with progress
 * - Tabbed content (Videos/Tasks/Tests)
 * - Compact curriculum layout
 * - Mobile-responsive design
 */

import { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { unitsApi, coursesApi } from '../services/api';
import toast from 'react-hot-toast';
import VideoPlayer from '../components/VideoPlayer';

// Icons
const ArrowLeft = ({ className = "w-6 h-6" }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
  </svg>
);

const Play = ({ className = "w-6 h-6" }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

const CheckCircle = ({ className = "w-6 h-6" }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

const Circle = ({ className = "w-6 h-6" }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <circle cx="12" cy="12" r="9" strokeWidth={2} />
  </svg>
);

const FileText = ({ className = "w-6 h-6" }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
  </svg>
);

const BookOpen = ({ className = "w-6 h-6" }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
  </svg>
);

const Clock = ({ className = "w-6 h-6" }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

const ChevronRight = ({ className = "w-6 h-6" }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
  </svg>
);

const Lock = ({ className = "w-6 h-6" }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
  </svg>
);

interface Video {
  id: number;
  title: string;
  description?: string;
  duration?: string;
  duration_sec?: number;
  completed?: boolean;
  status?: string;
  order_index?: number;
  thumbnail_path?: string;
  source_type?: 'file' | 'url';
  external_url?: string;
  file_path?: string;
  attachments?: any[];
}

interface Task {
  id: number;
  title: string;
  maxScore?: number;
  completed?: boolean;
  status?: string;
  order_index?: number;
  type?: string;
}

interface Test {
  id: number;
  title: string;
  timeLimit?: number;
  time_limit_minutes?: number;
  passingScore?: number;
  passed?: boolean;
  status?: string;
  order_index?: number;
}

interface UnitData {
  id: number;
  title: string;
  description?: string;
  level: string;
  course_id?: number | null;
  videos: Video[];
  tasks: Task[];
  tests: Test[];
}

export default function UnitDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [unit, setUnit] = useState<UnitData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'videos' | 'tasks' | 'tests'>('videos');
  const [selectedVideo, setSelectedVideo] = useState<Video | null>(null);
  const [showMobileSidebar, setShowMobileSidebar] = useState(false);
  const [courseUnits, setCourseUnits] = useState<any[]>([]);

  // Format duration from seconds to MM:SS
  const formatDuration = (seconds?: number): string => {
    if (!seconds) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Load unit data from API
  useEffect(() => {
    const fetchUnit = async () => {
      if (!id) return;
      
      try {
        setLoading(true);
        const unitData = await unitsApi.getUnit(parseInt(id));
        
        // Transform API data to component format
        const transformedUnit: UnitData = {
          id: unitData.id,
          title: unitData.title,
          description: unitData.description || '',
          level: unitData.level,
          course_id: unitData.course_id || null,
          videos: (unitData.videos || [])
            .map((v: any) => ({
              id: v.id,
              title: v.title,
              description: v.description,
              duration: formatDuration(v.duration_sec),
              duration_sec: v.duration_sec,
              completed: v.completed || false,
              status: v.status,
              order_index: v.order_index,
              thumbnail_path: v.thumbnail_path,
              source_type: v.source_type,
              external_url: v.external_url,
              file_path: v.file_path,
              attachments: v.attachments || []
            }))
            .sort((a, b) => a.id - b.id), // Sort by ID (lowest first)
          tasks: (unitData.tasks || []).map((t: any) => ({
            id: t.id,
            title: t.title,
            maxScore: 10, // TODO: Load from task API
            completed: t.completed || false,
            status: t.status,
            order_index: t.order_index,
            type: t.type
          })),
          tests: (unitData.tests || []).map((test: any) => ({
            id: test.id,
            title: test.title,
            timeLimit: test.time_limit_minutes,
            time_limit_minutes: test.time_limit_minutes,
            passingScore: 70, // TODO: Load from test API
            passed: test.passed || false,
            status: test.status,
            order_index: test.order_index
          }))
        };
        
        setUnit(transformedUnit);
        
        // Load course units if unit belongs to a course
        if (transformedUnit.course_id) {
          try {
            const courseUnitsData = await coursesApi.getCourseUnits(transformedUnit.course_id);
            if (courseUnitsData && courseUnitsData.units) {
              setCourseUnits(courseUnitsData.units);
            }
          } catch (error) {
            console.error('Error loading course units:', error);
            // Non-critical, continue without course units
          }
        }
        
        if (transformedUnit.videos.length > 0) {
          // Check if a specific video ID is in the query parameters
          const videoIdParam = searchParams.get('video');
          if (videoIdParam) {
            const videoId = parseInt(videoIdParam);
            const foundVideo = transformedUnit.videos.find(v => v.id === videoId);
            if (foundVideo) {
              setSelectedVideo(foundVideo);
            } else {
              setSelectedVideo(transformedUnit.videos[0]);
            }
          } else {
            setSelectedVideo(transformedUnit.videos[0]);
          }
        }
      } catch (error: any) {
        console.error('Error fetching unit:', error);
        toast.error('Ошибка при загрузке юнита');
      } finally {
        setLoading(false);
      }
    };

    fetchUnit();
  }, [id, searchParams]);

  // Update selected video when query parameter changes
  useEffect(() => {
    if (unit && unit.videos.length > 0) {
      const videoIdParam = searchParams.get('video');
      if (videoIdParam) {
        const videoId = parseInt(videoIdParam);
        const foundVideo = unit.videos.find(v => v.id === videoId);
        if (foundVideo) {
          setSelectedVideo(foundVideo);
          setActiveTab('videos'); // Switch to videos tab when a video is selected
        }
      }
    }
  }, [searchParams, unit]);

  // Calculate progress
  const completedVideos = unit?.videos.filter(v => v.completed).length || 0;
  const completedTasks = unit?.tasks.filter(t => t.completed).length || 0;
  const passedTests = unit?.tests.filter(t => t.passed).length || 0;
  
  const totalItems = (unit?.videos.length || 0) + (unit?.tasks.length || 0) + (unit?.tests.length || 0);
  const completedItems = completedVideos + completedTasks + passedTests;
  const progressPercent = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;

  // Determine next action for continue learning button
  const getContinueLearningAction = () => {
    if (!unit) return null;

    const allVideosCompleted = unit.videos.length > 0 && completedVideos === unit.videos.length;
    const allTestsPassed = unit.tests.length > 0 && passedTests === unit.tests.length;

    // Find next uncompleted video (sorted by ID)
    if (!allVideosCompleted) {
      const nextVideo = unit.videos.find(v => !v.completed);
      if (nextVideo) {
        return {
          type: 'video' as const,
          label: 'Продолжить обучение',
          action: () => {
            const newSearchParams = new URLSearchParams(searchParams);
            newSearchParams.set('video', nextVideo.id.toString());
            navigate(`/units/${id}?${newSearchParams.toString()}`, { replace: true });
            setSelectedVideo(nextVideo);
            setActiveTab('videos');
          }
        };
      }
    }

    // If all videos completed, find next uncompleted test
    if (allVideosCompleted && !allTestsPassed) {
      const nextTest = unit.tests.find(t => !t.passed);
      if (nextTest) {
        return {
          type: 'test' as const,
          label: 'Перейти к тесту',
          action: () => {
            navigate(`/tests/${nextTest.id}`);
          }
        };
      }
    }

    // If all videos and tests completed, find next unit
    if (allVideosCompleted && (unit.tests.length === 0 || allTestsPassed)) {
      if (courseUnits.length > 0) {
        const currentUnitIndex = courseUnits.findIndex(u => u.id === unit.id);
        if (currentUnitIndex >= 0 && currentUnitIndex < courseUnits.length - 1) {
          const nextUnit = courseUnits[currentUnitIndex + 1];
          return {
            type: 'unit' as const,
            label: 'Следующий юнит',
            action: () => {
              navigate(`/units/${nextUnit.id}`);
            }
          };
        }
      }
    }

    // Default: continue with first video
    if (unit.videos.length > 0) {
      return {
        type: 'video' as const,
        label: 'Продолжить обучение',
        action: () => {
          const firstVideo = unit.videos[0];
          const newSearchParams = new URLSearchParams(searchParams);
          newSearchParams.set('video', firstVideo.id.toString());
          navigate(`/units/${id}?${newSearchParams.toString()}`, { replace: true });
          setSelectedVideo(firstVideo);
          setActiveTab('videos');
        }
      };
    }

    return null;
  };

  const continueAction = getContinueLearningAction();

  const getLevelBadge = (level: string) => {
    const colors = {
      A1: 'bg-purple-100 text-purple-700',
      A2: 'bg-blue-100 text-blue-700',
      B1: 'bg-green-100 text-green-700',
      B2: 'bg-yellow-100 text-yellow-700',
      C1: 'bg-orange-100 text-orange-700',
      C2: 'bg-red-100 text-red-700',
    };
    return (
      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${colors[level as keyof typeof colors]}`}>
        {level}
      </span>
    );
  };

  // Progress ring component
  const ProgressRing = ({ percent }: { percent: number }) => {
    const radius = 40;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (percent / 100) * circumference;

    return (
      <div className="relative w-24 h-24">
        <svg className="transform -rotate-90 w-24 h-24">
          <circle
            cx="48"
            cy="48"
            r={radius}
            stroke="currentColor"
            strokeWidth="6"
            fill="none"
            className="text-gray-200"
          />
          <circle
            cx="48"
            cy="48"
            r={radius}
            stroke="currentColor"
            strokeWidth="6"
            fill="none"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            className="text-indigo-600 transition-all duration-500"
            strokeLinecap="round"
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-xl font-bold text-gray-900">{percent}%</span>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  if (!unit) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Юнит не найден</h2>
          <button
            onClick={() => navigate('/units')}
            className="text-indigo-600 hover:text-indigo-700"
          >
            Вернуться к юнитам
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Back button */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <button
            onClick={() => {
              // Smart back navigation: if unit belongs to a course, go to course units page
              // Otherwise, go to my courses
              if (unit?.course_id) {
                navigate(`/courses/${unit.course_id}/units`);
              } else {
                navigate('/my-courses');
              }
            }}
            className="flex items-center text-sm text-gray-600 hover:text-gray-900"
          >
            <ArrowLeft className="w-4 h-4 mr-1" />
            {unit?.course_id ? 'Назад к курсу' : 'Назад к моим курсам'}
          </button>
          <button
            onClick={() => setShowMobileSidebar(!showMobileSidebar)}
            className="lg:hidden px-3 py-1.5 text-sm bg-indigo-600 text-white rounded-lg"
          >
            Прогресс
          </button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* MAIN CONTENT */}
          <div className="lg:col-span-2 space-y-6">
            {/* Hero */}
            <div className="bg-white rounded-xl shadow-sm overflow-hidden">
              <div className="bg-gradient-to-r from-indigo-600 to-indigo-700 text-white p-6">
                <div className="flex items-center gap-2 mb-3">
                  {getLevelBadge(unit.level)}
                  <span className="text-xs text-indigo-200">•</span>
                  <span className="text-xs text-indigo-200">
                    {unit.videos.length} видео • {unit.tasks.length} заданий • {unit.tests.length} тестов
                  </span>
                </div>
                <h1 className="text-2xl font-bold mb-2">{unit.title}</h1>
                {unit.description && (
                  <p className="text-sm text-indigo-100">{unit.description}</p>
                )}
              </div>
            </div>

            {/* Video Player */}
            {selectedVideo && (
              <div className="bg-white rounded-xl shadow-sm overflow-hidden">
                <div className="aspect-video bg-gray-900">
                  <VideoPlayer 
                    video={{
                      id: selectedVideo.id,
                      title: selectedVideo.title,
                      source_type: selectedVideo.source_type || 'url',
                      external_url: selectedVideo.external_url,
                      file_path: selectedVideo.file_path,
                      description: selectedVideo.description
                    }}
                    width="100%"
                    height="100%"
                    onProgressUpdate={(completed) => {
                      // Update selected video completion status
                      if (completed) {
                        setSelectedVideo(prev => prev ? { ...prev, completed: true } : null);
                        // Also update in unit.videos array
                        setUnit(prev => {
                          if (!prev) return prev;
                          return {
                            ...prev,
                            videos: prev.videos.map(v => 
                              v.id === selectedVideo.id ? { ...v, completed: true } : v
                            )
                          };
                        });
                        toast.success('Видео завершено! 🎉', { duration: 3000 });
                      }
                    }}
                  />
                </div>
                <div className="p-4 border-t border-gray-200">
                  <h2 className="text-lg font-semibold text-gray-900 mb-1">
                    {selectedVideo.title}
                  </h2>
                  {selectedVideo.description && (
                    <p className="text-sm text-gray-600 mb-2">{selectedVideo.description}</p>
                  )}
                  <div className="flex items-center gap-3 text-sm text-gray-500">
                    <span className="flex items-center gap-1">
                      <Clock className="w-4 h-4" />
                      {selectedVideo.duration || '0:00'}
                    </span>
                    {selectedVideo.completed && (
                      <span className="flex items-center gap-1 text-green-600">
                        <CheckCircle className="w-4 h-4" />
                        Просмотрено
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Tabs */}
            <div className="bg-white rounded-xl shadow-sm overflow-hidden">
              <div className="border-b border-gray-200">
                <div className="flex">
                  <button
                    onClick={() => setActiveTab('videos')}
                    className={`flex-1 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                      activeTab === 'videos'
                        ? 'border-indigo-600 text-indigo-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    <Play className="w-4 h-4 inline mr-1" />
                    Видео ({unit.videos.length})
                  </button>
                  <button
                    onClick={() => setActiveTab('tasks')}
                    className={`flex-1 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                      activeTab === 'tasks'
                        ? 'border-indigo-600 text-indigo-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    <FileText className="w-4 h-4 inline mr-1" />
                    Задания ({unit.tasks.length})
                  </button>
                  <button
                    onClick={() => setActiveTab('tests')}
                    className={`flex-1 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                      activeTab === 'tests'
                        ? 'border-indigo-600 text-indigo-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    <BookOpen className="w-4 h-4 inline mr-1" />
                    Тесты ({unit.tests.length})
                  </button>
                </div>
              </div>

              <div className="p-4">
                {/* Videos Tab */}
                {activeTab === 'videos' && (
                  <div className="space-y-2">
                    {unit.videos.length === 0 ? (
                      <p className="text-sm text-gray-500 text-center py-4">Нет видео</p>
                    ) : (
                      unit.videos.map((video: Video, index: number) => {
                        // Check if previous video is completed (first video is always unlocked)
                        const isUnlocked = index === 0 || (index > 0 && unit.videos[index - 1].completed);
                        
                        return (
                          <button
                            key={video.id}
                            onClick={() => {
                              if (!isUnlocked) return; // Prevent click if locked
                              // Update URL with video ID
                              const newSearchParams = new URLSearchParams(searchParams);
                              newSearchParams.set('video', video.id.toString());
                              navigate(`/units/${id}?${newSearchParams.toString()}`, { replace: true });
                              // Set selected video (will be updated by useEffect when URL changes)
                              setSelectedVideo(video);
                            }}
                            disabled={!isUnlocked}
                            className={`w-full text-left p-3 rounded-lg border transition-colors ${
                              !isUnlocked
                                ? 'border-gray-200 bg-gray-50 opacity-60 cursor-not-allowed'
                                : selectedVideo?.id === video.id
                                ? 'border-indigo-500 bg-indigo-50'
                                : 'border-gray-200 hover:border-indigo-200 hover:bg-gray-50'
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <div className="flex-shrink-0">
                                {!isUnlocked ? (
                                  <Lock className="w-6 h-6 text-gray-400" />
                                ) : video.completed ? (
                                  <CheckCircle className="w-6 h-6 text-green-500" />
                                ) : (
                                  <Circle className="w-6 h-6 text-gray-300" />
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className={`text-sm font-medium ${
                                  !isUnlocked ? 'text-gray-400' : 'text-gray-900'
                                }`}>
                                  {index + 1}. {video.title}
                                </p>
                                <p className={`text-xs ${
                                  !isUnlocked ? 'text-gray-400' : 'text-gray-500'
                                }`}>
                                  {video.duration || '0:00'}
                                </p>
                              </div>
                              {isUnlocked && (
                                <ChevronRight className="w-4 h-4 text-gray-400" />
                              )}
                            </div>
                          </button>
                        );
                      })
                    )}
                  </div>
                )}

                {/* Tasks Tab */}
                {activeTab === 'tasks' && (
                  <div className="space-y-2">
                    {unit.tasks.length === 0 ? (
                      <p className="text-sm text-gray-500 text-center py-4">Нет заданий</p>
                    ) : (
                      unit.tasks.map((task: Task, index: number) => (
                        <button
                          key={task.id}
                          onClick={() => navigate(`/tasks/${task.id}`)}
                          className="w-full text-left p-3 rounded-lg border border-gray-200 hover:border-indigo-200 hover:bg-gray-50 transition-colors"
                        >
                          <div className="flex items-center gap-3">
                            <div className="flex-shrink-0 w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
                              <span className="text-sm font-semibold text-green-600">
                                {index + 1}
                              </span>
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-900">{task.title}</p>
                              {task.maxScore && (
                                <p className="text-xs text-gray-500">{task.maxScore} баллов</p>
                              )}
                            </div>
                            {task.completed && (
                              <CheckCircle className="w-5 h-5 text-green-500" />
                            )}
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                )}

                {/* Tests Tab */}
                {activeTab === 'tests' && (
                  <div className="space-y-2">
                    {unit.tests.length === 0 ? (
                      <p className="text-sm text-gray-500 text-center py-4">Нет тестов</p>
                    ) : (
                      unit.tests.map((test: Test, index: number) => (
                        <button
                          key={test.id}
                          onClick={() => navigate(`/tests/${test.id}`)}
                          className="w-full text-left p-3 rounded-lg border border-gray-200 hover:border-indigo-200 hover:bg-gray-50 transition-colors"
                        >
                          <div className="flex items-center gap-3">
                            <div className="flex-shrink-0 w-8 h-8 bg-purple-100 rounded-full flex items-center justify-center">
                              <span className="text-sm font-semibold text-purple-600">
                                {index + 1}
                              </span>
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-900">{test.title}</p>
                              <p className="text-xs text-gray-500">
                                {test.timeLimit || test.time_limit_minutes || 0} минут
                                {test.passingScore && ` • Проходной балл: ${test.passingScore}%`}
                              </p>
                            </div>
                            {test.passed && (
                              <CheckCircle className="w-5 h-5 text-green-500" />
                            )}
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* SIDEBAR */}
          <div className={`lg:block ${showMobileSidebar ? 'block' : 'hidden'} lg:sticky lg:top-20 lg:self-start`}>
            <div className="bg-white rounded-xl shadow-sm overflow-hidden">
              {/* Progress Section */}
              <div className="p-6 border-b border-gray-200">
                <h3 className="text-sm font-medium text-gray-900 mb-4">Ваш прогресс</h3>
                <div className="flex justify-center mb-4">
                  <ProgressRing percent={progressPercent} />
                </div>
                <div className="space-y-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600">Видео</span>
                    <span className="font-medium text-gray-900">
                      {completedVideos} / {unit.videos.length}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600">Задания</span>
                    <span className="font-medium text-gray-900">
                      {completedTasks} / {unit.tasks.length}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600">Тесты</span>
                    <span className="font-medium text-gray-900">
                      {passedTests} / {unit.tests.length}
                    </span>
                  </div>
                </div>
              </div>

              {/* Quick Actions */}
              <div className="p-6 space-y-3">
                {continueAction ? (
                  <button 
                    onClick={continueAction.action}
                    className="w-full px-4 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
                  >
                    {continueAction.label}
                  </button>
                ) : (
                  <button 
                    disabled
                    className="w-full px-4 py-2.5 bg-gray-300 text-gray-500 text-sm font-medium rounded-lg cursor-not-allowed"
                  >
                    Нет доступного контента
                  </button>
                )}
                {/* <button className="w-full px-4 py-2.5 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors">
                  Сбросить прогресс
                </button> */}
              </div>

              {/* Tips */}
              <div className="p-6 bg-indigo-50 border-t border-indigo-100">
                <h4 className="text-sm font-medium text-indigo-900 mb-2">💡 Совет</h4>
                <p className="text-xs text-indigo-700">
                  Старайтесь заниматься каждый день по 15-20 минут для лучшего результата!
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}