import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
// import { useTranslation } from 'react-i18next';
import {
  ArrowLeft,
  Play,
  FileText,
  ClipboardList,
  BookOpen,
  Clock,
  Star
} from 'lucide-react';
import { unitsApi, videosApi, tasksApi, testsApi } from '../services/api';
import VideoPlayer from '../components/VideoPlayer';
import toast from 'react-hot-toast';
import { Video, Unit, Task, Test } from '../types';

export default function UnitDetailPage() {
  // const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [unit, setUnit] = useState<Unit | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedVideo, setSelectedVideo] = useState<Video | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [tests, setTests] = useState<Test[]>([]);

  useEffect(() => {
    const fetchUnit = async () => {
      if (!id) return;
      
      try {
        setLoading(true);
        const unitData = await unitsApi.getUnit(parseInt(id));
        const videos = await videosApi.getVideos(parseInt(id));
        
        setUnit({
          ...unitData,
          videos: videos // оставляем как есть
        });
        
        if (videos.length > 0) {
          setSelectedVideo(videos[0]);
        }
        
        // Tasks
        try {
          const tasksData = await tasksApi.getTasks({ unit_id: parseInt(id) });
          setTasks(Array.isArray(tasksData) ? tasksData : []);
        } catch (error) {
          console.error('Error loading tasks:', error);
        }
        
        // Tests
        try {
          const testsData = await testsApi.getTests({ unit_id: parseInt(id) });
          const testsList = testsData?.items || (Array.isArray(testsData) ? testsData : []);
          setTests(testsList);
        } catch (error) {
          console.error('Error loading tests:', error);
        }
      } catch (error: any) {
        console.error('Error fetching unit:', error);
        toast.error('Ошибка при загрузке юнита');
      } finally {
        setLoading(false);
      }
    };

    fetchUnit();
  }, [id]);

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
      <span
        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
          levelColors[level as keyof typeof levelColors]
        }`}
      >
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

  if (!unit) {
    return (
      <div className="text-center py-12">
        <h2 className="text-xl font-medium text-gray-900">Юнит не найден</h2>
        <p className="text-gray-500 mt-2">
          Запрашиваемый юнит не существует или недоступен.
        </p>
      </div>
    );
  }

  const totalVideos = unit.videos?.length || 0;
  const estimatedMinutes = Math.max(1, totalVideos) * 10; // как в UnitsPage
  const tasksCount = tasks.length;
  const testsCount = tests.length;

  return (
      <div className="space-y-6">
      {/* Back + mini header */}
      <div className="flex items-center justify-between">
          <button
            onClick={() => window.history.back()}
            className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Назад
          </button>
      </div>

      {/* HERO — Udemy/Coursera style */}
      <div className="bg-gradient-to-r from-primary-600 to-primary-700 text-white rounded-xl shadow-lg overflow-hidden">
        <div className="px-6 py-6 lg:px-10 lg:py-8 grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: title & description */}
          <div className="lg:col-span-2 space-y-3">
            <div className="flex items-center space-x-2 text-xs font-medium">
              {getLevelBadge(unit.level)}
              <span className="text-primary-100">•</span>
              <span className="text-primary-100">
                {totalVideos} видео • {tasksCount} заданий • {testsCount} тестов
              </span>
            </div>
            <h1 className="text-2xl md:text-3xl font-bold">{unit.title}</h1>
            {unit.description && (
              <p className="text-sm md:text-base text-primary-100 max-w-2xl">
                {unit.description}
              </p>
            )}

            {/* Fake rating like Udemy (можно потом подвязать к API) */}
            <div className="flex items-center space-x-3 text-sm mt-2">
              <div className="flex items-center space-x-1">
                <span className="font-semibold">4.9</span>
                <div className="flex">
                  <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />
                  <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />
                  <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />
                  <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />
                  <Star className="w-4 h-4 text-yellow-400" />
                </div>
              </div>
              <span className="text-primary-100">· 132 отзыва · 1 245 студентов</span>
            </div>
          </div>

          {/* Right: "card" with CTA */}
          <div className="bg-white/10 rounded-xl p-4 flex flex-col justify-between">
            <div className="space-y-3">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
                  <Play className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-xs text-primary-100">Видео-курс</p>
                  <p className="text-sm font-semibold">Итальянский для начинающих</p>
                </div>
              </div>

              <div className="flex items-center space-x-2 text-sm text-primary-100">
                <Clock className="w-4 h-4" />
                <span>Примерное время прохождения: {estimatedMinutes} мин</span>
              </div>
            </div>

            <div className="mt-4 space-y-2">
              <button
                onClick={() => {
                  if (selectedVideo) return;
                  if (unit.videos && unit.videos.length > 0) {
                    setSelectedVideo(unit.videos[0] as Video);
                  }
                }}
                className="w-full inline-flex items-center justify-center px-4 py-2.5 border border-transparent text-sm font-semibold rounded-md shadow-sm bg-white text-primary-700 hover:bg-gray-100"
              >
                <Play className="w-4 h-4 mr-2" />
                {selectedVideo ? 'Продолжить просмотр' : 'Начать обучение'}
              </button>
              <p className="text-[11px] text-primary-100 text-center">
                Ваш прогресс пока не сохраняется — логику можно будет привязать к API позже.
              </p>
            </div>
            </div>
          </div>
        </div>

      {/* MAIN LAYOUT */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* LEFT: video player + curriculum */}
          <div className="lg:col-span-2 space-y-6">
          {/* Video player area */}
          <div className="bg-white rounded-xl shadow">
            {selectedVideo ? (
              <div className="space-y-3">
                <div className="aspect-video w-full bg-black rounded-t-xl overflow-hidden">
                <VideoPlayer video={selectedVideo} />
              </div>
                <div className="p-4 md:p-5 border-t border-gray-100">
                  <h2 className="text-lg font-semibold text-gray-900 flex items-center">
                    <Play className="w-4 h-4 mr-2 text-primary-600" />
                    {selectedVideo.title}
                  </h2>
                  {selectedVideo.description && (
                    <p className="mt-1 text-sm text-gray-600">
                      {selectedVideo.description}
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <div className="h-64 flex flex-col items-center justify-center text-gray-400">
                <Play className="w-10 h-10 mb-2" />
                <p className="text-sm">Выберите видео из списка ниже, чтобы начать.</p>
              </div>
            )}
          </div>

          {/* Curriculum (videos list) */}
          <div className="bg-white rounded-xl shadow">
            <div className="px-4 py-3 md:px-5 md:py-4 border-b border-gray-200 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <FileText className="w-5 h-5 text-primary-600" />
                <h3 className="text-base md:text-lg font-medium text-gray-900">
                  Содержание юнита
                </h3>
              </div>
              <span className="text-xs md:text-sm text-gray-500">
                {totalVideos} лекций • {estimatedMinutes} мин
              </span>
            </div>
            <div className="p-4 md:p-5 space-y-2">
                {unit.videos && unit.videos.length > 0 ? (
                unit.videos.map((video: any, index: number) => {
                  const isActive = selectedVideo && selectedVideo.id === video.id;
                  return (
                      <button
                        key={video.id}
                        onClick={() => setSelectedVideo(video)}
                      className={`w-full text-left flex items-center justify-between px-3 py-3 rounded-lg border text-sm ${
                        isActive
                            ? 'border-primary-500 bg-primary-50'
                          : 'border-gray-200 hover:border-primary-300 hover:bg-gray-50'
                      } transition-colors`}
                      >
                        <div className="flex items-start space-x-3">
                          <div className="flex-shrink-0">
                          <div
                            className={`w-8 h-8 rounded-full flex items-center justify-center ${
                              isActive ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-500'
                            }`}
                          >
                            <Play className="w-4 h-4" />
                          </div>
                          </div>
                          <div className="flex-1 min-w-0">
                          <p
                            className={`font-medium truncate ${
                              isActive ? 'text-primary-700' : 'text-gray-900'
                            }`}
                          >
                              {index + 1}. {video.title}
                            </p>
                            {video.description && (
                            <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">
                                {video.description}
                              </p>
                            )}
                        </div>
                      </div>
                      <span className="text-xs text-gray-400 whitespace-nowrap">
                        {/* при желании сюда можно вывести duration */}
                        ~10 мин
                      </span>
                      </button>
                  );
                })
                ) : (
                <div className="text-center py-8 text-sm text-gray-500">
                  Видео пока нет.
                  </div>
                )}
            </div>
              </div>
            </div>

        {/* RIGHT: tasks, tests, progress */}
        <div className="space-y-6">
          {/* Tasks */}
          <div className="bg-white rounded-xl shadow">
            <div className="p-4 border-b border-gray-200 flex items-center">
                  <ClipboardList className="h-5 w-5 mr-2 text-green-600" />
              <h3 className="text-lg font-medium text-gray-900">
                Задания ({tasksCount})
                </h3>
              </div>
              <div className="p-4">
              {tasksCount > 0 ? (
                  <div className="space-y-2">
                    {tasks.map((task, index) => (
                      <button
                        key={task.id}
                        onClick={() => navigate(`/tasks/${task.id}`)}
                        className="w-full text-left p-3 rounded-lg border border-gray-200 hover:border-primary-300 hover:bg-primary-50 transition-colors"
                      >
                        <div className="flex items-start space-x-3">
                          <div className="flex-shrink-0">
                            <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
                            <span className="text-sm font-semibold text-green-600">
                              {index + 1}
                            </span>
                          </div>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate">
                              {task.title}
                            </p>
                            {task.description && (
                              <p className="text-xs text-gray-500 mt-1 line-clamp-2">
                                {task.description}
                              </p>
                            )}
                            <div className="flex items-center space-x-2 mt-1">
                            <span className="text-xs text-gray-400">
                              {task.max_score} баллов
                            </span>
                              {task.due_at && (
                                <>
                                  <span className="text-xs text-gray-400">•</span>
                                  <span className="text-xs text-gray-400">
                                  До{' '}
                                  {new Date(task.due_at).toLocaleDateString('ru-RU')}
                                  </span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <ClipboardList className="mx-auto h-8 w-8 text-gray-400" />
                    <p className="text-sm text-gray-500 mt-2">Нет заданий</p>
                  </div>
                )}
              </div>
            </div>

          {/* Tests */}
          <div className="bg-white rounded-xl shadow">
            <div className="p-4 border-b border-gray-200 flex items-center">
                  <BookOpen className="h-5 w-5 mr-2 text-purple-600" />
              <h3 className="text-lg font-medium text-gray-900">
                Тесты ({testsCount})
                </h3>
              </div>
              <div className="p-4">
              {testsCount > 0 ? (
                  <div className="space-y-2">
                    {tests.map((test, index) => (
                      <button
                        key={test.id}
                        onClick={() => navigate(`/tests/${test.id}`)}
                        className="w-full text-left p-3 rounded-lg border border-gray-200 hover:border-primary-300 hover:bg-primary-50 transition-colors"
                      >
                        <div className="flex items-start space-x-3">
                          <div className="flex-shrink-0">
                            <div className="w-8 h-8 bg-purple-100 rounded-full flex items-center justify-center">
                            <span className="text-sm font-semibold text-purple-600">
                              {index + 1}
                            </span>
                          </div>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate">
                              {test.title}
                            </p>
                            {test.description && (
                              <p className="text-xs text-gray-500 mt-1 line-clamp-2">
                                {test.description}
                              </p>
                            )}
                            <div className="flex items-center space-x-2 mt-1">
                            <span className="text-xs text-gray-400">
                              {test.time_limit_minutes} минут
                            </span>
                              <span className="text-xs text-gray-400">•</span>
                            <span className="text-xs text-gray-400">
                              Проходной балл: {test.passing_score}%
                            </span>
                          </div>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <BookOpen className="mx-auto h-8 w-8 text-gray-400" />
                    <p className="text-sm text-gray-500 mt-2">Нет тестов</p>
                  </div>
                )}
              </div>
            </div>

          {/* Progress (пока статичный, как у тебя) */}
          <div className="bg-white rounded-xl shadow p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">
              Ваш прогресс
            </h3>
              <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600">Просмотрено видео</span>
                <span className="font-medium text-gray-900">
                  0 / {totalVideos}
                </span>
                </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600">Выполнено заданий</span>
                <span className="font-medium text-gray-900">
                  0 / {tasksCount}
                </span>
                </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600">Пройдено тестов</span>
                <span className="font-medium text-gray-900">
                  0 / {testsCount}
                </span>
                </div>

              <div className="mt-3">
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div className="h-2 rounded-full bg-primary-500" style={{ width: '0%' }} />
                </div>
                <p className="mt-1 text-xs text-gray-400">
                  Позже сюда можно вывести реальный процент завершения.
                </p>
              </div>
              </div>
            </div>
          </div>
        </div>
      </div>
  );
}
