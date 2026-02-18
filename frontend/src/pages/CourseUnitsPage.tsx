/**
 * Course Units Page — Udemy/Coursera Style
 * 
 * Features:
 * - Accordion-style expandable units
 * - Course progress tracking
 * - Compact content counters
 * - Visual completion indicators
 * - Mobile-responsive design
 */

import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { coursesApi, unitsApi } from '../services/api';
import toast from 'react-hot-toast';
import { Link } from 'react-router-dom';

// Icons
const ArrowLeft = ({ className = "w-6 h-6" }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
  </svg>
);

const ArrowRight = ({ className = "w-6 h-6" }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
  </svg>
);

const Play = ({ className = "w-6 h-6" }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

const FileText = ({ className = "w-6 h-6" }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
  </svg>
);

const ClipboardCheck = ({ className = "w-6 h-6" }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
  </svg>
);

const CheckCircle = ({ className = "w-6 h-6" }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

const ChevronDown = ({ className = "w-6 h-6" }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
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

const Clock = ({ className = "w-6 h-6" }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

interface Course {
  id: number;
  title: string;
  description?: string;
  level: string;
}

interface Unit {
  id: number;
  title: string;
  level: string;
  order_index: number;
  content_count?: {
    videos: number;
    tasks: number;
    tests: number;
  };
}

interface UnitContent {
  videos: any[];
  tasks: any[];
  tests: any[];
}

export default function CourseUnitsPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [course, setCourse] = useState<Course | null>(null);
  const [units, setUnits] = useState<Unit[]>([]);
  const [unitContent, setUnitContent] = useState<Record<number, UnitContent>>({});
  const [expandedUnits, setExpandedUnits] = useState<Record<number, boolean>>({});
  const [loading, setLoading] = useState(true);
  const unitRefs = useRef<Record<number, HTMLDivElement | null>>({});

  useEffect(() => {
    const fetchData = async () => {
      if (!id) return;
      
      try {
        setLoading(true);
        
        // Get course info
        const courseData = await coursesApi.getCourse(parseInt(id));
        setCourse({
          id: courseData.id,
          title: courseData.title,
          description: courseData.description,
          level: courseData.level
        });
        
        // Get units for this course
        const unitsData = await coursesApi.getCourseUnits(parseInt(id));
        if (unitsData && unitsData.units) {
          // Sort by order_index if available, otherwise by id
          const fetchedUnits = unitsData.units.sort((a: Unit, b: Unit) => 
            (a.order_index || 0) - (b.order_index || 0) || a.id - b.id
          );
          setUnits(fetchedUnits);
          
          // Don't expand units here - we'll do it after content is loaded
          
          // Fetch content for each unit using single request per unit
          const contentMap: Record<number, UnitContent> = {};
          
          // Fetch all units in parallel for better performance
          const unitPromises = fetchedUnits.map(async (unit: Unit) => {
            try {
              const unitDetail = await unitsApi.getUnit(unit.id);
              return {
                unitId: unit.id,
                content: {
                  videos: unitDetail.videos || [],
                  tasks: unitDetail.tasks || [],
                  tests: unitDetail.tests || []
                }
              };
            } catch (error) {
              console.error(`Error loading content for unit ${unit.id}:`, error);
              return {
                unitId: unit.id,
                content: { videos: [], tasks: [], tests: [] }
              };
            }
          });
          
          const unitResults = await Promise.all(unitPromises);
          unitResults.forEach(({ unitId, content }) => {
            contentMap[unitId] = content;
          });
          
          setUnitContent(contentMap);
        }
      } catch (error: any) {
        console.error('Error fetching course data:', error);
        toast.error('Ошибка при загрузке курса');
        navigate('/my-courses');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [id, navigate]);

  const toggleUnit = (unitId: number) => {
    setExpandedUnits((prev: Record<number, boolean>) => ({
      ...prev,
      [unitId]: !prev[unitId]
    }));
  };

  // Check if a unit is completed based on videos, tasks, and tests
  const isUnitCompleted = (unitId: number): boolean => {
    const content = unitContent[unitId];
    if (!content) return false;

    const { videos, tasks, tests } = content;
    
    // Count existing components
    const hasVideos = videos.length > 0;
    const hasTasks = tasks.length > 0;
    const hasTests = tests.length > 0;
    
    // If unit has no content at all, consider it not completed
    if (!hasVideos && !hasTasks && !hasTests) {
      return false;
    }

    // Check if all videos are completed (if videos exist)
    const allVideosCompleted = !hasVideos || videos.every((v: any) => v.completed === true);

    // Check if all tasks are completed (if tasks exist)
    const allTasksCompleted = !hasTasks || tasks.every((t: any) => t.completed === true);

    // Check if all tests are passed (if tests exist)
    const allTestsPassed = !hasTests || tests.every((t: any) => t.passed === true);

    // Unit is completed if all existing components are completed
    // If unit has only videos, it's completed when all videos are watched
    // If unit has videos + tasks + tests, all must be completed
    return allVideosCompleted && allTasksCompleted && allTestsPassed;
  };

  // Check if previous unit's test is passed (required to unlock current unit's videos/tests)
  const isPreviousUnitTestPassed = (unitIndex: number): boolean => {
    // First unit is always unlocked
    if (unitIndex === 0) return true;
    
    // Check previous unit
    const previousUnit = units[unitIndex - 1];
    if (!previousUnit) return true;
    
    const previousContent = unitContent[previousUnit.id];
    if (!previousContent) return true;
    
    const { tests } = previousContent;
    
    // If previous unit has no tests, consider it passed (unlock next unit)
    if (tests.length === 0) return true;
    
    // Check if at least one test in previous unit is passed
    return tests.some((t: any) => t.passed === true);
  };

  // Find the next incomplete unit
  const findNextIncompleteUnit = (): number | null => {
    for (const unit of units) {
      if (!isUnitCompleted(unit.id)) {
        return unit.id;
      }
    }
    return null;
  };

  // Find the next activity (video, task, or test) that student needs to do
  const findNextActivity = (): { type: 'video' | 'task' | 'test' | null; unit: Unit | null; activity: any; unitIndex: number } | null => {
    for (let i = 0; i < units.length; i++) {
      const unit = units[i];
      const content = unitContent[unit.id];
      if (!content) continue;

      const { videos, tasks, tests } = content;

      // Check videos first (they usually come first in order)
      if (videos.length > 0) {
        // Helper function to check if a video is a YouTube link
        const isYouTubeVideo = (v: any): boolean => {
          if (!v || v.source_type !== 'url' || !v.external_url) {
            return false;
          }
          const url = v.external_url.toLowerCase();
          return url.includes('youtube.com') || url.includes('youtu.be');
        };
        
        // Sort videos by order_index
        const sortedVideos = [...videos].sort((a: any, b: any) => 
          (a.order_index || 0) - (b.order_index || 0)
        );
        
        for (const video of sortedVideos) {
          // Check if all previous non-YouTube videos are completed
          // YouTube videos don't block next videos
          const videoIndex = sortedVideos.indexOf(video);
          const previousVideos = sortedVideos.slice(0, videoIndex);
          const previousNonYouTubeVideos = previousVideos.filter((v: any) => !isYouTubeVideo(v));
          const allPreviousCompleted = previousNonYouTubeVideos.length === 0 || 
            previousNonYouTubeVideos.every((v: any) => v.completed === true);
          
          if (!video.completed && allPreviousCompleted) {
            return { type: 'video', unit, activity: video, unitIndex: i };
          }
        }
      }

      // Check tasks (after videos)
      if (tasks.length > 0) {
        // Sort tasks by order_index
        const sortedTasks = [...tasks].sort((a: any, b: any) => 
          (a.order_index || 0) - (b.order_index || 0)
        );
        
        for (const task of sortedTasks) {
          if (!task.completed) {
            // Check if all videos in this unit are completed first
            const allVideosCompleted = videos.length === 0 || 
              videos.every((v: any) => v.completed === true);
            
            if (allVideosCompleted) {
              return { type: 'task', unit, activity: task, unitIndex: i };
            }
          }
        }
      }

      // Check tests (after videos and tasks)
      if (tests.length > 0) {
        // Sort tests by order_index
        const sortedTests = [...tests].sort((a: any, b: any) => 
          (a.order_index || 0) - (b.order_index || 0)
        );
        
        for (const test of sortedTests) {
          if (!test.passed) {
            // Check if all videos and tasks in this unit are completed first
            const allVideosCompleted = videos.length === 0 || 
              videos.every((v: any) => v.completed === true);
            const allTasksCompleted = tasks.length === 0 || 
              tasks.every((t: any) => t.completed === true);
            
            if (allVideosCompleted && allTasksCompleted) {
              return { type: 'test', unit, activity: test, unitIndex: i };
            }
          }
        }
      }
    }
    
    return null;
  };

  // Auto-expand next incomplete unit (without scrolling)
  useEffect(() => {
    // Wait for content to be loaded
    if (loading || units.length === 0 || Object.keys(unitContent).length === 0) {
      return;
    }

    // Wait a bit more to ensure all units are rendered
    const timer = setTimeout(() => {
      const nextIncompleteUnitId = findNextIncompleteUnit();
      
      if (nextIncompleteUnitId) {
        // Expand the unit
        setExpandedUnits((prev) => ({
          ...prev,
          [nextIncompleteUnitId]: true
        }));
      } else {
        // If all units are completed, expand the first unit
        if (units.length > 0) {
          setExpandedUnits((prev) => ({
            ...prev,
            [units[0].id]: true
          }));
        }
      }
    }, 100);

    return () => clearTimeout(timer);
  }, [loading, units, unitContent]);

  // Calculate statistics from unitContent
  const calculateStatistics = () => {
    let totalVideos = 0;
    let completedVideos = 0;
    let totalTasks = 0;
    let completedTasks = 0;
    let totalTests = 0;
    let passedTests = 0;

    Object.values(unitContent).forEach((content: UnitContent) => {
      // Videos
      totalVideos += content.videos.length;
      completedVideos += content.videos.filter((v: any) => v.completed).length;

      // Tasks
      totalTasks += content.tasks.length;
      completedTasks += content.tasks.filter((t: any) => t.completed).length;

      // Tests
      totalTests += content.tests.length;
      passedTests += content.tests.filter((t: any) => t.passed).length;
    });

    return {
      videos: { completed: completedVideos, total: totalVideos },
      tasks: { completed: completedTasks, total: totalTasks },
      tests: { passed: passedTests, total: totalTests }
    };
  };

  const stats = calculateStatistics();

  const getLevelBadge = (level: string) => {
    const colors: Record<string, string> = {
      A1: 'bg-purple-100 text-purple-700',
      A2: 'bg-blue-100 text-blue-700',
      B1: 'bg-green-100 text-green-700',
      B2: 'bg-yellow-100 text-yellow-700',
      C1: 'bg-orange-100 text-orange-700',
      C2: 'bg-red-100 text-red-700',
      mixed: 'bg-indigo-100 text-indigo-700'
    };
    return (
      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${colors[level] || colors.A1}`}>
        {level === 'mixed' ? 'A1-B2' : level}
      </span>
    );
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-5xl mx-auto space-y-6">
          <div className="h-8 bg-gray-200 rounded w-32 animate-pulse" />
          <div className="bg-gradient-to-r from-gray-200 to-gray-300 rounded-2xl h-48 animate-pulse" />
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="bg-white rounded-xl border border-gray-200 p-5 animate-pulse">
                <div className="h-6 bg-gray-200 rounded w-2/3" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!course) {
    return (
      <div className="min-h-screen bg-gray-50 p-6 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Курс не найден</h2>
          <button
            onClick={() => navigate('/my-courses')}
            className="text-indigo-600 hover:text-indigo-700"
          >
            Вернуться к моим курсам
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Back button */}
        <button
          onClick={() => navigate('/my-courses')}
          className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span className="text-sm font-medium">Назад к моим курсам</span>
        </button>

        {/* Course Hero */}
        <div className="bg-gradient-to-r from-indigo-600 to-indigo-700 text-white rounded-2xl p-8 shadow-lg">
          <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-3">
                {course.level && getLevelBadge(course.level)}
                <span className="text-xs text-indigo-200">•</span>
                <span className="text-xs text-indigo-200">
                  {units.length} юнитов
                </span>
              </div>
              <h1 className="text-3xl font-bold mb-2">{course.title}</h1>
              
              {/* Next Activity Section */}
              {(() => {
                const nextActivity = findNextActivity();
                if (!nextActivity) {
                  // All activities completed
                  return (
                    <div className="mt-4 flex items-center gap-3 p-4 bg-white/10 backdrop-blur-sm rounded-lg">
                      <CheckCircle className="w-6 h-6 text-green-300 flex-shrink-0" />
                      <div>
                        <p className="text-sm font-semibold">Поздравляем! 🎉</p>
                        <p className="text-xs text-indigo-200">Вы завершили все активности в этом курсе!</p>
                      </div>
                    </div>
                  );
                }

                const { type, unit, activity, unitIndex } = nextActivity;
                const getActivityIcon = () => {
                  if (type === 'video') return <Play className="w-5 h-5" />;
                  if (type === 'task') return <FileText className="w-5 h-5" />;
                  if (type === 'test') return <ClipboardCheck className="w-5 h-5" />;
                  return null;
                };

                const getActivityTypeText = () => {
                  if (type === 'video') return 'Видео';
                  if (type === 'task') return 'Задание';
                  if (type === 'test') return 'Тест';
                  return '';
                };

                const getActivityLink = () => {
                  if (type === 'video') return `/units/${unit?.id}?video=${activity.id}`;
                  if (type === 'task') return `/tasks/${activity.id}`;
                  if (type === 'test') return `/tests/${activity.id}`;
                  return '#';
                };

                return (
                  <div className="mt-4 p-4 bg-white/10 backdrop-blur-sm rounded-lg">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
                        {getActivityIcon()}
                      </div>
                      <div className="flex-1 min-w-0">
                         <div className="flex items-center gap-2 mb-2">
                           <span className="text-xs font-medium text-indigo-200">Следующее действие</span>
                         </div>
                         <p className="text-sm font-semibold mb-1">{unit?.title || `Unit ${unitIndex + 1}`}</p>
                         <p className="text-xs text-indigo-200 mb-3">{getActivityTypeText().toLowerCase()} {activity.order_index || 1}</p>
                        <Link
                          to={getActivityLink()}
                          className="inline-flex items-center gap-2 px-4 py-2 bg-white text-indigo-700 rounded-lg font-medium text-sm hover:bg-indigo-50 transition-colors"
                        >
                          <span>{activity.title}</span>
                          <ArrowRight className="w-4 h-4" />
                        </Link>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* Stats card */}
            <div className="lg:w-64 bg-white/10 backdrop-blur-sm rounded-xl p-5">
              <h3 className="text-sm font-medium mb-3 text-indigo-100">Статистика</h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-indigo-100">Видео</span>
                  <span className="font-semibold">{stats.videos.completed} / {stats.videos.total}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-indigo-100">Задания</span>
                  <span className="font-semibold">{stats.tasks.completed} / {stats.tasks.total}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-indigo-100">Тесты</span>
                  <span className="font-semibold">{stats.tests.passed} / {stats.tests.total}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Course Content */}
        <div>
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Содержание курса</h2>
          
          {units.length > 0 ? (
            <div className="space-y-3">
              {units.map((unit: Unit, index: number) => {
                const isExpanded = expandedUnits[unit.id];
                const content = unitContent[unit.id] || { videos: [], tasks: [], tests: [] };
                const totalItems = 
                  (content.videos.length || 0) +
                  (content.tasks.length || 0) +
                  (content.tests.length || 0);

                return (
                  <div
                    key={unit.id}
                    ref={(el) => {
                      unitRefs.current[unit.id] = el;
                    }}
                    className={`bg-white rounded-xl border overflow-hidden transition-all ${
                      isUnitCompleted(unit.id)
                        ? 'border-green-200 bg-green-50/30'
                        : 'border-gray-200'
                    }`}
                  >
                    {/* Unit Header */}
                    <button
                      onClick={() => toggleUnit(unit.id)}
                      className="w-full p-5 text-left hover:bg-gray-50 transition-colors cursor-pointer"
                    >
                      <div className="flex items-center gap-4">
                        {/* Number badge - auto-generated from sorted position */}
                        <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold ${
                          isUnitCompleted(unit.id) 
                            ? 'bg-green-100 text-green-700' 
                            : 'bg-indigo-100 text-indigo-700'
                        }`}>
                          {isUnitCompleted(unit.id) ? (
                            <CheckCircle className="w-6 h-6 text-green-600" />
                          ) : (
                            index + 1
                          )}
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="text-base font-semibold text-gray-900">
                              {unit.title}
                            </h3>
                            {isUnitCompleted(unit.id) && (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                ✓ Завершено
                              </span>
                            )}
                          </div>
                          
                          <div className="flex items-center gap-3 text-xs text-gray-500">
                            <span>📺 {content.videos.length}</span>
                            <span>📝 {content.tasks.length}</span>
                            <span>🧪 {content.tests.length}</span>
                          </div>
                        </div>

                        {/* Expand icon */}
                        <ChevronDown
                          className={`w-5 h-5 text-gray-400 transition-transform flex-shrink-0 ${
                            isExpanded ? 'rotate-180' : ''
                          }`}
                        />
                      </div>
                    </button>

                    {/* Unit Content - Expandable */}
                    {isExpanded && (
                      <div className="border-t border-gray-100 bg-gray-50">
                        <div className="p-5 space-y-1">
                          {/* Videos */}
                          {content.videos.length > 0 && (() => {
                            // Helper function to check if a video is a YouTube link
                            const isYouTubeVideo = (v: any): boolean => {
                              if (!v || v.source_type !== 'url' || !v.external_url) {
                                return false;
                              }
                              const url = v.external_url.toLowerCase();
                              return url.includes('youtube.com') || url.includes('youtu.be');
                            };
                            
                            // Sort videos by order_index to ensure correct sequence
                            const sortedVideos = [...content.videos].sort((a: any, b: any) => 
                              (a.order_index || 0) - (b.order_index || 0)
                            );
                            
                            return (
                              <>
                                {sortedVideos.map((video: any, videoIndex: number) => {
                                  // Check if all previous videos are completed
                                  // Skip YouTube videos when checking completion (they don't block next videos)
                                  const previousVideos = sortedVideos.slice(0, videoIndex);
                                  const previousNonYouTubeVideos = previousVideos.filter((v: any) => !isYouTubeVideo(v));
                                  const allPreviousCompleted = previousNonYouTubeVideos.length === 0 || previousNonYouTubeVideos.every((v: any) => v.completed === true);
                                  
                                  // Also check if previous unit's test is passed (required to unlock videos)
                                  const previousUnitTestPassed = isPreviousUnitTestPassed(index);
                                  
                                  const isLocked = (videoIndex > 0 && !allPreviousCompleted) || !previousUnitTestPassed;
                                  
                                  const videoContent = (
                                    <div className={`w-full flex items-center gap-3 p-3 rounded-lg transition-colors group ${
                                      isLocked 
                                        ? 'opacity-60 cursor-not-allowed' 
                                        : 'hover:bg-white cursor-pointer'
                                    }`}>
                                      <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                                        isLocked 
                                          ? 'bg-gray-100 text-gray-400' 
                                          : video.completed 
                                            ? 'bg-blue-100 text-blue-600' 
                                            : 'bg-blue-100 text-blue-600'
                                      }`}>
                                        {isLocked ? (
                                          <Lock className="w-4 h-4" />
                                        ) : video.completed ? (
                                          <CheckCircle className="w-4 h-4 text-green-600" />
                                        ) : (
                                          <Play className="w-4 h-4" />
                                        )}
                                      </div>
                                      <div className="flex-1 text-left">
                                        <p className={`text-sm font-medium ${
                                          isLocked ? 'text-gray-500' : 'text-gray-900'
                                        }`}>
                                          {video.title}
                                        </p>
                                        {video.duration_sec && (
                                          <p className="text-xs text-gray-500">
                                            {formatDuration(video.duration_sec)}
                                          </p>
                                        )}
                                        {isLocked && (
                                          <p className="text-xs text-amber-600 mt-1">
                                            {!previousUnitTestPassed 
                                              ? 'Сначала пройдите тест предыдущего юнита'
                                              : 'Сначала просмотрите предыдущие видео'
                                            }
                                          </p>
                                        )}
                                      </div>
                                      {video.completed && !isLocked && (
                                        <span className="text-xs text-green-600 font-medium">Просмотрено</span>
                                      )}
                                      {!isLocked && (
                                        <ChevronRight className="w-4 h-4 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                                      )}
                                    </div>
                                  );
                                  
                                  if (isLocked) {
                                    return (
                                      <div key={video.id} title="Сначала просмотрите предыдущие видео">
                                        {videoContent}
                                      </div>
                                    );
                                  }
                                  
                                  return (
                                    <Link
                                      key={video.id}
                                      to={`/units/${unit.id}?video=${video.id}`}
                                    >
                                      {videoContent}
                                    </Link>
                                  );
                                })}
                              </>
                            );
                          })()}

                          {/* Tasks */}
                          {content.tasks.length > 0 && (
                            <>
                              {content.tasks.map((task: any) => (
                                <Link
                                  key={task.id}
                                  to={`/tasks/${task.id}`}
                                  className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-white transition-colors group"
                                >
                                  <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 bg-amber-100 text-amber-600">
                                    <FileText className="w-4 h-4" />
                                  </div>
                                  <div className="flex-1 text-left">
                                    <p className="text-sm font-medium text-gray-900">{task.title}</p>
                                    {task.max_score && (
                                      <p className="text-xs text-gray-500">{task.max_score} баллов</p>
                                    )}
                                  </div>
                                  <ChevronRight className="w-4 h-4 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                                </Link>
                              ))}
                            </>
                          )}

                          {/* Tests */}
                          {content.tests.length > 0 && (() => {
                            // Check if previous unit's test is passed (required to unlock tests)
                            const previousUnitTestPassed = isPreviousUnitTestPassed(index);
                            
                            return (
                              <>
                                {content.tests.map((test: any) => {
                                  const isTestLocked = !previousUnitTestPassed;
                                  
                                  const testContent = (
                                    <div className={`w-full flex items-center gap-3 p-3 rounded-lg transition-colors group ${
                                      isTestLocked 
                                        ? 'opacity-60 cursor-not-allowed' 
                                        : 'hover:bg-white cursor-pointer'
                                    }`}>
                                      <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                                        isTestLocked 
                                          ? 'bg-gray-100 text-gray-400' 
                                          : 'bg-purple-100 text-purple-600'
                                      }`}>
                                        {isTestLocked ? (
                                          <Lock className="w-4 h-4" />
                                        ) : test.passed ? (
                                          <CheckCircle className="w-4 h-4 text-green-600" />
                                        ) : (
                                          <ClipboardCheck className="w-4 h-4" />
                                        )}
                                      </div>
                                      <div className="flex-1 text-left">
                                        <p className={`text-sm font-medium ${
                                          isTestLocked ? 'text-gray-500' : 'text-gray-900'
                                        }`}>
                                          {test.title}
                                        </p>
                                        {test.time_limit_minutes && (
                                          <p className={`text-xs flex items-center gap-1 ${
                                            isTestLocked ? 'text-gray-400' : 'text-gray-500'
                                          }`}>
                                            <Clock className="w-3 h-3" />
                                            {test.time_limit_minutes} минут
                                          </p>
                                        )}
                                        {isTestLocked && (
                                          <p className="text-xs text-amber-600 mt-1">
                                            Сначала пройдите тест предыдущего юнита
                                          </p>
                                        )}
                                      </div>
                                      {test.passed && !isTestLocked && (
                                        <span className="text-xs text-green-600 font-medium">Пройдено</span>
                                      )}
                                      {!isTestLocked && (
                                        <ChevronRight className="w-4 h-4 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                                      )}
                                    </div>
                                  );
                                  
                                  if (isTestLocked) {
                                    return (
                                      <div key={test.id} title="Сначала пройдите тест предыдущего юнита">
                                        {testContent}
                                      </div>
                                    );
                                  }
                                  
                                  return (
                                    <Link
                                      key={test.id}
                                      to={`/tests/${test.id}`}
                                    >
                                      {testContent}
                                    </Link>
                                  );
                                })}
                              </>
                            );
                          })()}
                          
                          {totalItems === 0 && (
                            <p className="text-sm text-gray-500 text-center py-4">Нет контента</p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-dashed border-gray-300 p-8 text-center">
              <p className="text-sm text-gray-500">В этом курсе пока нет доступных юнитов.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}