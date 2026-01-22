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
    return (
      <video
        width="100%"
        height="100%"
        controls
        className="w-full h-full"
      >
        <source src={filePath} type="video/mp4" />
        <source src={filePath} type="video/webm" />
        <source src={filePath} type="video/ogg" />
        Ваш браузер не поддерживает воспроизведение видео.
      </video>
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
