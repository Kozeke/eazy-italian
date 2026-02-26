import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { 
  ArrowLeft,
  Plus,
  X,
  Upload,
  BookMarked,
  Clock,
  Tag,
  Settings as SettingsIcon,
  Check,
  Save,
  Sparkles,
  Image as ImageIcon
} from 'lucide-react';
import { coursesApi } from '../../services/api';
import toast from 'react-hot-toast';
import RichTextEditor from '../../components/admin/RichTextEditor';

interface CourseFormData {
  title: string;
  description: string;
  level: string;
  status: string;
  publish_at: string;
  order_index: number;
  thumbnail_url: string;
  thumbnail_path?: string;
  duration_hours: number | null;
  tags: string[];
  meta_title: string;
  meta_description: string;
  is_visible_to_students: boolean;
  settings: {
    allow_enrollment?: boolean;
    certificate_available?: boolean;
    max_students?: number | null;
    [key: string]: any;
  };
}

export default function AdminCourseEditPage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [newTag, setNewTag] = useState('');
  const [thumbnail, setThumbnail] = useState<string | null>(null);
  const [generatingThumbnail, setGeneratingThumbnail] = useState(false);
  const [thumbnailFile, setThumbnailFile] = useState<File | null>(null);
  const [thumbnailPreviewUrl, setThumbnailPreviewUrl] = useState<string>('');
  const [uploadingThumbnail, setUploadingThumbnail] = useState(false);

  const [formData, setFormData] = useState<CourseFormData>({
    title: '',
    description: '',
    level: 'A1',
    status: 'published',
    publish_at: '',
    order_index: 0,
    thumbnail_url: '',
    duration_hours: null,
    tags: [],
    meta_title: '',
    meta_description: '',
    is_visible_to_students: true,
    settings: {
      allow_enrollment: true,
      certificate_available: false,
      max_students: null
    }
  });

  // Load course data
  useEffect(() => {
    const loadCourse = async () => {
      if (!id) return;
      
      try {
        setLoading(true);
        const course = await coursesApi.getAdminCourse(parseInt(id));
        
        // Format publish_at for datetime-local input
        const publishAt = course.publish_at 
          ? new Date(course.publish_at).toISOString().slice(0, 16)
          : '';
        
        setFormData({
          title: course.title || '',
          description: course.description || '',
          level: course.level || 'A1',
          status: course.status || 'published',
          publish_at: publishAt,
          order_index: course.order_index ?? 0,
          thumbnail_url: course.thumbnail_url || '',
          thumbnail_path: course.thumbnail_path,
          duration_hours: course.duration_hours || null,
          tags: course.tags || [],
          meta_title: course.meta_title || '',
          meta_description: course.meta_description || '',
          is_visible_to_students: course.is_visible_to_students ?? true,
          settings: course.settings || {
            allow_enrollment: true,
            certificate_available: false,
            max_students: null
          }
        });

        // Set thumbnail preview if available - prioritize thumbnail_url
        const apiBase = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api/v1';
        if (course.thumbnail_url) {
          setThumbnail(course.thumbnail_url);
          setThumbnailPreviewUrl(course.thumbnail_url);
        } else if (course.thumbnail_path) {
          const thumbnailUrl = `${apiBase}/static/${course.thumbnail_path}`;
          setThumbnail(thumbnailUrl);
          setThumbnailPreviewUrl(thumbnailUrl);
        }
      } catch (error: any) {
        console.error('Error loading course:', error);
        toast.error('Ошибка при загрузке курса');
        navigate('/admin/courses');
      } finally {
        setLoading(false);
      }
    };

    loadCourse();
  }, [id, navigate]);

  const handleInputChange = (field: keyof CourseFormData, value: any) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleSettingsChange = (field: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      settings: {
        ...prev.settings,
        [field]: value
      }
    }));
  };

  const handleAddTag = () => {
    if (newTag.trim() && !formData.tags.includes(newTag.trim())) {
      setFormData(prev => ({
        ...prev,
        tags: [...prev.tags, newTag.trim()]
      }));
      setNewTag('');
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setFormData(prev => ({
      ...prev,
      tags: prev.tags.filter(tag => tag !== tagToRemove)
    }));
  };

  const handleThumbnailFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.type.startsWith('image/')) {
        toast.error('Пожалуйста, выберите файл изображения');
        return;
      }
      if (file.size > 10 * 1024 * 1024) { // 10MB limit
        toast.error('Размер файла не должен превышать 10MB');
        return;
      }
      setThumbnailFile(file);
      // Create preview URL
      const previewUrl = URL.createObjectURL(file);
      setThumbnailPreviewUrl(previewUrl);
      setThumbnail(previewUrl);
    }
  };

  const handleRemoveThumbnail = () => {
    setThumbnailFile(null);
    if (thumbnailPreviewUrl) {
      URL.revokeObjectURL(thumbnailPreviewUrl);
      setThumbnailPreviewUrl('');
    }
    setThumbnail(null);
    handleInputChange('thumbnail_path', '');
    handleInputChange('thumbnail_url', '');
  };

  const handleUploadThumbnail = async () => {
    if (!id || !thumbnailFile) return;
    
    setUploadingThumbnail(true);
    try {
      const uploadedThumbnail = await coursesApi.uploadThumbnail(parseInt(id), thumbnailFile);
      if (uploadedThumbnail.thumbnail_path) {
        // Update course with new thumbnail path
        await coursesApi.updateCourse(parseInt(id), {
          thumbnail_path: uploadedThumbnail.thumbnail_path
        });
        
        const apiBase = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api/v1';
        const thumbnailUrl = `${apiBase}/static/${uploadedThumbnail.thumbnail_path}`;
        setThumbnailPreviewUrl(thumbnailUrl);
        setThumbnail(thumbnailUrl);
        setFormData(prev => ({
          ...prev,
          thumbnail_path: uploadedThumbnail.thumbnail_path
        }));
        toast.success('Обложка успешно загружена!');
        setThumbnailFile(null);
        // Don't revoke the URL as we're using it for preview
      }
    } catch (error) {
      console.error('Error uploading thumbnail:', error);
      toast.error('Не удалось загрузить обложку');
    } finally {
      setUploadingThumbnail(false);
    }
  };

  const validateForm = (): boolean => {
    if (!formData.title.trim()) {
      toast.error('Название курса обязательно');
      return false;
    }
    return true;
  };

  const handleSave = async (publish: boolean = false) => {
    if (!validateForm() || !id) {
      return;
    }

    setSaving(true);
    
    try {
      // Prepare course data for API
      const courseData = {
        title: formData.title.trim(),
        description: formData.description.trim() || undefined,
        level: formData.level as 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2' | 'mixed',
        status: (publish ? 'published' : formData.status) as 'draft' | 'scheduled' | 'published' | 'archived',
        publish_at: formData.publish_at || undefined,
        order_index: formData.order_index,
        thumbnail_url: formData.thumbnail_url.trim() || undefined,
        duration_hours: formData.duration_hours || undefined,
        tags: formData.tags.length > 0 ? formData.tags : undefined,
        meta_title: formData.meta_title.trim() || undefined,
        meta_description: formData.meta_description.trim() || undefined,
        is_visible_to_students: formData.is_visible_to_students,
        settings: Object.keys(formData.settings).length > 0 ? formData.settings : undefined
      };

      // Call the API to update course
      await coursesApi.updateCourse(parseInt(id), courseData);
      
      toast.success(
        publish 
          ? 'Курс успешно обновлен и опубликован!' 
          : 'Курс успешно сохранен!'
      );
      
      // Navigate back to courses list
      navigate('/admin/courses');
    } catch (error: any) {
      console.error('Error saving course:', error);
      toast.error(error.response?.data?.detail || 'Ошибка при сохранении курса');
    } finally {
      setSaving(false);
    }
  };

  const handleGenerateThumbnail = async () => {
    if (!id || !formData.title.trim()) {
      toast.error('Сначала введите название курса');
      return;
    }
    
    setGeneratingThumbnail(true);
    try {
      const thumbnailResult = await coursesApi.generateThumbnail(parseInt(id));
      if (thumbnailResult.thumbnail_path) {
        setFormData(prev => ({
          ...prev,
          thumbnail_path: thumbnailResult.thumbnail_path
        }));
        const apiBase = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api/v1';
        const thumbnailUrl = `${apiBase}/static/${thumbnailResult.thumbnail_path}`;
        setThumbnailPreviewUrl(thumbnailUrl);
        setThumbnail(thumbnailUrl);
        toast.success('Обложка успешно сгенерирована!');
      }
    } catch (error: any) {
      console.error('Error generating thumbnail:', error);
      toast.error(error.response?.data?.detail || 'Ошибка при генерации обложки');
    } finally {
      setGeneratingThumbnail(false);
    }
  };


  const getThumbnailUrl = () => {
    if (thumbnailPreviewUrl) return thumbnailPreviewUrl;
    if (formData.thumbnail_url) return formData.thumbnail_url;
    if (formData.thumbnail_path) {
      const apiBase = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api/v1';
      return `${apiBase}/static/${formData.thumbnail_path}`;
    }
    if (thumbnail) return thumbnail;
    return '';
  };

  const previewCoverUrl = (url: string) => {
    if (url && url.startsWith('http')) {
      setThumbnailPreviewUrl(url);
      handleInputChange('thumbnail_url', url);
    }
  };

  const stepNumber = (field: 'duration_hours' | 'order_index', delta: number) => {
    const currentValue = field === 'duration_hours' 
      ? (formData.duration_hours || 0)
      : formData.order_index;
    const newValue = Math.max(0, currentValue + delta);
    if (field === 'duration_hours') {
      handleInputChange('duration_hours', newValue);
    } else {
      handleInputChange('order_index', newValue);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen" style={{ background: '#f0e9d8', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="animate-spin rounded-full h-8 w-8 border-b-2" style={{ borderColor: '#1a7070' }}></div>
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

        .tf-status-pill {
          display: flex;
          align-items: center;
          gap: 0.45rem;
          padding: 0.4rem 0.85rem;
          border: 1px solid var(--line);
          background: var(--warm);
          font-family: 'Space Mono', monospace;
          font-size: 0.62rem;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: var(--muted);
          cursor: pointer;
          transition: all 0.2s;
          user-select: none;
        }

        .tf-status-pill.published {
          border-color: var(--teal);
          color: var(--teal);
          background: var(--teal-dim);
        }

        .tf-status-pill.published .pill-dot {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: var(--teal);
          box-shadow: 0 0 0 3px rgba(26,112,112,0.2);
        }

        .pill-dot {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: var(--muted);
          opacity: 0.5;
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
          grid-template-columns: 1fr 340px;
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

        .tf-field-row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 1rem;
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

        textarea.tf-field-input {
          min-height: 110px;
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

        .tf-level-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 0.5rem;
        }

        .tf-level-option {
          display: none;
        }

        .tf-level-label {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 0.65rem 0.4rem;
          border: 1px solid var(--line);
          background: var(--warm);
          cursor: pointer;
          transition: all 0.2s;
          text-align: center;
          gap: 0.3rem;
        }

        .tf-level-label:hover {
          border-color: var(--teal);
          background: var(--cream);
        }

        .tf-level-option:checked + .tf-level-label {
          border-color: var(--teal);
          background: var(--teal-dim);
          color: var(--teal);
        }

        .tf-level-code {
          font-family: 'Playfair Display', serif;
          font-size: 1.05rem;
          font-weight: 900;
          line-height: 1;
        }

        .tf-level-option:checked + .tf-level-label .tf-level-code {
          color: var(--teal);
        }

        .tf-level-name {
          font-family: 'Space Mono', monospace;
          font-size: 0.5rem;
          letter-spacing: 0.07em;
          text-transform: uppercase;
          color: var(--muted);
        }

        .tf-level-option:checked + .tf-level-label .tf-level-name {
          color: var(--teal);
          opacity: 0.7;
        }

        .tf-level-label.mixed {
          grid-column: span 2;
          flex-direction: row;
          justify-content: flex-start;
          gap: 0.6rem;
          padding: 0.6rem 0.75rem;
        }

        .tf-level-label.mixed .tf-level-code {
          font-size: 0.85rem;
        }

        .tf-cover-area {
          border: 2px dashed var(--line);
          background: var(--warm);
          transition: all 0.2s;
          position: relative;
          overflow: hidden;
        }

        .tf-cover-area:hover {
          border-color: var(--teal);
          background: var(--cream);
        }

        .tf-cover-area.has-preview {
          border-style: solid;
          border-color: var(--line);
        }

        .tf-cover-placeholder {
          padding: 2rem 1.5rem;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.75rem;
          cursor: pointer;
        }

        .tf-cover-placeholder-icon {
          width: 44px;
          height: 44px;
          background: var(--line);
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .tf-cover-placeholder-text {
          font-size: 0.82rem;
          color: var(--muted);
          text-align: center;
          line-height: 1.5;
        }

        .tf-cover-placeholder-sub {
          font-family: 'Space Mono', monospace;
          font-size: 0.57rem;
          color: var(--muted);
          opacity: 0.55;
        }

        .tf-cover-actions {
          display: flex;
          gap: 0.6rem;
        }

        .tf-cover-btn {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.4rem;
          padding: 0.6rem 1rem;
          border: 1px solid var(--line);
          background: var(--cream);
          font-family: 'Space Mono', monospace;
          font-size: 0.62rem;
          letter-spacing: 0.07em;
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

        .tf-cover-preview {
          width: 100%;
          aspect-ratio: 16/9;
          object-fit: cover;
          display: block;
        }

        .tf-tags-wrap {
          display: flex;
          flex-wrap: wrap;
          gap: 0.5rem;
          align-items: center;
        }

        .tf-tag {
          display: inline-flex;
          align-items: center;
          gap: 0.4rem;
          background: var(--ink);
          color: var(--cream);
          font-family: 'Space Mono', monospace;
          font-size: 0.6rem;
          font-weight: 700;
          letter-spacing: 0.07em;
          padding: 0.25rem 0.7rem;
          border-radius: 2px;
          cursor: default;
        }

        .tf-tag-remove {
          background: none;
          border: none;
          color: rgba(245,240,232,0.5);
          cursor: pointer;
          font-size: 0.9rem;
          line-height: 1;
          padding: 0;
          transition: color 0.15s;
          display: flex;
          align-items: center;
        }

        .tf-tag-remove:hover {
          color: var(--cream);
        }

        .tf-tag-add-wrap {
          display: flex;
          gap: 0.5rem;
          flex: 1;
          min-width: 140px;
        }

        .tf-tag-input {
          flex: 1;
          padding: 0.42rem 0.7rem;
          border: 1px solid var(--line);
          background: var(--warm);
          font-family: 'DM Sans', sans-serif;
          font-size: 0.82rem;
          color: var(--ink);
          outline: none;
          transition: border-color 0.2s;
          border-radius: 0;
        }

        .tf-tag-input:focus {
          border-color: var(--teal);
        }

        .tf-tag-input::placeholder {
          color: rgba(107,100,86,0.4);
        }

        .tf-tag-add-btn {
          padding: 0.42rem 0.8rem;
          background: var(--ink);
          color: var(--cream);
          border: none;
          font-family: 'Space Mono', monospace;
          font-size: 0.6rem;
          cursor: pointer;
          transition: background 0.2s;
          white-space: nowrap;
          letter-spacing: 0.06em;
        }

        .tf-tag-add-btn:hover {
          background: var(--teal);
        }

        .tf-sidebar-cards {
          display: flex;
          flex-direction: column;
          gap: 1.25rem;
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
          display: block;
        }

        .tf-advanced-panel .tf-form-card {
          border-top: none;
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

        .tf-toggle-switch {
          position: relative;
          width: 44px;
          height: 24px;
          flex-shrink: 0;
          cursor: pointer;
        }

        .tf-ts-inner {
          position: relative;
          width: 44px;
          height: 24px;
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

        .tf-number-input-wrap {
          position: relative;
          display: flex;
          align-items: center;
        }

        .tf-number-input-wrap .tf-field-input {
          padding-right: 2.5rem;
          -moz-appearance: textfield;
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
          font-size: 0.6rem;
        }

        .tf-num-arrow:hover {
          background: var(--cream);
          color: var(--teal);
        }

        .tf-num-arrow + .tf-num-arrow {
          border-top: 1px solid var(--line);
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
          .tf-level-grid {
            grid-template-columns: repeat(3, 1fr);
          }
        }
      `}</style>

      <div className="tf-page tf-root">
        <header className="tf-topbar">
          <div className="tf-topbar-left">
            <button onClick={() => navigate('/admin/courses')} className="tf-back-link">
              <ArrowLeft className="w-3 h-3" />
              Назад к курсам
            </button>
            <div className="tf-topbar-divider"></div>
            <div className="tf-breadcrumb">
              <span>Курсы</span>
              <span className="sep">›</span>
              <span className="current">Редактировать курс</span>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div className={`tf-status-pill ${formData.status === 'published' ? 'published' : ''}`}>
              <div className="pill-dot"></div>
              <span>{formData.status === 'published' ? 'Опубликовано' : 'Черновик'}</span>
            </div>
            <button className="tf-btn-outline" onClick={() => handleSave(false)} disabled={saving}>
              <Save className="w-3 h-3" />
              Черновик
            </button>
            <button className="tf-btn-primary" onClick={() => handleSave(true)} disabled={saving}>
              <Check className="w-3 h-3" />
              {saving ? 'Публикация...' : 'Сохранить и опубликовать'}
            </button>
          </div>
        </header>

        <div className="tf-page-content">
          <div className="tf-page-header">
            <h1 className="tf-page-title">Редактировать <em>курс</em></h1>
            <p className="tf-page-meta">
              <Clock className="w-3 h-3" />
              Курс — это контейнер для организации учебных юнитов
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
                    <label className="tf-field-label" htmlFor="course-title">
                      Название курса <span className="tf-required-star">*</span>
                    </label>
                    <p className="tf-field-hint">Придумайте понятное и привлекательное название курса</p>
                    <div className="tf-input-wrap">
                      <input
                        type="text"
                        id="course-title"
                        className="tf-field-input"
                        placeholder="Например: Итальянский с нуля — А1 за 30 дней"
                        maxLength={100}
                        value={formData.title}
                        onChange={(e) => handleInputChange('title', e.target.value)}
                      />
                      <span className="tf-char-counter">{formData.title.length} / 100</span>
                    </div>
                  </div>

                  <div className="tf-field">
                    <label className="tf-field-label" htmlFor="course-desc">Описание курса</label>
                    <p className="tf-field-hint">Подробное описание поможет студентам понять содержание курса</p>
                    <div className="tf-input-wrap">
                      <RichTextEditor
                        value={formData.description}
                        onChange={(value) => handleInputChange('description', value)}
                        placeholder="Расскажите о целях курса, что студенты узнают, какие навыки получат…"
                      />
                    </div>
                  </div>

                  <div className="tf-field-row">
                    <div className="tf-field">
                      <label className="tf-field-label">Уровень сложности <span className="tf-required-star">*</span></label>
                      <div className="tf-level-grid">
                        <input type="radio" name="level" id="l-a1" value="A1" className="tf-level-option" checked={formData.level === 'A1'} onChange={(e) => handleInputChange('level', e.target.value)} />
                        <label htmlFor="l-a1" className="tf-level-label"><span className="tf-level-code">A1</span><span className="tf-level-name">Начальный</span></label>

                        <input type="radio" name="level" id="l-a2" value="A2" className="tf-level-option" checked={formData.level === 'A2'} onChange={(e) => handleInputChange('level', e.target.value)} />
                        <label htmlFor="l-a2" className="tf-level-label"><span className="tf-level-code">A2</span><span className="tf-level-name">Элемент.</span></label>

                        <input type="radio" name="level" id="l-b1" value="B1" className="tf-level-option" checked={formData.level === 'B1'} onChange={(e) => handleInputChange('level', e.target.value)} />
                        <label htmlFor="l-b1" className="tf-level-label"><span className="tf-level-code">B1</span><span className="tf-level-name">Средний</span></label>

                        <input type="radio" name="level" id="l-b2" value="B2" className="tf-level-option" checked={formData.level === 'B2'} onChange={(e) => handleInputChange('level', e.target.value)} />
                        <label htmlFor="l-b2" className="tf-level-label"><span className="tf-level-code">B2</span><span className="tf-level-name">Выше ср.</span></label>

                        <input type="radio" name="level" id="l-c1" value="C1" className="tf-level-option" checked={formData.level === 'C1'} onChange={(e) => handleInputChange('level', e.target.value)} />
                        <label htmlFor="l-c1" className="tf-level-label"><span className="tf-level-code">C1</span><span className="tf-level-name">Продвинут.</span></label>

                        <input type="radio" name="level" id="l-c2" value="C2" className="tf-level-option" checked={formData.level === 'C2'} onChange={(e) => handleInputChange('level', e.target.value)} />
                        <label htmlFor="l-c2" className="tf-level-label"><span className="tf-level-code">C2</span><span className="tf-level-name">Мастерство</span></label>

                        <input type="radio" name="level" id="l-mix" value="mixed" className="tf-level-option" checked={formData.level === 'mixed'} onChange={(e) => handleInputChange('level', e.target.value)} />
                        <label htmlFor="l-mix" className="tf-level-label mixed"><span className="tf-level-code">±</span><span className="tf-level-name">Смешанный уровень</span></label>
                      </div>
                    </div>

                    <div className="tf-field" style={{ alignSelf: 'start' }}>
                      <label className="tf-field-label" htmlFor="course-hours">Продолжительность (часы)</label>
                      <p className="tf-field-hint">Примерная общая длительность курса</p>
                      <div className="tf-number-input-wrap">
                        <input
                          type="number"
                          id="course-hours"
                          className="tf-field-input"
                          placeholder="0"
                          min="0"
                          max="999"
                          value={formData.duration_hours || ''}
                          onChange={(e) => handleInputChange('duration_hours', e.target.value ? parseInt(e.target.value) : null)}
                        />
                        <div className="tf-num-arrows">
                          <button type="button" className="tf-num-arrow" onClick={() => stepNumber('duration_hours', 1)}>▲</button>
                          <button type="button" className="tf-num-arrow" onClick={() => stepNumber('duration_hours', -1)}>▼</button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* CARD 2: Обложка курса */}
              <div className="tf-form-card">
                <div className="tf-card-header">
                  <div className="tf-card-title">
                    <div className="tf-card-title-num">2</div>
                    Обложка курса
                  </div>
                </div>
                <div className="tf-card-body">
                  <p className="tf-field-hint" style={{ marginTop: '-0.25rem' }}>Загрузите обложку или она будет сгенерирована автоматически</p>

                  <div className={`tf-cover-area ${getThumbnailUrl() ? 'has-preview' : ''}`}>
                    {getThumbnailUrl() ? (
                      <>
                        <img src={getThumbnailUrl()} alt="Course cover" className="tf-cover-preview" />
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
                        <div className="tf-cover-placeholder-icon">
                          <ImageIcon className="w-5 h-5" style={{ stroke: 'var(--muted)' }} />
                        </div>
                        <div className="tf-cover-placeholder-text">
                          Нажмите, чтобы загрузить обложку<br />
                          <span className="tf-cover-placeholder-sub">PNG, JPG, WebP · до 5 MB · рекомендуется 1280×720px</span>
                        </div>
                      </div>
                    )}
                    <input
                      type="file"
                      id="cover-file"
                      accept="image/*"
                      style={{ display: 'none' }}
                      onChange={handleThumbnailFileChange}
                    />
                  </div>

                  <div className="tf-cover-actions">
                    <button className="tf-cover-btn" onClick={() => document.getElementById('cover-file')?.click()}>
                      <Upload className="w-3 h-3" />
                      Загрузить файл
                    </button>
                    {thumbnailFile && (
                      <button className="tf-cover-btn" onClick={handleUploadThumbnail} disabled={uploadingThumbnail}>
                        {uploadingThumbnail ? 'Загрузка...' : 'Применить'}
                      </button>
                    )}
                    <button className="tf-cover-btn" onClick={handleGenerateThumbnail} disabled={generatingThumbnail || !formData.title.trim()}>
                      <Sparkles className="w-3 h-3" />
                      {generatingThumbnail ? 'Генерация...' : 'Сгенерировать обложку'}
                    </button>
                  </div>

                  <div className="tf-field">
                    <label className="tf-field-label" htmlFor="cover-url">Или укажите URL обложки</label>
                    <p className="tf-field-hint">Ссылка на изображение (рекомендуется 1280×720px)</p>
                    <input
                      type="url"
                      id="cover-url"
                      className="tf-field-input"
                      placeholder="https://example.com/cover.jpg"
                      value={formData.thumbnail_url}
                      onChange={(e) => {
                        handleInputChange('thumbnail_url', e.target.value);
                        previewCoverUrl(e.target.value);
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* CARD 3: Теги */}
              <div className="tf-form-card">
                <div className="tf-card-header">
                  <div className="tf-card-title">
                    <div className="tf-card-title-num">3</div>
                    Теги курса
                  </div>
                </div>
                <div className="tf-card-body">
                  <p className="tf-field-hint" style={{ marginTop: '-0.25rem' }}>Теги помогают студентам находить курс по теме</p>
                  <div className="tf-tags-wrap">
                    {formData.tags.map((tag, index) => (
                      <span key={index} className="tf-tag">
                        {tag}
                        <button className="tf-tag-remove" onClick={() => handleRemoveTag(tag)} type="button">
                          <X className="w-2 h-2" />
                        </button>
                      </span>
                    ))}
                    <div className="tf-tag-add-wrap">
                      <input
                        type="text"
                        className="tf-tag-input"
                        id="tag-input"
                        placeholder="Новый тег…"
                        value={newTag}
                        onChange={(e) => setNewTag(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleAddTag();
                          }
                        }}
                      />
                      <button className="tf-tag-add-btn" type="button" onClick={handleAddTag}>
                        Добавить
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* RIGHT COLUMN */}
            <div className="tf-sidebar-cards">
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
                <div className="tf-form-card">
                  <div className="tf-card-header">
                    <div className="tf-card-title">
                      <SettingsIcon className="w-3.5 h-3.5" style={{ stroke: 'var(--teal)' }} />
                      Публикация и порядок
                    </div>
                  </div>
                  <div className="tf-card-body">
                    <div className="tf-field">
                      <label className="tf-field-label" htmlFor="pub-date">Дата публикации</label>
                      <p className="tf-field-hint">Если не указано, курс будет опубликован сразу</p>
                      <input
                        type="datetime-local"
                        id="pub-date"
                        className="tf-field-input"
                        value={formData.publish_at}
                        onChange={(e) => handleInputChange('publish_at', e.target.value)}
                      />
                    </div>

                    <div className="tf-field">
                      <label className="tf-field-label" htmlFor="sort-order">Порядок отображения</label>
                      <p className="tf-field-hint">Номер для сортировки курсов (меньше = выше в списке)</p>
                      <div className="tf-number-input-wrap">
                        <input
                          type="number"
                          id="sort-order"
                          className="tf-field-input"
                          placeholder="0"
                          min="0"
                          max="9999"
                          value={formData.order_index}
                          onChange={(e) => handleInputChange('order_index', Number(e.target.value))}
                        />
                        <div className="tf-num-arrows">
                          <button type="button" className="tf-num-arrow" onClick={() => stepNumber('order_index', 1)}>▲</button>
                          <button type="button" className="tf-num-arrow" onClick={() => stepNumber('order_index', -1)}>▼</button>
                        </div>
                      </div>
                    </div>

                    <div className="tf-toggle-field">
                      <div className="tf-toggle-info">
                        <div className="tf-toggle-name">Видимость для студентов</div>
                        <div className="tf-toggle-desc">Если выключено, курс не будет отображаться в каталоге</div>
                      </div>
                      <label className="tf-toggle-switch">
                        <div className="tf-ts-inner">
                          <input
                            type="checkbox"
                            id="visibility-toggle"
                            checked={formData.is_visible_to_students}
                            onChange={(e) => handleInputChange('is_visible_to_students', e.target.checked)}
                          />
                          <div className="tf-ts-track"></div>
                          <div className="tf-ts-thumb"></div>
                        </div>
                      </label>
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
