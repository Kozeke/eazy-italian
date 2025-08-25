

import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
// import { useTranslation } from 'react-i18next';
import { ArrowLeft, Play, FileText, CheckCircle } from 'lucide-react';
import { unitsApi, videosApi } from '../services/api';
import VideoPlayer from '../components/VideoPlayer';
import toast from 'react-hot-toast';
import { Video, Unit } from '../types';

export default function UnitDetailPage() {
  // const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const [unit, setUnit] = useState<Unit | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedVideo, setSelectedVideo] = useState<Video | null>(null);

  useEffect(() => {
    const fetchUnit = async () => {
      if (!id) return;
      
      try {
        setLoading(true);
        const unitData = await unitsApi.getUnit(parseInt(id));
        const videos = await videosApi.getVideos(parseInt(id));
        
        setUnit({
          ...unitData,
          videos: videos // Remove filtering for now since status might not be available
        });
        
        // Set first video as selected if available
        if (videos.length > 0) {
          setSelectedVideo(videos[0]);
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
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${levelColors[level as keyof typeof levelColors]}`}>
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
        <p className="text-gray-500 mt-2">Запрашиваемый юнит не существует или недоступен.</p>
      </div>
    );
  }

  return (
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center space-x-4">
          <button
            onClick={() => window.history.back()}
            className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Назад
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{unit.title}</h1>
            <div className="flex items-center space-x-2 mt-1">
              {getLevelBadge(unit.level)}
              <span className="text-sm text-gray-500">•</span>
              <span className="text-sm text-gray-500">{unit.videos?.length || 0} видео</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Video Player */}
            {selectedVideo ? (
              <div className="bg-white rounded-lg shadow p-6">
                <VideoPlayer video={selectedVideo} />
              </div>
            ) : (
              <div className="bg-white rounded-lg shadow p-6">
                <div className="text-center py-12">
                  <Play className="mx-auto h-12 w-12 text-gray-400" />
                  <h3 className="mt-2 text-sm font-medium text-gray-900">Нет доступных видео</h3>
                  <p className="mt-1 text-sm text-gray-500">
                    В этом юните пока нет опубликованных видео.
                  </p>
                </div>
              </div>
            )}

            {/* Unit Description */}
            {unit.description && (
              <div className="bg-white rounded-lg shadow p-6">
                <h2 className="text-lg font-medium text-gray-900 mb-4">Описание юнита</h2>
                <p className="text-gray-700 whitespace-pre-wrap">{unit.description}</p>
              </div>
            )}

            {/* Learning Goals */}
            {unit.goals && (
              <div className="bg-white rounded-lg shadow p-6">
                <h2 className="text-lg font-medium text-gray-900 mb-4">Цели обучения</h2>
                <p className="text-gray-700 whitespace-pre-wrap">{unit.goals}</p>
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Video List */}
            <div className="bg-white rounded-lg shadow">
              <div className="p-4 border-b border-gray-200">
                <h3 className="text-lg font-medium text-gray-900">Видео в этом юните</h3>
              </div>
              <div className="p-4">
                {unit.videos && unit.videos.length > 0 ? (
                  <div className="space-y-2">
                    {unit.videos?.map((video, index) => (
                      <button
                        key={video.id}
                        onClick={() => setSelectedVideo(video)}
                        className={`w-full text-left p-3 rounded-lg border transition-colors ${
                          selectedVideo?.id === video.id
                            ? 'border-primary-500 bg-primary-50'
                            : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                        }`}
                      >
                        <div className="flex items-start space-x-3">
                          <div className="flex-shrink-0">
                            <div className="w-8 h-8 bg-primary-100 rounded-full flex items-center justify-center">
                              <Play className="h-4 w-4 text-primary-600" />
                            </div>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate">
                              {index + 1}. {video.title}
                            </p>
                            {video.description && (
                              <p className="text-xs text-gray-500 mt-1 line-clamp-2">
                                {video.description}
                              </p>
                            )}
                            {video.duration_sec && (
                              <p className="text-xs text-gray-400 mt-1">
                                {Math.floor(video.duration_sec / 60)}:{(video.duration_sec % 60).toString().padStart(2, '0')}
                              </p>
                            )}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <FileText className="mx-auto h-8 w-8 text-gray-400" />
                    <p className="text-sm text-gray-500 mt-2">Нет доступных видео</p>
                  </div>
                )}
              </div>
            </div>

            {/* Progress */}
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Прогресс</h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Просмотрено видео</span>
                  <span className="text-sm font-medium text-gray-900">0 / {unit.videos?.length || 0}</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div className="bg-primary-600 h-2 rounded-full" style={{ width: '0%' }}></div>
                </div>
                <div className="flex items-center space-x-2 text-sm text-gray-500">
                  <CheckCircle className="h-4 w-4" />
                  <span>0% завершено</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
  );
}
