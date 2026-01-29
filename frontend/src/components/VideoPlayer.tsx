import { useEffect, useRef, useState } from 'react';
import { videosApi } from '../services/api';
import toast from 'react-hot-toast';

interface VideoPlayerProps {
  video: {
    id: number;
    title: string;
    source_type: 'file' | 'url';
    external_url?: string;
    file_path?: string;
    description?: string;
  };
  width?: string;
  height?: string;
  onProgressUpdate?: (completed: boolean) => void;
}

export default function VideoPlayer({ 
  video, 
  width = "100%", 
  height = "400px",
  onProgressUpdate 
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [hasStarted, setHasStarted] = useState(false);
  const [lastSavedProgress, setLastSavedProgress] = useState(0);
  const [showTestControls, setShowTestControls] = useState(false);
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);
  
  // Check if we're in development mode
  const isDevelopment = import.meta.env.DEV;

  const extractYouTubeVideoId = (url: string): string | null => {
    const regex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/;
    const match = url.match(regex);
    return match ? match[1] : null;
  };

  // Save video progress to backend
  const saveProgress = async (currentTime: number, duration: number, forceComplete: boolean = false) => {
    if (!duration || duration === 0) return;

    const watchedPercentage = Math.min((currentTime / duration) * 100, 100);
    const completed = forceComplete || watchedPercentage >= 95; // Consider 95%+ as completed

    // Only save if progress changed by at least 5% or if completed
    if (completed || Math.abs(watchedPercentage - lastSavedProgress) >= 5) {
      try {
        await videosApi.updateVideoProgress(video.id, {
          watched_percentage: watchedPercentage,
          last_position_sec: currentTime,
          completed: completed
        });
        setLastSavedProgress(watchedPercentage);
        
        if (completed && onProgressUpdate) {
          onProgressUpdate(true);
        }
      } catch (error) {
        console.error('Error saving video progress:', error);
      }
    }
  };

  // Handle video play event
  const handlePlay = () => {
    if (!hasStarted) {
      setHasStarted(true);
    }

    // Start periodic progress saves every 10 seconds
    if (videoRef.current && !progressIntervalRef.current) {
      progressIntervalRef.current = setInterval(() => {
        if (videoRef.current && !videoRef.current.paused) {
          saveProgress(videoRef.current.currentTime, videoRef.current.duration);
        }
      }, 10000); // Save every 10 seconds
    }
  };

  // Handle video pause event
  const handlePause = () => {
    if (videoRef.current) {
      saveProgress(videoRef.current.currentTime, videoRef.current.duration);
    }
  };

  // Handle video end event
  const handleEnded = () => {
    if (videoRef.current) {
      saveProgress(videoRef.current.currentTime, videoRef.current.duration, true);
    }
  };

  // Handle video time update (for seeking)
  const handleSeeking = () => {
    if (videoRef.current && hasStarted) {
      saveProgress(videoRef.current.currentTime, videoRef.current.duration);
    }
  };

  // Handle timeupdate event - check for completion more frequently when near the end
  const handleTimeUpdate = () => {
    if (videoRef.current && hasStarted && !videoRef.current.paused) {
      const currentTime = videoRef.current.currentTime;
      const duration = videoRef.current.duration;
      if (duration > 0) {
        const percentage = (currentTime / duration) * 100;
        // Check for completion more frequently when near 95%+
        // This ensures the completion status appears immediately without waiting for the interval
        if (percentage >= 95) {
          // Only save if we haven't already marked as completed
          if (lastSavedProgress < 95) {
            saveProgress(currentTime, duration);
          }
        }
      }
    }
  };

  // Cleanup interval on unmount
  useEffect(() => {
    return () => {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
      }
      // Save final progress when component unmounts
      if (videoRef.current && hasStarted) {
        saveProgress(videoRef.current.currentTime, videoRef.current.duration);
      }
    };
  }, [hasStarted]);

  // Load saved progress when video is ready
  const handleLoadedMetadata = async () => {
    if (videoRef.current && video.source_type === 'file') {
      try {
        const progress = await videosApi.getVideoProgress(video.id);
        if (progress && progress.last_position_sec && !progress.completed) {
          // Resume from last position if video wasn't completed
          videoRef.current.currentTime = progress.last_position_sec;
          setLastSavedProgress(progress.watched_percentage || 0);
        }
      } catch (error) {
        // Progress doesn't exist yet, that's fine
        console.log('No previous progress found');
      }
    }
  };

  // Test function to jump to near end (for testing completion)
  const jumpToNearEnd = () => {
    if (videoRef.current && videoRef.current.duration) {
      // Jump to 95% of video duration
      const targetTime = videoRef.current.duration * 0.95;
      videoRef.current.currentTime = targetTime;
      // Force save progress immediately
      saveProgress(targetTime, videoRef.current.duration);
      // Toast removed for cleaner testing experience
    }
  };

  // Test function to jump to end (for testing completion)
  const jumpToEnd = () => {
    if (videoRef.current && videoRef.current.duration) {
      // Jump to 99% of video duration
      const targetTime = videoRef.current.duration * 0.99;
      videoRef.current.currentTime = targetTime;
      // Force save progress immediately with completion
      saveProgress(targetTime, videoRef.current.duration, true);
      toast.success(`Переход к концу (99%) - видео будет помечено как завершенное`);
    }
  };

  const renderYouTubePlayer = (url: string) => {
    const videoId = extractYouTubeVideoId(url);
    if (!videoId) {
      return (
        <div className="flex items-center justify-center h-full bg-gray-100 rounded-lg">
          <p className="text-gray-500">Неверная ссылка на YouTube видео</p>
        </div>
      );
    }

    return (
      <iframe
        width="100%"
        height="100%"
        src={`https://www.youtube.com/embed/${videoId}`}
        title={video.title}
        frameBorder="0"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        className="w-full h-full"
      />
    );
  };

  const renderFilePlayer = (filePath: string) => {
    // Construct the full URL for the video file
    // Static files are served at /api/v1/static/{file_path}
    const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api/v1';
    const videoUrl = `${API_BASE_URL}/static/${filePath}`;
    
    // Determine video type from file extension
    const getVideoType = (path: string): string => {
      const ext = path.toLowerCase().split('.').pop();
      switch (ext) {
        case 'mp4':
          return 'video/mp4';
        case 'webm':
          return 'video/webm';
        case 'ogg':
        case 'ogv':
          return 'video/ogg';
        case 'mov':
          return 'video/quicktime';
        case 'avi':
          return 'video/x-msvideo';
        case 'mkv':
          return 'video/x-matroska';
        default:
          return 'video/mp4';
      }
    };
    
    return (
      <div className="relative w-full h-full">
        <video
          ref={videoRef}
          width="100%"
          height="100%"
          controls
          className="w-full h-full"
          onPlay={handlePlay}
          onPause={handlePause}
          onEnded={handleEnded}
          onSeeked={handleSeeking}
          onTimeUpdate={handleTimeUpdate}
          onLoadedMetadata={handleLoadedMetadata}
        >
          <source src={videoUrl} type={getVideoType(filePath)} />
          Ваш браузер не поддерживает воспроизведение видео.
        </video>
        
        {/* Test controls - only show in development */}
        {isDevelopment && video.source_type === 'file' && (
          <div className="absolute top-2 right-2 z-10">
            <button
              onClick={() => setShowTestControls(!showTestControls)}
              className="bg-yellow-500 hover:bg-yellow-600 text-white text-xs px-2 py-1 rounded shadow-lg"
              title="Показать тестовые контролы"
            >
              🧪 Тест
            </button>
            
            {showTestControls && (
              <div className="absolute top-8 right-0 bg-white border border-gray-300 rounded-lg shadow-lg p-2 space-y-1 min-w-[200px]">
                <p className="text-xs font-semibold text-gray-700 mb-2">Тестовые функции:</p>
                <button
                  onClick={jumpToNearEnd}
                  className="w-full text-left text-xs px-2 py-1 hover:bg-gray-100 rounded text-gray-700"
                >
                  ⏩ Перейти к 95% (почти завершено)
                </button>
                <button
                  onClick={jumpToEnd}
                  className="w-full text-left text-xs px-2 py-1 hover:bg-gray-100 rounded text-gray-700"
                >
                  ⏭️ Перейти к концу (99% - завершено)
                </button>
                <div className="border-t border-gray-200 mt-2 pt-2">
                  <p className="text-xs text-gray-500">
                    Текущий прогресс: {Math.round(lastSavedProgress)}%
                  </p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  // Render video player only (title/description are handled by parent component)
  return (
    <div className="w-full h-full">
      {video.source_type === 'url' && video.external_url ? (
        renderYouTubePlayer(video.external_url)
      ) : video.source_type === 'file' && video.file_path ? (
        renderFilePlayer(video.file_path)
      ) : (
        <div className="flex items-center justify-center h-full bg-gray-100 rounded-lg" style={{ height }}>
          <p className="text-gray-500">Видео недоступно</p>
        </div>
      )}
    </div>
  );
}