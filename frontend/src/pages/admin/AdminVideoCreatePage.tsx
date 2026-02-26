import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
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
import { videosApi, unitsApi } from '../../services/api';
import toast from 'react-hot-toast';

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
  publish_at: string;
  meta_title: string;
  meta_description: string;
}

export default function AdminVideoCreatePage() {
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  
  const [formData, setFormData] = useState<VideoFormData>({
    title: '',
    description: '',
    unit_id: 0,
    source_type: 'url',
    external_url: '',
    status: 'draft',
    order_index: 0,
    is_visible_to_students: true,
    publish_at: '',
    meta_title: '',
    meta_description: ''
  });
  
  const [availableUnits, setAvailableUnits] = useState<any[]>([]);
  const [loadingUnits, setLoadingUnits] = useState(true);
  
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadedFilePath, setUploadedFilePath] = useState<string | null>(null);

  const [thumbnailFile, setThumbnailFile] = useState<File | null>(null);
  const [thumbnailPreviewUrl, setThumbnailPreviewUrl] = useState<string | null>(null);
  const [uploadingThumbnail, setUploadingThumbnail] = useState(false);
  const [autoGenerateThumbnail, setAutoGenerateThumbnail] = useState(true);
  
  const [videoEmbedUrl, setVideoEmbedUrl] = useState<string>('');
  const [platformBadge, setPlatformBadge] = useState<{ type: 'youtube' | 'vimeo' | 'other' | null; label: string }>({ type: null, label: '' });
  
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
  
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value === 'true' || value === 'false' ? value === 'true' : value
    }));
    
    if (name === 'title') {
      updatePreview();
    }
  };
  
  const handleCheckboxChange = (name: string, checked: boolean) => {
    setFormData(prev => ({
      ...prev,
      [name]: checked
    }));
  };
  
  const validateYouTubeUrl = (url: string): boolean => {
    const patterns = [
      /^https?:\/\/(www\.)?youtube\.com\/watch\?v=[a-zA-Z0-9_-]+/,
      /^https?:\/\/(www\.)?youtu\.be\/[a-zA-Z0-9_-]+/,
      /^https?:\/\/(www\.)?youtube\.com\/embed\/[a-zA-Z0-9_-]+/
    ];
    return patterns.some(pattern => pattern.test(url));
  };
  
  const validateVimeoUrl = (url: string): boolean => {
    const patterns = [
      /^https?:\/\/(www\.)?vimeo\.com\/\d+/,
      /^https?:\/\/(www\.)?vimeo\.com\/embed\/\d+/
    ];
    return patterns.some(pattern => pattern.test(url));
  };
  
  const handleVideoUrl = (url: string) => {
    setFormData(prev => ({ ...prev, external_url: url }));
    
    let embedSrc = '';
    let platform: 'youtube' | 'vimeo' | 'other' | null = null;
    
    const ytMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([A-Za-z0-9_-]{11})/);
    if (ytMatch) {
      embedSrc = `https://www.youtube.com/embed/${ytMatch[1]}`;
      platform = 'youtube';
      setPlatformBadge({ type: 'youtube', label: 'YouTube' });
    } else {
      const vmMatch = url.match(/vimeo\.com\/(\d+)/);
      if (vmMatch) {
        embedSrc = `https://player.vimeo.com/video/${vmMatch[1]}`;
        platform = 'vimeo';
        setPlatformBadge({ type: 'vimeo', label: 'Vimeo' });
      } else if (url) {
        platform = 'other';
        setPlatformBadge({ type: 'other', label: 'Внешняя ссылка' });
      } else {
        setPlatformBadge({ type: null, label: '' });
      }
    }
    
    setVideoEmbedUrl(embedSrc);
  };
  
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const allowedTypes = ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo', 'video/x-matroska', 'video/ogg', 'video/x-flv', 'video/3gpp', 'video/x-ms-wmv'];
    const allowedExtensions = ['.mp4', '.webm', '.mov', '.avi', '.mkv', '.ogv', '.flv', '.3gp', '.wmv'];
    const fileExt = '.' + file.name.split('.').pop()?.toLowerCase();
    
    if (!allowedTypes.includes(file.type) && !allowedExtensions.includes(fileExt)) {
      toast.error('Неподдерживаемый формат файла. Разрешены: MP4, WebM, MOV, AVI, MKV, OGV, FLV, 3GP, WMV');
      return;
    }
    
    const maxSize = 2 * 1024 * 1024 * 1024;
    if (file.size > maxSize) {
      toast.error('Файл слишком большой. Максимальный размер: 2GB');
      return;
    }
    
    setSelectedFile(file);
    setUploadedFilePath(null);
    startUploadSim(file);
  };
  
  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'video/*';
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);
      input.files = dataTransfer.files;
      handleFileSelect({ target: input } as any);
    }
  };
  
  let uploadInterval: NodeJS.Timeout | null = null;
  const startUploadSim = (file: File) => {
      setUploading(true);
      setUploadProgress(0);
      
    let pct = 0;
    if (uploadInterval) clearInterval(uploadInterval);
    
    uploadInterval = setInterval(() => {
      pct = Math.min(100, pct + Math.random() * 8 + 2);
      setUploadProgress(pct);
      
      if (pct >= 100) {
        if (uploadInterval) clearInterval(uploadInterval);
        handleFileUpload(file);
      }
    }, 200);
  };
  
  const handleFileUpload = async (file: File) => {
    try {
      const result = await videosApi.uploadVideoFile(file);
      setUploadedFilePath(result.file_path);
      setFormData(prev => ({ ...prev, file_path: result.file_path }));
      setUploading(false);
      toast.success('Видео успешно загружено!');
    } catch (error: any) {
      console.error('Error uploading file:', error);
      toast.error(error.response?.data?.detail || 'Ошибка при загрузке видео');
      setSelectedFile(null);
      setUploadProgress(0);
      setUploading(false);
    }
  };
  
  const cancelUpload = () => {
    if (uploadInterval) clearInterval(uploadInterval);
    setUploading(false);
    setSelectedFile(null);
    setUploadProgress(0);
    setUploadedFilePath(null);
  };
  
  const handleRemoveFile = () => {
    setSelectedFile(null);
    setUploadedFilePath(null);
    setFormData(prev => ({ ...prev, file_path: undefined }));
    setUploadProgress(0);
  };

  const handleThumbnailSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setThumbnailFile(file);
    setThumbnailPreviewUrl(URL.createObjectURL(file));
    setAutoGenerateThumbnail(false);
  };

  const handleRemoveThumbnail = () => {
    setThumbnailFile(null);
    if (thumbnailPreviewUrl) {
      URL.revokeObjectURL(thumbnailPreviewUrl);
    }
    setThumbnailPreviewUrl(null);
  };
  
  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };
  
  const handleSave = async (publish: boolean = false) => {
    try {
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
      
      const status = publish ? 'published' : 'draft';
      const is_visible_to_students = publish;
      
      const submitData: any = {
        title: formData.title,
        description: formData.description || null,
        unit_id: formData.unit_id,
        source_type: formData.source_type,
        status: status,
        order_index: formData.order_index,
        is_visible_to_students: is_visible_to_students,
        publish_at: formData.publish_at || undefined,
        meta_title: formData.meta_title || undefined,
        meta_description: formData.meta_description || undefined
      };
      
      if (formData.source_type === 'url') {
        submitData.external_url = formData.external_url;
      } else {
        if (!formData.file_path) {
          toast.error('Пожалуйста, загрузите видео файл');
          return;
        }
        submitData.file_path = formData.file_path;
      }
      
      const createdVideo = await videosApi.createVideo(submitData);

      if (createdVideo?.id) {
        if (thumbnailFile) {
          setUploadingThumbnail(true);
          try {
            await videosApi.uploadThumbnail(createdVideo.id, thumbnailFile);
            toast.success('Обложка успешно загружена!');
          } catch (error: any) {
            toast.error(error.response?.data?.detail || 'Ошибка при загрузке обложки');
          } finally {
            setUploadingThumbnail(false);
          }
        } else if (autoGenerateThumbnail) {
          setUploadingThumbnail(true);
          try {
            await videosApi.generateThumbnail(createdVideo.id);
            toast.success('Обложка автоматически сгенерирована!');
          } catch (error: any) {
            toast.error(error.response?.data?.detail || 'Ошибка при генерации обложки');
          } finally {
            setUploadingThumbnail(false);
          }
        }
      }
      
      toast.success(
        publish 
          ? 'Видео успешно опубликовано!' 
          : 'Видео успешно сохранено!'
      );
      
      navigate('/admin/videos');
    } catch (error: any) {
      console.error('Error saving video:', error);
      toast.error(error.response?.data?.detail || 'Ошибка при создании видео');
    } finally {
      setSaving(false);
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
  
  const updatePreview = () => {
    // Preview updates handled in render
  };
  
  const updateUnitPreview = () => {
    // Unit preview updates handled in render
  };
  
  const stepNumber = (field: 'order_index', delta: number) => {
    const currentValue = formData.order_index;
    const newValue = Math.max(0, currentValue + delta);
    setFormData(prev => ({ ...prev, order_index: newValue }));
  };
  
  const selectedUnit = availableUnits.find(u => u.id === formData.unit_id);
  
  const previewCover = (input: HTMLInputElement) => {
    if (!input.files?.[0]) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const src = e.target?.result as string;
      setThumbnailPreviewUrl(src);
    };
    reader.readAsDataURL(input.files[0]);
  };
  
  const generateCover = async () => {
    if (!formData.title.trim()) {
      toast.error('Сначала введите название видео');
      return;
    }
    
    if (!formData.unit_id) {
      toast.error('Сначала выберите юнит');
      return;
    }
    
    // Create draft video first
    try {
      const draftData = {
        title: formData.title,
        description: formData.description || undefined,
        unit_id: formData.unit_id,
        source_type: formData.source_type,
        status: 'draft' as const,
        order_index: formData.order_index,
        is_visible_to_students: false,
        external_url: formData.external_url || undefined,
        file_path: formData.file_path || undefined
      };
      
      const createdVideo = await videosApi.createVideo(draftData);
      
      if (createdVideo?.id) {
        try {
          const thumbnailResult = await videosApi.generateThumbnail(createdVideo.id);
          if (thumbnailResult.thumbnail_path) {
            const apiBase = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api/v1';
            setThumbnailPreviewUrl(`${apiBase}/static/${thumbnailResult.thumbnail_path}`);
            toast.success('Обложка успешно сгенерирована!');
          }
        } catch (error: any) {
          toast.error(error.response?.data?.detail || 'Ошибка при генерации обложки');
        }
      }
    } catch (error: any) {
      toast.error(error.response?.data?.detail || 'Ошибка при создании видео');
    }
  };
  
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
              <span className="current">Создание видео</span>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <button className="tf-btn-outline" onClick={() => handleSave(false)} disabled={saving}>
              <Save className="w-3 h-3" />
              Черновик
            </button>
            <button className="tf-btn-primary" onClick={() => handleSave(true)} disabled={saving}>
              <Video className="w-3 h-3" />
              {saving ? 'Публикация...' : 'Опубликовать'}
            </button>
          </div>
        </header>

        <div className="tf-page-content">
          <div className="tf-page-header">
            <h1 className="tf-page-title">Создание <em>нового видео</em></h1>
            <p className="tf-page-meta">
              <Clock className="w-3 h-3" />
              Добавьте новый видео-урок в юнит — как лекцию в онлайн-курсе.
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
                        onChange={(e) => {
                          handleChange(e);
                          updatePreview();
                        }}
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
                        onChange={(e) => {
                          handleChange(e);
                          updateUnitPreview();
                        }}
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
                    {!selectedFile && !uploadedFilePath ? (
                        <div
                          className="tf-file-drop"
                          onClick={() => document.getElementById('video-file')?.click()}
                          onDragOver={(e) => {
                            e.preventDefault();
                            e.currentTarget.classList.add('drag');
                          }}
                          onDragLeave={(e) => {
                            e.currentTarget.classList.remove('drag');
                          }}
                          onDrop={handleFileDrop}
                        >
                          <div className="tf-file-drop-icon">
                            <Upload className="w-6 h-6" style={{ stroke: 'rgba(245,240,232,0.6)' }} />
                      </div>
                          <div className="tf-file-drop-title">Перетащите видеофайл сюда</div>
                          <div className="tf-file-drop-sub">MP4, WebM, MOV · до 4 GB</div>
                            </div>
                      ) : (
                        <div className="tf-upload-progress active">
                          <div className="tf-upload-file-row">
                            <div className="tf-upload-file-icon">
                              <Video className="w-4 h-4" style={{ stroke: 'var(--teal)' }} />
                            </div>
                            <div className="tf-upload-file-info">
                              <div className="tf-upload-file-name">
                                {selectedFile?.name || 'Видео загружено'}
                          </div>
                              <div className="tf-upload-file-size">
                                {selectedFile ? formatFileSize(selectedFile.size) : '—'}
                        </div>
                            </div>
                            <button className="tf-upload-cancel" onClick={handleRemoveFile} type="button">
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                          <div className="tf-upload-bar-track">
                            <div
                              className="tf-upload-bar-fill"
                                style={{ width: `${uploadProgress}%` }}
                              />
                            </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontFamily: "'Space Mono', monospace", fontSize: '0.58rem', color: 'var(--muted)' }}>
                              {uploading ? 'Загрузка…' : 'Загружено ✓'}
                            </span>
                            <span className="tf-upload-pct">{Math.floor(uploadProgress)}%</span>
                          </div>
                          </div>
                        )}
                      <input
                        type="file"
                        id="video-file"
                        accept="video/*"
                        style={{ display: 'none' }}
                        onChange={handleFileSelect}
                      />
                  </div>
                )}
              </div>
            </div>

              {/* Advanced toggle */}
              <div className={`tf-advanced-toggle ${showAdvanced ? 'open' : ''}`} onClick={() => setShowAdvanced(!showAdvanced)}>
                <span className="tf-advanced-toggle-label">
                  <SettingsIcon className="w-3 h-3" style={{ stroke: 'var(--muted)' }} />
                  Расширенные настройки
                </span>
                <svg className="tf-advanced-chevron" viewBox="0 0 24 24">
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </div>

              {/* Advanced panel */}
              <div className={`tf-advanced-panel ${showAdvanced ? 'open' : ''}`}>
                {/* Advanced card: publish + order */}
                <div className="tf-form-card" style={{ borderTop: 'none' }}>
                  <div className="tf-card-header">
                    <div className="tf-card-title">
                      <Clock className="w-3.5 h-3.5" style={{ stroke: 'var(--teal)' }} />
                      Публикация и порядок
                    </div>
                  </div>
                  <div className="tf-card-body">
                    <div className="tf-field">
                      <label className="tf-field-label" htmlFor="pub-date">Дата публикации</label>
                      <p className="tf-field-hint">Если не указано, видео будет опубликовано сразу</p>
                      <input
                        type="datetime-local"
                        id="pub-date"
                        className="tf-field-input"
                        value={formData.publish_at}
                        onChange={handleChange}
                        name="publish_at"
                      />
                    </div>

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
                          onChange={(e) => handleChange(e)}
                          name="order_index"
                        />
                        <div className="tf-num-arrows">
                          <button type="button" className="tf-num-arrow" onClick={() => stepNumber('order_index', 1)}>▲</button>
                          <button type="button" className="tf-num-arrow" onClick={() => stepNumber('order_index', -1)}>▼</button>
                        </div>
                      </div>
                  </div>

                    <div className="tf-toggle-field">
                      <div className="tf-toggle-info">
                        <div className="tf-toggle-name">Видимость</div>
                        <div className="tf-toggle-desc">Если выключено, видео не будет видно студентам</div>
                    </div>
                      <label className="tf-toggle-switch">
                        <div className="tf-ts-inner">
                    <input
                      type="checkbox"
                      checked={formData.is_visible_to_students}
                            onChange={(e) => handleCheckboxChange('is_visible_to_students', e.target.checked)}
                    />
                          <div className="tf-ts-track"></div>
                          <div className="tf-ts-thumb"></div>
                        </div>
                      </label>
                  </div>

                    <div className="tf-toggle-field">
                      <div className="tf-toggle-info">
                        <div className="tf-toggle-name">Бесплатный просмотр</div>
                        <div className="tf-toggle-desc">Студенты без подписки смогут смотреть это видео</div>
                      </div>
                      <label className="tf-toggle-switch">
                        <div className="tf-ts-inner">
                          <input type="checkbox" />
                          <div className="tf-ts-track"></div>
                          <div className="tf-ts-thumb"></div>
                        </div>
                      </label>
                    </div>
                  </div>
                </div>

                {/* Advanced card: cover */}
                <div className="tf-form-card">
                  <div className="tf-card-header">
                    <div className="tf-card-title">
                      <ImageIcon className="w-3.5 h-3.5" style={{ stroke: 'var(--teal)' }} />
                      Обложка видео
                    </div>
                  </div>
                  <div className="tf-card-body">
                    <p className="tf-field-hint" style={{ marginTop: '-0.25rem' }}>Загрузите обложку или она будет сгенерирована автоматически</p>

                    <div className="tf-cover-area">
                        {thumbnailPreviewUrl ? (
                          <>
                          <img src={thumbnailPreviewUrl} alt="Video cover" className="tf-cover-preview" style={{ display: 'block' }} />
                            <button
                              type="button"
                              onClick={handleRemoveThumbnail}
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
                          <ImageIcon className="w-6 h-6" style={{ stroke: 'var(--muted)', opacity: 0.5 }} />
                          <div className="tf-cover-placeholder-text">Нажмите, чтобы загрузить</div>
                          <div className="tf-cover-placeholder-sub">PNG · JPG · 1280×720px рекомендуется</div>
                          </div>
                        )}
                          <input
                            type="file"
                        id="cover-file"
                            accept="image/*"
                        style={{ display: 'none' }}
                        onChange={(e) => previewCover(e.target)}
                          />
                          </div>

                    <div className="tf-cover-actions">
                      <button className="tf-cover-btn" type="button" onClick={() => document.getElementById('cover-file')?.click()}>
                        <Upload className="w-3 h-3" />
                        Загрузить файл
                      </button>
                      <button className="tf-cover-btn" type="button" onClick={generateCover} disabled={uploadingThumbnail}>
                        <Sparkles className="w-3 h-3" />
                        Сгенерировать обложку
                        </button>
                    </div>
                  </div>
                </div>
              </div>
                      </div>
                      
            {/* RIGHT COLUMN */}
            <div className="tf-sidebar-cards">
              {/* Video preview card */}
              <div className="tf-preview-card">
                <div className="tf-card-header">
                  <div className="tf-card-title">
                    <Video className="w-3.5 h-3.5" style={{ stroke: 'var(--teal-light)' }} />
                    Предпросмотр
                  </div>
                </div>
                <div className="tf-card-body">
                  <div
                    id="card-thumb"
                    style={{
                      position: 'relative',
                      paddingBottom: '52%',
                      background: videoEmbedUrl && platformBadge.type === 'youtube'
                        ? 'linear-gradient(135deg,#1a0000,#8b0000,#cc0000)'
                        : videoEmbedUrl && platformBadge.type === 'vimeo'
                        ? 'linear-gradient(135deg,#0a1020,#0a3060,#1a78be)'
                        : 'linear-gradient(135deg,#0e1820,#1a4040)',
                      overflow: 'hidden'
                    }}
                  >
                    <div style={{
                      position: 'absolute',
                      inset: 0,
                      background: 'repeating-linear-gradient(0deg,transparent,transparent 3px,rgba(255,255,255,0.013) 3px,rgba(255,255,255,0.013) 4px)',
                      pointerEvents: 'none',
                      zIndex: 2
                    }}></div>
                    <div style={{
                      position: 'absolute',
                      bottom: '0.75rem',
                      right: '0.75rem',
                      width: '32px',
                      height: '32px',
                      background: 'var(--teal)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      zIndex: 3
                    }}>
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="#fff" stroke="none">
                        <polygon points="5 3 19 12 5 21 5 3" />
                      </svg>
                    </div>
                    <div style={{
                      position: 'absolute',
                      bottom: 0,
                      left: 0,
                      right: 0,
                      padding: '1.25rem 1rem 0.8rem',
                      background: 'linear-gradient(transparent,rgba(14,14,14,0.9))',
                      zIndex: 3
                    }}>
                      <div style={{
                        fontFamily: "'Playfair Display',serif",
                        fontSize: '0.88rem',
                        fontWeight: 700,
                        color: formData.title ? 'rgba(245,240,232,0.9)' : 'rgba(245,240,232,0.5)',
                        fontStyle: formData.title ? 'normal' : 'italic',
                        lineHeight: 1.3
                      }}>
                        {formData.title || 'Название видео…'}
                      </div>
                    </div>
                  </div>

                  <div className="tf-unit-chip">
                    <div
                      className="tf-unit-chip-dot"
                      style={{
                        background: selectedUnit ? 'var(--teal)' : 'var(--muted)',
                        opacity: selectedUnit ? 1 : 0.3
                      }}
                    />
                    <div
                      className="tf-unit-chip-text"
                      style={{
                        opacity: selectedUnit ? 1 : 0.35,
                        fontStyle: selectedUnit ? 'normal' : 'italic',
                        color: selectedUnit ? 'rgba(245,240,232,0.75)' : 'rgba(245,240,232,0.35)'
                      }}
                    >
                      {selectedUnit ? selectedUnit.title : 'Юнит не выбран'}
                    </div>
                  </div>

                  <div style={{
                    padding: '0.85rem 1rem',
                    borderBottom: '1px solid rgba(255,255,255,0.05)',
                    display: 'flex',
                    justifyContent: 'space-between'
                  }}>
                    <div style={{
                      fontFamily: "'Space Mono',monospace",
                      fontSize: '0.55rem',
                      letterSpacing: '0.1em',
                      textTransform: 'uppercase',
                      color: 'rgba(245,240,232,0.3)'
                    }}>
                      Порядок
                    </div>
                    <div style={{
                      fontFamily: "'Space Mono',monospace",
                      fontSize: '0.6rem',
                      fontWeight: 700,
                      color: 'rgba(245,240,232,0.4)'
                    }}>
                      {formData.order_index}
                    </div>
                      </div>

                  <div style={{ padding: '1rem' }}>
                    <button className="tf-btn-primary" style={{ width: '100%', justifyContent: 'center' }} onClick={() => handleSave(true)} disabled={saving}>
                      <Video className="w-3 h-3" />
                      Опубликовать
                    </button>
                  </div>
                </div>
              </div>

              {/* Tips card */}
              <div className="tf-tips-card">
                <div className="tf-card-header" style={{ background: 'var(--warm)' }}>
                  <div className="tf-card-title">
                    <Info className="w-3.5 h-3.5" style={{ stroke: 'var(--teal)' }} />
                    Советы
                  </div>
                </div>
                      <div>
                  <div className="tf-tip-item">
                    <div className="tf-tip-icon">
                      <Youtube className="w-3 h-3" style={{ stroke: 'var(--teal)' }} />
                      </div>
                    <div className="tf-tip-text">
                      <strong>YouTube и Vimeo</strong> — рекомендуемый способ. Видео загружается быстрее и не расходует ваш трафик.
                    </div>
                  </div>
                  <div className="tf-tip-item">
                    <div className="tf-tip-icon">
                      <Clock className="w-3 h-3" style={{ stroke: 'var(--teal)' }} />
                </div>
                    <div className="tf-tip-text">
                      <strong>Порядок</strong> задаёт положение видео внутри юнита. 0 — без порядка, 1, 2, 3… — строгая последовательность.
            </div>
              </div>
                  <div className="tf-tip-item">
                    <div className="tf-tip-icon">
                      <ImageIcon className="w-3 h-3" style={{ stroke: 'var(--teal)' }} />
        </div>
                    <div className="tf-tip-text">
                      <strong>Обложка</strong> отображается в карточке видео. Рекомендуемый размер — 1280×720px.
      </div>
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
