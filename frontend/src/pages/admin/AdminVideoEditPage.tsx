/**
 * Admin Video Edit Page
 * 
 * Coursera/Udemy-style video editing interface for admins.
 * Allows editing video metadata, source URLs, visibility settings, and previewing videos.
 * Consistent with AdminUnitEditPage and AdminVideoCreatePage design patterns.
 */

import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { 
  ArrowLeft, 
  Youtube, 
  Upload, 
  X, 
  Check, 
  Settings as SettingsIcon, 
  Image as ImageIcon, 
  Sparkles,
  Save,
  Video,
  Link as LinkIcon,
  File,
  Clock,
  Info
} from 'lucide-react';
import toast from 'react-hot-toast';
import { videosApi, unitsApi } from '../../services/api';

// Form data interface for video editing
interface VideoFormData {
  title: string;
  description: string;
  unit_id: number;
  source_type: 'file' | 'url';
  external_url?: string;
  file_path?: string;
  status: 'draft' | 'published' | 'archived';
  order_index: number;
  is_visible_to_students: boolean;
  duration_sec?: number;
  created_at?: string;
  updated_at?: string;
}

export default function AdminVideoEditPage() {
  const navigate = useNavigate();
  const { id } = useParams();

  // Loading state for initial video data fetch
  const [loading, setLoading] = useState(true);
  // Saving state to prevent duplicate submissions
  const [saving, setSaving] = useState(false);
  // Advanced settings toggle
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Form state for video editing
  const [formData, setFormData] = useState<VideoFormData>({
    title: '',
    description: '',
    unit_id: 0,
    source_type: 'url',
    external_url: '',
    status: 'draft',
    order_index: 0,
    is_visible_to_students: true,
    duration_sec: undefined,
    created_at: undefined,
    updated_at: undefined
  });

  // Available units for dropdown selection
  const [availableUnits, setAvailableUnits] = useState<any[]>([]);
  // Loading state for units fetch
  const [loadingUnits, setLoadingUnits] = useState(true);
  // Thumbnail state
  const [thumbnailPath, setThumbnailPath] = useState<string | null>(null);
  const [uploadingThumbnail, setUploadingThumbnail] = useState(false);
  const [thumbnailKey, setThumbnailKey] = useState(0); // For cache busting

  // File upload state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadedFilePath, setUploadedFilePath] = useState<string | null>(null);
  
  // Local state for order_index input to allow clearing
  const [orderIndexInput, setOrderIndexInput] = useState<string>('0');

  // Video preview state
  const [videoEmbedUrl, setVideoEmbedUrl] = useState<string>('');
  const [platformBadge, setPlatformBadge] = useState<{ type: 'youtube' | 'vimeo' | 'other' | null; label: string }>({ type: null, label: '' });

  // Load available units on mount
  useEffect(() => {
    const loadUnits = async () => {
      try {
        setLoadingUnits(true);
        const unitsData = await unitsApi.getAdminUnits({ limit: 100 });
        setAvailableUnits(unitsData || []);
      } catch (error) {
        console.error('Error loading units:', error);
        toast.error('Ошибка при загрузке юнитов');
      } finally {
        setLoadingUnits(false);
      }
    };
    loadUnits();
  }, []);

  // Load video data when ID is available
  useEffect(() => {
    const loadVideo = async () => {
      if (!id) {
        toast.error('ID видео не найден');
        navigate('/admin/videos');
        return;
      }

      try {
        setLoading(true);
        const videoData = await videosApi.getAdminVideo(parseInt(id));

        setFormData({
          title: videoData.title || '',
          description: videoData.description || '',
          unit_id: videoData.unit_id || 0,
          source_type: (videoData.source_type || 'url') as 'file' | 'url',
          external_url: videoData.external_url || '',
          file_path: videoData.file_path || '',
          status: (videoData.status || 'draft') as 'draft' | 'published' | 'archived',
          order_index: videoData.order_index || 0,
          is_visible_to_students: videoData.is_visible_to_students ?? true,
          duration_sec: videoData.duration_sec,
          created_at: videoData.created_at,
          updated_at: videoData.updated_at
        });
        
        // Set thumbnail path
        setThumbnailPath((videoData as any).thumbnail_path || null);
        
        // Set uploaded file path if exists
        if (videoData.file_path) {
          setUploadedFilePath(videoData.file_path);
        }
      } catch (error) {
        console.error('Error loading video:', error);
        toast.error('Ошибка при загрузке видео');
        navigate('/admin/videos');
      } finally {
        setLoading(false);
      }
    };

    if (id) {
      loadVideo();
    }
  }, [id, navigate]);

  // Sync orderIndexInput with formData.order_index when formData changes
  useEffect(() => {
    setOrderIndexInput(formData.order_index.toString());
  }, [formData.order_index]);

  // Handle form input changes (text, select, textarea)
  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    
    // Skip order_index here - it's handled by handleOrderIndexChange
    if (name === 'order_index') {
      return;
    }
    
    setFormData(prev => ({
      ...prev,
      [name]:
        name === 'unit_id'
          ? Number(value)
          : value === 'true' || value === 'false'
          ? value === 'true'
          : value
    }));
  };
  
  // Handle order_index input specifically to allow clearing
  const handleOrderIndexChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setOrderIndexInput(value); // Update local state immediately
    
    // Update formData only if value is valid number
    if (value === '') {
      // Allow empty, will be set to 0 on blur
      return;
    }
    const numValue = Number(value);
    if (!isNaN(numValue) && numValue >= 0) {
      setFormData(prev => ({ ...prev, order_index: numValue }));
    }
  };
  
  // Handle blur to ensure we have a valid number
  const handleOrderIndexBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    const value = e.target.value.trim();
    if (value === '' || isNaN(Number(value)) || Number(value) < 0) {
      setFormData(prev => ({ ...prev, order_index: 0 }));
      setOrderIndexInput('0');
    } else {
      const numValue = Number(value);
      setFormData(prev => ({ ...prev, order_index: numValue }));
      setOrderIndexInput(numValue.toString());
    }
  };

  // Handle checkbox changes
  const handleCheckboxChange = (name: keyof VideoFormData, checked: boolean) => {
    setFormData(prev => ({
      ...prev,
      [name]: checked
    }));
  };

  // Validate YouTube URL format
  const validateYouTubeUrl = (url: string): boolean => {
    const patterns = [
      /^https?:\/\/(www\.)?youtube\.com\/watch\?v=[a-zA-Z0-9_-]+/,
      /^https?:\/\/(www\.)?youtu\.be\/[a-zA-Z0-9_-]+/,
      /^https?:\/\/(www\.)?youtube\.com\/embed\/[a-zA-Z0-9_-]+/
    ];
    return patterns.some(pattern => pattern.test(url));
  };

  // Validate Vimeo URL format
  const validateVimeoUrl = (url: string): boolean => {
    const patterns = [
      /^https?:\/\/(www\.)?vimeo\.com\/\d+/,
      /^https?:\/\/(www\.)?vimeo\.com\/embed\/\d+/
    ];
    return patterns.some(pattern => pattern.test(url));
  };


  // Handle file selection
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    // Validate file type
    const allowedTypes = ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo', 'video/x-matroska', 'video/ogg', 'video/x-flv', 'video/3gpp', 'video/x-ms-wmv'];
    const allowedExtensions = ['.mp4', '.webm', '.mov', '.avi', '.mkv', '.ogv', '.flv', '.3gp', '.wmv'];
    const fileExt = '.' + file.name.split('.').pop()?.toLowerCase();
    
    if (!allowedTypes.includes(file.type) && !allowedExtensions.includes(fileExt)) {
      toast.error('Неподдерживаемый формат файла. Разрешены: MP4, WebM, MOV, AVI, MKV, OGV, FLV, 3GP, WMV');
      return;
    }
    
    // Check file size (max 2GB)
    const maxSize = 2 * 1024 * 1024 * 1024; // 2GB
    if (file.size > maxSize) {
      toast.error('Файл слишком большой. Максимальный размер: 2GB');
      return;
    }
    
    setSelectedFile(file);
    setUploadedFilePath(null);
  };
  
  // Handle file upload
  const handleFileUpload = async () => {
    if (!selectedFile) return;
    
    try {
      setUploading(true);
      setUploadProgress(0);
      
      const result = await videosApi.uploadVideoFile(selectedFile);
      
      setUploadedFilePath(result.file_path);
      setFormData(prev => ({ ...prev, file_path: result.file_path }));
      setUploadProgress(100);
      
      toast.success('Видео успешно загружено!');
    } catch (error: any) {
      console.error('Error uploading file:', error);
      toast.error(error.response?.data?.detail || 'Ошибка при загрузке видео');
      setSelectedFile(null);
      setUploadProgress(0);
    } finally {
      setUploading(false);
    }
  };
  
  // Remove selected file
  const handleRemoveFile = () => {
    setSelectedFile(null);
    setUploadedFilePath(null);
    setFormData(prev => ({ ...prev, file_path: '' }));
    setUploadProgress(0);
  };
  
  // Format file size
  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  // Handle form submission and validation
  const handleSave = async () => {
    if (!id) {
      toast.error('ID видео не найден');
      return;
    }

    try {
      // Validate required fields
      if (!formData.title) {
        toast.error('Пожалуйста, введите название видео');
        return;
      }

      if (!formData.unit_id) {
        toast.error('Пожалуйста, выберите юнит');
        return;
      }

      if (formData.source_type === 'url' && !formData.external_url) {
        toast.error('Пожалуйста, введите URL видео');
        return;
      }

      // Validate video URL format (YouTube or Vimeo)
      if (formData.source_type === 'url' && formData.external_url) {
        const isValidYouTube = validateYouTubeUrl(formData.external_url);
        const isValidVimeo = validateVimeoUrl(formData.external_url);

        if (!isValidYouTube && !isValidVimeo) {
          toast.error('Пожалуйста, введите корректную ссылку на YouTube или Vimeo');
          return;
        }
      }

      if (formData.source_type === 'file' && !formData.file_path) {
        toast.error('Пожалуйста, загрузите видео файл');
        return;
      }

      setSaving(true);

      // Prepare data for submission
      const submitData: any = {
        title: formData.title,
        description: formData.description || null,
        unit_id: formData.unit_id,
        source_type: formData.source_type,
        status: formData.status,
        order_index: formData.order_index,
        is_visible_to_students: formData.is_visible_to_students
      };

      // Add source-specific fields
      if (formData.source_type === 'url') {
        submitData.external_url = formData.external_url;
      } else {
        if (!formData.file_path) {
          toast.error('Пожалуйста, загрузите видео файл');
          return;
        }
        submitData.file_path = formData.file_path;
      }

      console.log('Updating video with data:', submitData);

      await videosApi.updateVideo(parseInt(id), submitData);
      toast.success('Видео успешно обновлено!');
      navigate('/admin/videos');
    } catch (error: any) {
      console.error('Error saving video:', error);
      // Handle validation errors (422)
      if (error.response?.status === 422) {
        const detail = error.response?.data?.detail;
        if (Array.isArray(detail)) {
          const msg = detail.map((e: any) => e.msg || JSON.stringify(e)).join(', ');
          toast.error(`Ошибка валидации: ${msg}`);
        } else {
          toast.error('Ошибка валидации данных');
        }
      } else {
        toast.error(error.response?.data?.detail || 'Ошибка при сохранении видео');
      }
    } finally {
      setSaving(false);
    }
  };

  const getThumbnailUrl = () => {
    if (thumbnailPath) {
      const apiBase = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api/v1';
      return `${apiBase}/static/${thumbnailPath}`;
    }
    return '';
  };

  const handleVideoUrl = (url: string) => {
    setFormData(prev => ({ ...prev, external_url: url }));
    updateVideoPreview(url);
  };

  const updateVideoPreview = (url: string) => {
    // Extract video ID and create embed URL
    let embedUrl = '';
    let platform: 'youtube' | 'vimeo' | 'other' | null = null;
    let label = '';

    if (url.includes('youtube.com/watch') || url.includes('youtu.be/')) {
      let videoId = '';
      if (url.includes('youtube.com/watch')) {
        videoId = url.split('v=')[1]?.split('&')[0] || '';
      } else if (url.includes('youtu.be/')) {
        videoId = url.split('youtu.be/')[1]?.split('?')[0] || '';
      }
      if (videoId) {
        embedUrl = `https://www.youtube.com/embed/${videoId}`;
        platform = 'youtube';
        label = 'YouTube';
      }
    } else if (url.includes('vimeo.com/')) {
      const videoId = url.split('vimeo.com/')[1]?.split('?')[0] || '';
      if (videoId) {
        embedUrl = `https://player.vimeo.com/video/${videoId}`;
        platform = 'vimeo';
        label = 'Vimeo';
      }
    }

    if (embedUrl) {
      setVideoEmbedUrl(embedUrl);
      setPlatformBadge({ type: platform, label });
    } else {
      setVideoEmbedUrl('');
      setPlatformBadge({ type: null, label: '' });
    }
  };

  const switchSource = (type: 'url' | 'file') => {
    setFormData(prev => ({ ...prev, source_type: type }));
    if (type === 'file') {
      setSelectedFile(null);
      setUploadedFilePath(null);
      setVideoEmbedUrl('');
      setPlatformBadge({ type: null, label: '' });
    }
  };

  const stepNumber = (field: 'order_index', delta: number) => {
    const currentValue = formData.order_index;
    const newValue = Math.max(0, currentValue + delta);
    setFormData(prev => ({ ...prev, order_index: newValue }));
  };

  const selectedUnit = availableUnits.find(u => u.id === formData.unit_id);

  // Initialize video preview when external_url is loaded
  useEffect(() => {
    if (formData.external_url) {
      updateVideoPreview(formData.external_url);
    }
  }, [formData.external_url]);

  // Loading state UI
  if (loading) {
    return (
      <div className="min-h-screen" style={{ background: '#f0e9d8', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="flex flex-col items-center gap-3">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2" style={{ borderColor: '#1a7070' }}></div>
          <p className="text-sm" style={{ color: '#6b6456' }}>Загрузка данных видео...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,700;0,900;1,700&family=DM+Sans:wght@300;400;500&family=Space+Mono:wght@400;700&display=swap');
        
        .tf-root {
          --ink: #0e0e0e;
          --cream: #f5f0e8;
          --warm: #f0e9d8;
          --gold: #c9962a;
          --gold-light: #e8b84b;
          --rust: #c94a2a;
          --teal: #1a7070;
          --teal-light: #2a9898;
          --teal-dim: rgba(26,112,112,0.1);
          --muted: #6b6456;
          --line: rgba(14,14,14,0.1);
        }

        .tf-page {
          min-height: 100vh;
          background: var(--warm);
          font-family: 'DM Sans', sans-serif;
          font-weight: 300;
          color: var(--ink);
        }

        .tf-topbar {
          background: var(--cream);
          border-bottom: 1px solid var(--line);
          padding: 0 2.5rem;
          height: 64px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          position: sticky;
          top: 0;
          z-index: 50;
        }

        .tf-topbar-left {
          display: flex;
          align-items: center;
          gap: 1rem;
        }

        .tf-back-link {
          display: flex;
          align-items: center;
          gap: 0.45rem;
          font-family: 'Space Mono', monospace;
          font-size: 0.65rem;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: var(--muted);
          text-decoration: none;
          transition: color 0.2s;
          white-space: nowrap;
          background: none;
          border: none;
          cursor: pointer;
        }

        .tf-back-link:hover {
          color: var(--teal);
        }

        .tf-topbar-divider {
          width: 1px;
          height: 18px;
          background: var(--line);
          flex-shrink: 0;
        }

        .tf-breadcrumb {
          font-family: 'Space Mono', monospace;
          font-size: 0.65rem;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: var(--muted);
          display: flex;
          align-items: center;
          gap: 0.4rem;
        }

        .tf-breadcrumb .sep {
          opacity: 0.35;
        }

        .tf-breadcrumb .current {
          color: var(--ink);
        }

        .tf-btn-outline {
          background: none;
          border: 1px solid var(--line);
          padding: 0.48rem 1rem;
          font-family: 'Space Mono', monospace;
          font-size: 0.65rem;
          letter-spacing: 0.07em;
          cursor: pointer;
          color: var(--muted);
          transition: all 0.2s;
          display: flex;
          align-items: center;
          gap: 0.4rem;
        }

        .tf-btn-outline:hover {
          border-color: var(--ink);
          color: var(--ink);
        }

        .tf-btn-primary {
          background: var(--teal);
          color: #fff;
          border: none;
          padding: 0.52rem 1.25rem;
          font-family: 'Space Mono', monospace;
          font-size: 0.68rem;
          letter-spacing: 0.07em;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 0.45rem;
          transition: background 0.2s;
          white-space: nowrap;
        }

        .tf-btn-primary:hover {
          background: var(--teal-light);
        }

        .tf-btn-primary:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .tf-page-content {
          padding: 2.5rem 2.5rem 4rem;
        }

        .tf-page-header {
          margin-bottom: 2.25rem;
        }

        .tf-page-title {
          font-family: 'Playfair Display', serif;
          font-size: 2rem;
          font-weight: 900;
          line-height: 1.1;
        }

        .tf-page-title em {
          font-style: italic;
          color: var(--teal);
        }

        .tf-page-meta {
          margin-top: 0.4rem;
          font-size: 0.85rem;
          color: var(--muted);
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        .tf-form-layout {
          display: grid;
          grid-template-columns: 1fr 320px;
          gap: 1.75rem;
          align-items: start;
        }

        .tf-form-card {
          background: var(--cream);
          border: 1px solid var(--line);
        }

        .tf-card-header {
          padding: 1.1rem 1.5rem;
          border-bottom: 1px solid var(--line);
          display: flex;
          align-items: center;
          justify-content: space-between;
          background: var(--warm);
        }

        .tf-card-title {
          font-family: 'Space Mono', monospace;
          font-size: 0.68rem;
          font-weight: 700;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: var(--ink);
          display: flex;
          align-items: center;
          gap: 0.6rem;
        }

        .tf-card-title-num {
          width: 22px;
          height: 22px;
          background: var(--teal);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 0.62rem;
          font-weight: 700;
          color: #fff;
          border-radius: 50%;
          flex-shrink: 0;
        }

        .tf-card-body {
          padding: 1.5rem;
          display: flex;
          flex-direction: column;
          gap: 1.35rem;
        }

        .tf-field {
          display: flex;
          flex-direction: column;
          gap: 0.45rem;
        }

        .tf-field-label {
          font-family: 'Space Mono', monospace;
          font-size: 0.62rem;
          font-weight: 700;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: var(--ink);
          display: flex;
          align-items: center;
          gap: 0.35rem;
        }

        .tf-required-star {
          color: var(--rust);
          font-size: 0.8rem;
        }

        .tf-field-hint {
          font-size: 0.78rem;
          color: var(--muted);
          margin-top: -0.2rem;
          line-height: 1.5;
        }

        .tf-field-input {
          width: 100%;
          padding: 0.7rem 0.9rem;
          border: 1px solid var(--line);
          background: var(--warm);
          font-family: 'DM Sans', sans-serif;
          font-size: 0.9rem;
          font-weight: 300;
          color: var(--ink);
          outline: none;
          transition: border-color 0.2s, background 0.2s, box-shadow 0.2s;
          border-radius: 0;
          resize: none;
        }

        .tf-field-input:focus {
          border-color: var(--teal);
          background: var(--cream);
          box-shadow: 0 0 0 3px var(--teal-dim);
        }

        .tf-field-input::placeholder {
          color: rgba(107,100,86,0.4);
        }

        .tf-field-input.error {
          border-color: var(--rust);
        }

        textarea.tf-field-input {
          min-height: 100px;
          line-height: 1.6;
        }

        .tf-input-wrap {
          position: relative;
        }

        .tf-char-counter {
          position: absolute;
          bottom: 0.55rem;
          right: 0.7rem;
          font-family: 'Space Mono', monospace;
          font-size: 0.55rem;
          color: var(--muted);
          opacity: 0.5;
          pointer-events: none;
        }

        .tf-custom-select-wrap {
          position: relative;
        }

        .tf-custom-select-wrap::after {
          content: '';
          position: absolute;
          right: 0.9rem;
          top: 50%;
          transform: translateY(-50%);
          width: 0;
          height: 0;
          border-left: 4px solid transparent;
          border-right: 4px solid transparent;
          border-top: 5px solid var(--muted);
          pointer-events: none;
        }

        .tf-field-input.select-field {
          appearance: none;
          -webkit-appearance: none;
          cursor: pointer;
          padding-right: 2.5rem;
        }

        .tf-source-tabs {
          display: flex;
          border: 1px solid var(--line);
          overflow: hidden;
        }

        .tf-source-tab {
          flex: 1;
          padding: 0.65rem 0.5rem;
          border: none;
          background: var(--warm);
          font-family: 'Space Mono', monospace;
          font-size: 0.58rem;
          letter-spacing: 0.07em;
          text-transform: uppercase;
          color: var(--muted);
          cursor: pointer;
          transition: all 0.2s;
          text-align: center;
          border-right: 1px solid var(--line);
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.3rem;
        }

        .tf-source-tab:last-child {
          border-right: none;
        }

        .tf-source-tab:hover {
          background: var(--cream);
          color: var(--ink);
        }

        .tf-source-tab.active {
          background: var(--ink);
          color: var(--cream);
        }

        .tf-source-panel {
          display: none;
        }

        .tf-source-panel.active {
          display: flex;
          flex-direction: column;
          gap: 1.1rem;
        }

        .tf-video-embed-wrap {
          position: relative;
          width: 100%;
          padding-bottom: 56.25%;
          background: var(--ink);
          overflow: hidden;
        }

        .tf-video-embed-wrap iframe {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          border: none;
        }

        .tf-video-embed-placeholder {
          position: absolute;
          inset: 0;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 0.75rem;
        }

        .tf-platform-badge {
          display: inline-flex;
          align-items: center;
          gap: 0.45rem;
          padding: 0.3rem 0.7rem;
          font-family: 'Space Mono', monospace;
          font-size: 0.6rem;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }

        .tf-platform-yt {
          background: rgba(255,0,0,0.1);
          color: #cc0000;
        }

        .tf-platform-vimeo {
          background: rgba(26,120,190,0.1);
          color: #1a78be;
        }

        .tf-platform-other {
          background: var(--teal-dim);
          color: var(--teal);
        }

        .tf-file-drop {
          border: 2px dashed var(--line);
          background: var(--warm);
          padding: 2.25rem 1.5rem;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.75rem;
          cursor: pointer;
          transition: all 0.25s;
          text-align: center;
        }

        .tf-file-drop:hover,
        .tf-file-drop.drag {
          border-color: var(--teal);
          background: rgba(26,112,112,0.04);
        }

        .tf-file-drop-icon {
          width: 48px;
          height: 48px;
          background: var(--ink);
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .tf-file-drop-title {
          font-weight: 500;
          font-size: 0.9rem;
          color: var(--ink);
        }

        .tf-file-drop-sub {
          font-family: 'Space Mono', monospace;
          font-size: 0.58rem;
          color: var(--muted);
          opacity: 0.6;
          letter-spacing: 0.06em;
        }

        .tf-upload-progress {
          display: none;
          flex-direction: column;
          gap: 0.55rem;
        }

        .tf-upload-progress.active {
          display: flex;
        }

        .tf-upload-file-row {
          display: flex;
          align-items: center;
          gap: 0.75rem;
        }

        .tf-upload-file-icon {
          width: 32px;
          height: 32px;
          background: var(--teal-dim);
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        .tf-upload-file-info {
          flex: 1;
          min-width: 0;
        }

        .tf-upload-file-name {
          font-size: 0.82rem;
          font-weight: 500;
          color: var(--ink);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .tf-upload-file-size {
          font-family: 'Space Mono', monospace;
          font-size: 0.58rem;
          color: var(--muted);
        }

        .tf-upload-cancel {
          background: none;
          border: none;
          cursor: pointer;
          color: var(--muted);
          padding: 0.25rem;
          transition: color 0.2s;
        }

        .tf-upload-cancel:hover {
          color: var(--rust);
        }

        .tf-upload-bar-track {
          height: 4px;
          background: var(--warm);
          border: 1px solid var(--line);
          border-radius: 3px;
          overflow: hidden;
        }

        .tf-upload-bar-fill {
          height: 100%;
          background: var(--teal);
          border-radius: 3px;
          width: 0%;
          transition: width 0.3s;
        }

        .tf-upload-pct {
          font-family: 'Space Mono', monospace;
          font-size: 0.58rem;
          color: var(--teal);
          font-weight: 700;
        }

        .tf-number-input-wrap {
          position: relative;
          display: flex;
          align-items: center;
        }

        .tf-number-input-wrap .tf-field-input {
          -moz-appearance: textfield;
          padding-right: 2.5rem;
        }

        .tf-number-input-wrap .tf-field-input::-webkit-inner-spin-button,
        .tf-number-input-wrap .tf-field-input::-webkit-outer-spin-button {
          -webkit-appearance: none;
        }

        .tf-num-arrows {
          position: absolute;
          right: 1px;
          top: 1px;
          bottom: 1px;
          display: flex;
          flex-direction: column;
          width: 28px;
          border-left: 1px solid var(--line);
        }

        .tf-num-arrow {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          background: var(--warm);
          border: none;
          cursor: pointer;
          color: var(--muted);
          transition: background 0.15s, color 0.15s;
          font-size: 0.58rem;
        }

        .tf-num-arrow:hover {
          background: var(--cream);
          color: var(--teal);
        }

        .tf-num-arrow + .tf-num-arrow {
          border-top: 1px solid var(--line);
        }

        .tf-cover-area {
          border: 2px dashed var(--line);
          background: var(--warm);
          transition: all 0.2s;
          overflow: hidden;
        }

        .tf-cover-area:hover {
          border-color: var(--teal);
        }

        .tf-cover-placeholder {
          padding: 1.5rem;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.6rem;
          cursor: pointer;
        }

        .tf-cover-placeholder-text {
          font-size: 0.78rem;
          color: var(--muted);
          text-align: center;
        }

        .tf-cover-placeholder-sub {
          font-family: 'Space Mono', monospace;
          font-size: 0.54rem;
          color: var(--muted);
          opacity: 0.5;
          text-align: center;
        }

        .tf-cover-preview {
          width: 100%;
          aspect-ratio: 16/9;
          object-fit: cover;
          display: none;
        }

        .tf-cover-actions {
          display: flex;
          gap: 0.5rem;
        }

        .tf-cover-btn {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.35rem;
          padding: 0.55rem;
          border: 1px solid var(--line);
          background: var(--cream);
          font-family: 'Space Mono', monospace;
          font-size: 0.58rem;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          color: var(--muted);
          cursor: pointer;
          transition: all 0.2s;
        }

        .tf-cover-btn:hover {
          border-color: var(--teal);
          color: var(--teal);
          background: var(--teal-dim);
        }

        .tf-cover-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .tf-toggle-field {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 1rem;
        }

        .tf-toggle-info {
          flex: 1;
        }

        .tf-toggle-name {
          font-family: 'Space Mono', monospace;
          font-size: 0.62rem;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: var(--ink);
        }

        .tf-toggle-desc {
          font-size: 0.75rem;
          color: var(--muted);
          margin-top: 0.2rem;
          line-height: 1.4;
        }

        .tf-ts-inner {
          position: relative;
          width: 44px;
          height: 24px;
          display: block;
        }

        .tf-ts-inner input {
          opacity: 0;
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          cursor: pointer;
          z-index: 2;
          margin: 0;
        }

        .tf-ts-track {
          position: absolute;
          inset: 0;
          border-radius: 12px;
          background: rgba(107,100,86,0.2);
          border: 1px solid var(--line);
          transition: background 0.2s, border-color 0.2s;
        }

        .tf-ts-thumb {
          position: absolute;
          top: 3px;
          left: 3px;
          width: 16px;
          height: 16px;
          background: #fff;
          border-radius: 50%;
          box-shadow: 0 1px 4px rgba(0,0,0,0.18);
          transition: transform 0.22s cubic-bezier(0.34,1.56,0.64,1);
        }

        .tf-ts-inner input:checked ~ .tf-ts-track {
          background: var(--teal);
          border-color: var(--teal);
        }

        .tf-ts-inner input:checked ~ .tf-ts-thumb {
          transform: translateX(20px);
        }

        .tf-advanced-toggle {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0.85rem 1.5rem;
          background: var(--warm);
          border: 1px solid var(--line);
          cursor: pointer;
          user-select: none;
          transition: background 0.2s;
        }

        .tf-advanced-toggle:hover {
          background: var(--cream);
        }

        .tf-advanced-toggle-label {
          font-family: 'Space Mono', monospace;
          font-size: 0.65rem;
          font-weight: 700;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: var(--muted);
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        .tf-advanced-chevron {
          width: 16px;
          height: 16px;
          stroke: var(--muted);
          fill: none;
          stroke-width: 2;
          stroke-linecap: round;
          stroke-linejoin: round;
          transition: transform 0.3s;
        }

        .tf-advanced-toggle.open .tf-advanced-chevron {
          transform: rotate(180deg);
        }

        .tf-advanced-panel {
          display: none;
        }

        .tf-advanced-panel.open {
          display: flex;
          flex-direction: column;
          gap: 1.25rem;
        }

        .tf-advanced-panel .tf-form-card {
          border-top: none;
        }

        .tf-sidebar-cards {
          display: flex;
          flex-direction: column;
          gap: 1.25rem;
        }

        .tf-preview-card {
          background: var(--ink);
          border: 1px solid rgba(255,255,255,0.06);
        }

        .tf-preview-card .tf-card-header {
          background: rgba(255,255,255,0.04);
          border-bottom: 1px solid rgba(255,255,255,0.06);
        }

        .tf-preview-card .tf-card-title {
          color: rgba(245,240,232,0.5);
        }

        .tf-preview-card .tf-card-body {
          gap: 0;
          padding: 0;
        }

        .tf-unit-chip {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.75rem 1rem;
          border-bottom: 1px solid rgba(255,255,255,0.05);
        }

        .tf-unit-chip-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          flex-shrink: 0;
        }

        .tf-unit-chip-text {
          font-size: 0.8rem;
          color: rgba(245,240,232,0.6);
          flex: 1;
        }

        .tf-tips-card {
          background: var(--cream);
          border: 1px solid var(--line);
        }

        .tf-tip-item {
          display: flex;
          gap: 0.65rem;
          padding: 0.75rem 1.25rem;
          border-bottom: 1px solid var(--line);
        }

        .tf-tip-item:last-child {
          border-bottom: none;
        }

        .tf-tip-icon {
          width: 24px;
          height: 24px;
          flex-shrink: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          margin-top: 0.1rem;
        }

        .tf-tip-text {
          font-size: 0.78rem;
          color: var(--muted);
          line-height: 1.5;
        }

        .tf-tip-text strong {
          color: var(--ink);
          font-weight: 500;
        }

        .tf-field-input[type="date"],
        .tf-field-input[type="datetime-local"] {
          color-scheme: light;
        }

        @media (max-width: 1100px) {
          .tf-form-layout {
            grid-template-columns: 1fr;
          }
          .tf-sidebar-cards {
            display: contents;
          }
        }

        @media (max-width: 900px) {
          .tf-page-content {
            padding: 1.5rem 1.5rem 3rem;
          }
          .tf-topbar {
            padding: 0 1.5rem;
          }
        }
      `}</style>

      <div className="tf-page tf-root">
        <header className="tf-topbar">
          <div className="tf-topbar-left">
            <button onClick={() => navigate('/admin/videos')} className="tf-back-link">
              <ArrowLeft className="w-3 h-3" />
              Назад к видео
            </button>
            <div className="tf-topbar-divider"></div>
            <div className="tf-breadcrumb">
              <span>Видео</span>
              <span className="sep">›</span>
              <span className="current">Редактирование видео</span>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <button className="tf-btn-outline" onClick={() => handleSave()} disabled={saving}>
              <Save className="w-3 h-3" />
              Черновик
            </button>
            <button className="tf-btn-primary" onClick={() => handleSave()} disabled={saving}>
              <Video className="w-3 h-3" />
              {saving ? 'Сохранение...' : 'Сохранить изменения'}
            </button>
          </div>
        </header>

        <div className="tf-page-content">
          <div className="tf-page-header">
            <h1 className="tf-page-title">Редактирование <em>видео</em></h1>
            <p className="tf-page-meta">
              <Clock className="w-3 h-3" />
              Измените видео-урок в юните — как лекцию в онлайн-курсе.
            </p>
          </div>

          <div className="tf-form-layout">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              {/* CARD 1: Основная информация */}
              <div className="tf-form-card">
                <div className="tf-card-header">
                  <div className="tf-card-title">
                    <div className="tf-card-title-num">1</div>
                    Основная информация
                  </div>
                </div>
                <div className="tf-card-body">
                  <div className="tf-field">
                    <label className="tf-field-label" htmlFor="video-title">
                      Название видео <span className="tf-required-star">*</span>
                    </label>
                    <div className="tf-input-wrap">
                      <input
                        type="text"
                        id="video-title"
                        className="tf-field-input"
                        placeholder="Например: Итальянский А1 — Приветствия и знакомство"
                        maxLength={120}
                        value={formData.title}
                        onChange={handleChange}
                        name="title"
                      />
                      <span className="tf-char-counter">{formData.title.length} / 120</span>
                    </div>
                  </div>
                  
                  <div className="tf-field">
                    <label className="tf-field-label" htmlFor="video-desc">Описание</label>
                    <div className="tf-input-wrap">
                      <textarea
                        id="video-desc"
                        className="tf-field-input"
                        placeholder="Опишите содержание видео-урока…"
                        rows={3}
                        maxLength={600}
                        value={formData.description}
                        onChange={handleChange}
                        name="description"
                      />
                      <span className="tf-char-counter">{formData.description.length} / 600</span>
                    </div>
                  </div>
                  
                  <div className="tf-field">
                    <label className="tf-field-label" htmlFor="video-unit">
                      Юнит <span className="tf-required-star">*</span>
                    </label>
                    <div className="tf-custom-select-wrap">
                      <select
                        id="video-unit"
                        className="tf-field-input select-field"
                        value={formData.unit_id}
                        onChange={handleChange}
                        name="unit_id"
                        disabled={loadingUnits}
                      >
                        <option value={0}>Выберите юнит</option>
                        {availableUnits.map(unit => (
                          <option key={unit.id} value={unit.id}>
                            {unit.title} ({unit.level})
                          </option>
                        ))}
                      </select>
                    </div>
                    <p className="tf-field-hint">Выберите юнит, к которому относится это видео.</p>
                  </div>
                </div>
              </div>

              
              {/* CARD 2: Источник видео */}
              <div className="tf-form-card">
                <div className="tf-card-header">
                  <div className="tf-card-title">
                    <div className="tf-card-title-num">2</div>
                    Источник видео
                  </div>
                  {platformBadge.type && (
                    <span className={`tf-platform-badge ${
                      platformBadge.type === 'youtube' ? 'tf-platform-yt' :
                      platformBadge.type === 'vimeo' ? 'tf-platform-vimeo' :
                      'tf-platform-other'
                    }`}>
                      {platformBadge.label}
                    </span>
                  )}
                </div>
                <div className="tf-card-body">
                  <div className="tf-field">
                    <label className="tf-field-label">Тип источника <span className="tf-required-star">*</span></label>
                    <div className="tf-source-tabs">
                      <button
                        className={`tf-source-tab ${formData.source_type === 'url' ? 'active' : ''}`}
                        onClick={() => switchSource('url')}
                        type="button"
                      >
                        <Youtube className="w-4 h-4" />
                        YouTube / Vimeo
                      </button>
                      <button
                        className={`tf-source-tab ${formData.source_type === 'file' ? 'active' : ''}`}
                        onClick={() => switchSource('file')}
                        type="button"
                      >
                        <File className="w-4 h-4" />
                        Файл
                      </button>
                    </div>
                  </div>
                  
                  {/* Panel: YouTube / Vimeo */}
                  {formData.source_type === 'url' && (
                    <div className="tf-source-panel active">
                      <div className="tf-field">
                        <label className="tf-field-label" htmlFor="yt-url">
                          URL видео (YouTube / Vimeo) <span className="tf-required-star">*</span>
                        </label>
                        <input
                          type="url"
                          id="yt-url"
                          className="tf-field-input"
                          placeholder="https://www.youtube.com/watch?v=… или https://vimeo.com/…"
                          value={formData.external_url || ''}
                          onChange={(e) => handleVideoUrl(e.target.value)}
                        />
                        <p className="tf-field-hint">Поддерживаются ссылки YouTube и Vimeo.</p>
                      </div>

                      <div className="tf-video-embed-wrap">
                        {videoEmbedUrl ? (
                          <iframe
                            src={videoEmbedUrl}
                            allowFullScreen
                            style={{ display: 'block' }}
                          />
                        ) : (
                          <div className="tf-video-embed-placeholder">
                            <Video className="w-10 h-10" style={{ stroke: 'rgba(245,240,232,0.2)' }} />
                            <span style={{ fontFamily: "'Space Mono', monospace", fontSize: '0.6rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(245,240,232,0.2)' }}>
                              Вставьте ссылку для предпросмотра
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                  
                  {/* Panel: File upload */}
                  {formData.source_type === 'file' && (
                    <div className="tf-source-panel active">
                      {!selectedFile && !uploadedFilePath && !formData.file_path ? (
                        <div 
                          className="tf-file-drop"
                          onClick={() => document.getElementById('video-file-input')?.click()}
                          onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('drag'); }}
                          onDragLeave={(e) => { e.currentTarget.classList.remove('drag'); }}
                          onDrop={(e) => {
                            e.preventDefault();
                            e.currentTarget.classList.remove('drag');
                            const file = e.dataTransfer.files[0];
                            if (file) handleFileSelect({ target: { files: [file] } } as any);
                          }}
                        >
                          <div className="tf-file-drop-icon">
                            <Upload className="w-6 h-6" style={{ stroke: 'rgba(245,240,232,0.6)' }} />
                          </div>
                          <div className="tf-file-drop-title">Перетащите видеофайл</div>
                          <div className="tf-file-drop-sub">MP4 · MOV · AVI · до 2 GB</div>
                          <input
                            type="file"
                            id="video-file-input"
                            accept="video/*"
                            style={{ display: 'none' }}
                            onChange={handleFileSelect}
                          />
                        </div>
                      ) : selectedFile && !uploadedFilePath ? (
                        <div className="tf-upload-progress active">
                          <div className="tf-upload-file-row">
                            <div className="tf-upload-file-icon">
                              <Video className="w-4 h-4" style={{ stroke: 'var(--teal)' }} />
                            </div>
                            <div className="tf-upload-file-info">
                              <div className="tf-upload-file-name">{selectedFile.name}</div>
                              <div className="tf-upload-file-size">{formatFileSize(selectedFile.size)}</div>
                            </div>
                            <button className="tf-upload-cancel" onClick={handleRemoveFile} disabled={uploading}>
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                          <div className="tf-upload-bar-track">
                            <div className="tf-upload-bar-fill" style={{ width: `${uploadProgress}%` }}></div>
                          </div>
                          <div className="tf-upload-pct">{uploadProgress}%</div>
                          {!uploading && (
                            <button
                              type="button"
                              onClick={handleFileUpload}
                              className="tf-cover-btn"
                            >
                              <Upload className="w-3 h-3" />
                              Загрузить видео
                            </button>
                          )}
                        </div>
                      ) : (uploadedFilePath || formData.file_path) ? (
                        <div className="tf-upload-progress active">
                          <div className="tf-upload-file-row">
                            <div className="tf-upload-file-icon">
                              <Check className="w-4 h-4" style={{ stroke: 'var(--teal)' }} />
                            </div>
                            <div className="tf-upload-file-info">
                              <div className="tf-upload-file-name">{selectedFile?.name || formData.file_path?.split('/').pop() || 'Видео загружено'}</div>
                              <div className="tf-upload-file-size" style={{ color: 'var(--teal)' }}>
                                {uploadedFilePath ? 'Файл успешно загружен' : 'Текущий файл'}
                              </div>
                            </div>
                            <button className="tf-upload-cancel" onClick={handleRemoveFile}>
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  )}
                </div>
              </div>

              {/* CARD 3: Обложка видео */}
              <div className="tf-form-card">
                <div className="tf-card-header">
                  <div className="tf-card-title">
                    <div className="tf-card-title-num">3</div>
                    Обложка видео
                  </div>
                </div>
                <div className="tf-card-body">
                  <p className="tf-field-hint" style={{ marginTop: '-0.25rem' }}>Загрузите обложку или она будет сгенерирована автоматически</p>

                  <div className={`tf-cover-area ${getThumbnailUrl() ? 'has-preview' : ''}`} style={{ position: 'relative' }}>
                    {getThumbnailUrl() ? (
                      <>
                        <img src={getThumbnailUrl()} alt="Video cover" className="tf-cover-preview" style={{ display: 'block' }} />
                        <button
                          type="button"
                          onClick={async () => {
                            if (!id) return;
                            if (!window.confirm('Вы уверены, что хотите удалить обложку?')) return;
                            
                            setUploadingThumbnail(true);
                            try {
                              await videosApi.updateVideo(parseInt(id), { thumbnail_path: null } as any);
                              setThumbnailPath(null);
                              setThumbnailKey(prev => prev + 1);
                              toast.success('Обложка успешно удалена!');
                            } catch (error: any) {
                              toast.error(error.response?.data?.detail || 'Ошибка при удалении обложки');
                            } finally {
                              setUploadingThumbnail(false);
                            }
                          }}
                          disabled={uploadingThumbnail}
                          style={{
                            position: 'absolute',
                            top: '0.5rem',
                            right: '0.5rem',
                            background: 'var(--rust)',
                            color: '#fff',
                            border: 'none',
                            borderRadius: '50%',
                            width: '32px',
                            height: '32px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'pointer'
                          }}
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </>
                    ) : (
                      <div className="tf-cover-placeholder" onClick={() => document.getElementById('cover-file')?.click()}>
                        <ImageIcon className="w-5 h-5" style={{ stroke: 'var(--muted)', opacity: 0.5 }} />
                        <div className="tf-cover-placeholder-text">
                          Нажмите, чтобы загрузить обложку<br />
                          <span className="tf-cover-placeholder-sub">PNG, JPG, WebP · до 5 MB · рекомендуется 1280×720px</span>
                        </div>
                        <input
                          type="file"
                          id="cover-file"
                          accept="image/*"
                          style={{ display: 'none' }}
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (!file || !id) return;
                            
                            setUploadingThumbnail(true);
                            try {
                              const result = await videosApi.uploadThumbnail(parseInt(id), file);
                              setThumbnailPath(result.thumbnail_path);
                              setThumbnailKey(prev => prev + 1);
                              toast.success('Обложка успешно загружена!');
                            } catch (error: any) {
                              toast.error(error.response?.data?.detail || 'Ошибка при загрузке обложки');
                            } finally {
                              setUploadingThumbnail(false);
                            }
                          }}
                        />
                      </div>
                    )}
                  </div>

                  <div className="tf-cover-actions">
                    <button className="tf-cover-btn" onClick={() => document.getElementById('cover-file')?.click()}>
                      <Upload className="w-3 h-3" />
                      Загрузить файл
                    </button>
                    <button 
                      className="tf-cover-btn" 
                      onClick={async () => {
                        if (!id) return;
                        setUploadingThumbnail(true);
                        try {
                          const result = await videosApi.generateThumbnail(parseInt(id));
                          setThumbnailPath(result.thumbnail_path);
                          setThumbnailKey(prev => prev + 1);
                          toast.success('Обложка успешно сгенерирована!');
                        } catch (error: any) {
                          toast.error(error.response?.data?.detail || 'Ошибка при генерации обложки');
                        } finally {
                          setUploadingThumbnail(false);
                        }
                      }}
                      disabled={uploadingThumbnail || !formData.unit_id}
                    >
                      <Sparkles className="w-3 h-3" />
                      {uploadingThumbnail ? 'Генерация...' : 'Сгенерировать обложку'}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            
            {/* ══ RIGHT COLUMN ══ */}
            <div className="tf-sidebar-cards">
              {/* Preview Card */}
              <div className="tf-preview-card">
                <div className="tf-card-header">
                  <div className="tf-card-title">
                    <Video className="w-3 h-3" />
                    Предпросмотр
                  </div>
                </div>
                <div className="tf-card-body">
                  {getThumbnailUrl() ? (
                    <img src={getThumbnailUrl()} alt="Video cover" style={{ width: '100%', aspectRatio: '16/9', objectFit: 'cover', display: 'block' }} />
                  ) : (
                    <div style={{ width: '100%', aspectRatio: '16/9', background: 'var(--ink)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Video className="w-10 h-10" style={{ stroke: 'rgba(245,240,232,0.2)' }} />
                    </div>
                  )}
                  <div style={{ padding: '1rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    <h3 style={{ fontFamily: "'Playfair Display',serif", fontSize: '1.2rem', fontWeight: 700, color: 'var(--cream)', lineHeight: 1.3 }}>
                      {formData.title || 'Название видео'}
                    </h3>
                    <p style={{ fontSize: '0.8rem', color: 'rgba(245,240,232,0.6)', lineHeight: 1.5 }}>
                      {formData.description || 'Описание видео'}
                    </p>
                    {selectedUnit && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '0.5rem' }}>
                        <div className="tf-unit-chip">
                          <div className="tf-unit-chip-dot" style={{ background: 'var(--teal)' }}></div>
                          <span className="tf-unit-chip-text">{selectedUnit.title}</span>
                        </div>
                        <div className="tf-unit-chip">
                          <div className="tf-unit-chip-dot" style={{ background: 'var(--gold)' }}></div>
                          <span className="tf-unit-chip-text">Порядок: {formData.order_index}</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Advanced toggle */}
              <div className={`tf-advanced-toggle ${showAdvanced ? 'open' : ''}`} onClick={() => setShowAdvanced(!showAdvanced)}>
                <span className="tf-advanced-toggle-label">
                  <SettingsIcon className="w-3 h-3" />
                  Расширенные настройки
                </span>
                <svg className="tf-advanced-chevron" viewBox="0 0 24 24">
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </div>

              {/* Advanced panel */}
              <div className={`tf-advanced-panel ${showAdvanced ? 'open' : ''}`}>
                <div className="tf-form-card">
                  <div className="tf-card-header">
                    <div className="tf-card-title">
                      <Clock className="w-3 h-3" />
                      Публикация и порядок
                    </div>
                  </div>
                  <div className="tf-card-body">
                    {/* Порядок отображения */}
                    <div className="tf-field">
                      <label className="tf-field-label" htmlFor="sort-order">Порядок отображения</label>
                      <p className="tf-field-hint">Номер для сортировки видео (меньше = выше в списке)</p>
                      <div className="tf-number-input-wrap">
                        <input
                          type="number"
                          id="sort-order"
                          className="tf-field-input"
                          placeholder="0"
                          min="0"
                          max="9999"
                          value={formData.order_index}
                          onChange={(e) => {
                            const val = parseInt(e.target.value) || 0;
                            setFormData(prev => ({ ...prev, order_index: val }));
                          }}
                        />
                        <div className="tf-num-arrows">
                          <button className="tf-num-arrow" onClick={() => stepNumber('order_index', 1)}>▲</button>
                          <button className="tf-num-arrow" onClick={() => stepNumber('order_index', -1)}>▼</button>
                        </div>
                      </div>
                    </div>

                    {/* Видимость */}
                    <div className="tf-toggle-field">
                      <div className="tf-toggle-info">
                        <div className="tf-toggle-name">Видимость для студентов</div>
                        <div className="tf-toggle-desc">Если выключено, видео не будет отображаться в каталоге</div>
                      </div>
                      <label className="tf-ts-inner">
                        <input
                          type="checkbox"
                          checked={formData.is_visible_to_students}
                          onChange={(e) => handleCheckboxChange('is_visible_to_students', e.target.checked)}
                        />
                        <div className="tf-ts-track"></div>
                        <div className="tf-ts-thumb"></div>
                      </label>
                    </div>
                  </div>
                </div>
              </div>

              {/* Tips Card */}
              <div className="tf-tips-card">
                <div className="tf-card-header">
                  <div className="tf-card-title">
                    <Info className="w-3 h-3" />
                    Советы
                  </div>
                </div>
                <div className="tf-card-body" style={{ padding: 0 }}>
                  <div className="tf-tip-item">
                    <div className="tf-tip-icon">
                      <Check className="w-3 h-3" />
                    </div>
                    <div className="tf-tip-text">Всегда добавляйте <strong>описание</strong> к видео. Это улучшает SEO и помогает студентам.</div>
                  </div>
                  <div className="tf-tip-item">
                    <div className="tf-tip-icon">
                      <Check className="w-3 h-3" />
                    </div>
                    <div className="tf-tip-text">Используйте <strong>качественные обложки</strong>. Они привлекают внимание и повышают кликабельность.</div>
                  </div>
                  <div className="tf-tip-item">
                    <div className="tf-tip-icon">
                      <Check className="w-3 h-3" />
                    </div>
                    <div className="tf-tip-text">Разбивайте длинные видео на <strong>короткие юниты</strong> для лучшего усвоения материала.</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
