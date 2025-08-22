import React from 'react';

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
}

export default function VideoPlayer({ video, width = "100%", height = "400px" }: VideoPlayerProps) {
  const extractYouTubeVideoId = (url: string): string | null => {
    const regex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/;
    const match = url.match(regex);
    return match ? match[1] : null;
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
        width={width}
        height={height}
        src={`https://www.youtube.com/embed/${videoId}`}
        title={video.title}
        frameBorder="0"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        className="rounded-lg"
      />
    );
  };

  const renderFilePlayer = (filePath: string) => {
    return (
      <video
        width={width}
        height={height}
        controls
        className="rounded-lg"
      >
        <source src={filePath} type="video/mp4" />
        <source src={filePath} type="video/webm" />
        <source src={filePath} type="video/ogg" />
        Ваш браузер не поддерживает воспроизведение видео.
      </video>
    );
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-medium text-gray-900 mb-2">{video.title}</h3>
        {video.description && (
          <p className="text-sm text-gray-600 mb-4">{video.description}</p>
        )}
      </div>
      
      <div className="bg-black rounded-lg overflow-hidden">
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
    </div>
  );
}
