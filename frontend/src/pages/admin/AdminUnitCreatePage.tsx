import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  ArrowLeft,
  Plus,
  X,
  Eye,
  Pencil,
  Trash2,
  ExternalLink,
  Sparkles,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Brain,
  ChevronDown,
  ChevronUp,
  Lock,
  CheckCheck,
  FileStack
} from 'lucide-react';
import { unitsApi, videosApi, tasksApi, testsApi, coursesApi, ingestApi, ALLOWED_RAG_EXTENSIONS, MAX_RAG_FILE_BYTES } from '../../services/api';
import toast from 'react-hot-toast';
import { BookMarked, FileText, Upload } from 'lucide-react';
import RichTextEditor from '../../components/admin/RichTextEditor';

// ── AI Test Generation types ──────────────────────────────────────────────────
interface AiTestFormData {
  mcq_count: number;
  answers_per_question: number;
  difficulty: string;
  title: string;
  time_limit_minutes: number;
  passing_score: number;
  content_language: string;
  question_language: string;
}

type GenerationStatus = 'idle' | 'pending' | 'running' | 'done' | 'failed';

interface GenerationState {
  status: GenerationStatus;
  testId: number | null;
  pollUrl: string | null;
  questionCount: number;
  errorMessage: string | null;
}

const AI_DIFFICULTIES = [
  { value: 'A1', label: 'A1 – Начальный' },
  { value: 'A2', label: 'A2 – Элементарный' },
  { value: 'B1', label: 'B1 – Средний' },
  { value: 'B2', label: 'B2 – Выше среднего' },
  { value: 'C1', label: 'C1 – Продвинутый' },
  { value: 'C2', label: 'C2 – В совершенстве' },
  { value: 'easy', label: 'Лёгкий' },
  { value: 'medium', label: 'Средний' },
  { value: 'hard', label: 'Сложный' },
];

const LANGUAGES = [
  { value: 'russian',    label: '🇷🇺 Русский' },
  { value: 'english',    label: '🇬🇧 English' },
  { value: 'italian',    label: '🇮🇹 Italiano' },
  { value: 'german',     label: '🇩🇪 Deutsch' },
  { value: 'french',     label: '🇫🇷 Français' },
  { value: 'spanish',    label: '🇪🇸 Español' },
  { value: 'auto',       label: '🤖 Авто-определение' },
];

interface UnitFormData {
  title: string;
  level: string;
  description: string;
  goals: string;
  tags: string[];
  status: string;
  publish_at: string;
  order_index: number;
  course_id: number | null;
  is_visible_to_students: boolean;
  meta_title: string;
  meta_description: string;
}

interface ContentItem {
  id: number;
  title: string;
  status: string;
  order_index: number;
  type: 'video' | 'task' | 'test';
}

interface VideoItem extends ContentItem {
  source_type: 'file' | 'url';
  external_url?: string;
  file_path?: string;
  description?: string;
  duration_sec?: number;
  thumbnail_path?: string;
}

export default function AdminUnitCreatePage() {
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [newTag, setNewTag] = useState('');

  // ── Form data (must be declared first) ─────────────────────────────────────
  const [formData, setFormData] = useState<UnitFormData>({
    title: '',
    level: 'A1',
    description: '',
    goals: '',
    tags: [],
    status: 'draft',
    publish_at: '',
    order_index: 0,
    course_id: null,
    is_visible_to_students: false,
    meta_title: '',
    meta_description: ''
  });

  // ── Content-ready state (gates AI generation) ─────────────────────────────
  // Step 1: unit saved as draft in DB       → savedUnitId !== null
  // Step 2: RAG files ingested              → ragIngestedCount > 0
  // Step 3: both done                       → contentReady = true → AI unlocked
  const [savedUnitId, setSavedUnitId] = useState<number | null>(null);
  const [ragIngestedCount, setRagIngestedCount] = useState(0);
  const [preparingContent, setPreparingContent] = useState(false); // spinner for "Save + Ingest" step

  // contentReady: unit has been saved AND (has RAG docs OR has non-empty description/goals)
  const contentReady =
    savedUnitId !== null &&
    (ragIngestedCount > 0 ||
      formData.description.trim().length > 0 ||
      formData.goals.trim().length > 0);

  // ── AI Test Generator state ────────────────────────────────────────────────
  const [showAiPanel, setShowAiPanel] = useState(true);
  const [aiSubmitting, setAiSubmitting] = useState(false);
  const [generation, setGeneration] = useState<GenerationState>({
    status: 'idle',
    testId: null,
    pollUrl: null,
    questionCount: 0,
    errorMessage: null,
  });
  const [aiForm, setAiForm] = useState<AiTestFormData>({
    mcq_count: 10,
    answers_per_question: 4,
    difficulty: formData.level,
    title: '',
    time_limit_minutes: 30,
    passing_score: 70,
    content_language: 'auto',
    question_language: 'russian',
  });
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Keep AI difficulty in sync with unit level
  useEffect(() => {
    setAiForm(prev => ({ ...prev, difficulty: formData.level }));
  }, [formData.level]);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => { if (pollIntervalRef.current) clearInterval(pollIntervalRef.current); };
  }, []);

  const handleAiFormChange = (field: keyof AiTestFormData, value: any) => {
    setAiForm(prev => ({ ...prev, [field]: value }));
  };

  // ── Step 1+2: Save unit draft + ingest RAG (without navigating away) ───────
  /**
   * "Подготовить контент для AI":
   *  1. Save the unit as a draft (or re-use savedUnitId if already saved).
   *  2. Upload any pending RAG files against that unit.
   *  3. Mark contentReady so the AI panel unlocks.
   *
   * Does NOT navigate away — the teacher stays on this page to then
   * click "Сгенерировать тест".
   */
  const handlePrepareContent = async () => {
    if (!formData.title.trim()) {
      toast.error('Введите название юнита перед сохранением');
      return;
    }

    setPreparingContent(true);
    try {
      // ── 1. Save / re-use unit ──────────────────────────────────────────────
      let unitId = savedUnitId;

      if (!unitId) {
        const unitData = {
          title: formData.title,
          level: formData.level as 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2',
          description: formData.description,
          goals: formData.goals,
          tags: formData.tags,
          status: 'draft' as const,
          publish_at: formData.publish_at || undefined,
          order_index: 0,
          course_id: formData.course_id || undefined,
          is_visible_to_students: false,
          meta_title: formData.meta_title,
          meta_description: formData.meta_description,
        };
        const saved = await unitsApi.createUnit(unitData);
        unitId = saved.id;
        setSavedUnitId(unitId);
        toast.success(`Юнит сохранён как черновик (ID: ${unitId})`);
      } else {
        toast('Юнит уже сохранён, продолжаем загрузку файлов...', { icon: '♻️' });
      }

      // ── 2. Ingest RAG files ────────────────────────────────────────────────
      const courseId = formData.course_id;
      if (ragFiles.length > 0 && courseId) {
        setRagUploading(true);
        try {
          const results = await ingestApi.uploadMany(ragFiles, unitId, courseId);
          const ingested = results?.length ?? 0;
          setRagIngestedCount(prev => prev + ingested);
          setRagFiles([]);
          if (ingested > 0) {
            toast.success(`${ingested} документ(ов) загружено в базу знаний`);
          }
        } catch (err: any) {
          toast.error(err.response?.data?.detail || 'Ошибка загрузки RAG-документов');
        } finally {
          setRagUploading(false);
        }
      } else if (ragFiles.length > 0 && !courseId) {
        toast.error('Для загрузки RAG-документов выберите курс');
      }

      if (!courseId && ragFiles.length === 0) {
        // Unit saved, no RAG needed — content from description/goals is enough
        toast.success('Контент юнита готов для генерации теста');
      }
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Ошибка при подготовке контента');
    } finally {
      setPreparingContent(false);
    }
  };

  // ── Step 3: Poll + generate ────────────────────────────────────────────────
  const startPolling = (pollUrl: string) => {
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    pollIntervalRef.current = setInterval(async () => {
      try {
        const token = localStorage.getItem('token') || sessionStorage.getItem('token') || '';
        const path = pollUrl.startsWith('/api/v1') ? pollUrl : `/api/v1${pollUrl}`;
        const res = await fetch(path, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const data = await res.json();

        setGeneration(prev => ({
          ...prev,
          status: data.generation_status as GenerationStatus,
          questionCount: data.question_count ?? 0,
          errorMessage: data.generation_error ?? null,
        }));

        if (data.generation_status === 'done') {
          clearInterval(pollIntervalRef.current!);
          pollIntervalRef.current = null;
          toast.success(`✅ Тест готов! ${data.question_count} вопросов создано.`);
        } else if (data.generation_status === 'failed') {
          clearInterval(pollIntervalRef.current!);
          pollIntervalRef.current = null;
          toast.error('Генерация завершилась с ошибкой');
        }
      } catch (err) {
        console.error('Poll error:', err);
      }
    }, 3000);
  };

  const handleGenerateTest = async () => {
    if (!contentReady || !savedUnitId) return;

    setAiSubmitting(true);
    setGeneration({ status: 'pending', testId: null, pollUrl: null, questionCount: 0, errorMessage: null });

    try {
      const token = localStorage.getItem('token') || sessionStorage.getItem('token') || '';
      const res = await fetch(`/api/v1/units/${savedUnitId}/generate-test`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          mcq_count: aiForm.mcq_count,
          answers_per_question: aiForm.answers_per_question,
          difficulty: aiForm.difficulty,
          title: aiForm.title.trim() || undefined,
          time_limit_minutes: aiForm.time_limit_minutes,
          passing_score: aiForm.passing_score,
          content_language: aiForm.content_language,
          question_language: aiForm.question_language,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `Ошибка ${res.status}`);
      }

      const data = await res.json();
      setGeneration(prev => ({
        ...prev,
        testId: data.test_id,
        pollUrl: data.poll_url,
        status: 'pending',
      }));

      toast.success('Генерация запущена! Следите за статусом...');
      startPolling(data.poll_url);
    } catch (err: any) {
      setGeneration({
        status: 'failed',
        testId: null,
        pollUrl: null,
        questionCount: 0,
        errorMessage: err.message,
      });
      toast.error(err.message || 'Ошибка при запуске генерации');
    } finally {
      setAiSubmitting(false);
    }
  };

  /**
   * "Generate Slides with AI" button handler.
   *
   * The slide generator's Save flow calls POST /admin/units/{unit_id}/presentations,
   * so it needs a real unit ID in the URL.  If the unit hasn't been saved yet we
   * silently create a draft first, then navigate with ?unitId=<id>.
   * If the title is empty we ask the user to fill it in before continuing.
   */
  const handleNavigateToSlideGenerator = async () => {
    // If already saved, navigate immediately
    if (savedUnitId) {
      navigate(`/admin/slides/generate?unitId=${savedUnitId}`);
      return;
    }

    // Need a title to create the draft
    if (!formData.title.trim()) {
      toast.error('Введите название юнита, чтобы сохранить черновик перед генерацией слайдов');
      return;
    }

    // Save as draft silently, then navigate
    try {
      setSaving(true);
      const saved = await unitsApi.createUnit({
        title:                  formData.title,
        level:                  formData.level as 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2',
        description:            formData.description,
        goals:                  formData.goals,
        tags:                   formData.tags,
        status:                 'draft',
        publish_at:             formData.publish_at || undefined,
        order_index:            formData.order_index,
        course_id:              formData.course_id || undefined,
        is_visible_to_students: false,
        meta_title:             formData.meta_title,
        meta_description:       formData.meta_description,
      });
      setSavedUnitId(saved.id);
      toast.success(`Юнит сохранён как черновик (ID: ${saved.id}) — открываем генератор слайдов`);
      navigate(`/admin/slides/generate?unitId=${saved.id}`);
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Не удалось сохранить юнит перед генерацией слайдов');
    } finally {
      setSaving(false);
    }
  };

  const handleResetGeneration = () => {
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    setGeneration({ status: 'idle', testId: null, pollUrl: null, questionCount: 0, errorMessage: null });
  };

  // Mock content data
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [tasks, setTasks] = useState<ContentItem[]>([]);
  const [tests, setTests] = useState<ContentItem[]>([]);
  
  // Available content from API
  const [availableVideos, setAvailableVideos] = useState<any[]>([]);
  const [availableTasks, setAvailableTasks] = useState<any[]>([]);
  const [availableTests, setAvailableTests] = useState<any[]>([]);
  const [availableCourses, setAvailableCourses] = useState<any[]>([]);
  const [loadingContent, setLoadingContent] = useState(true);

  // RAG document upload (PDF, DOCX) — uploaded after unit is created
  const [ragFiles, setRagFiles] = useState<File[]>([]);
  const [ragUploading, setRagUploading] = useState(false);
  const maxRagFiles = 10;
  const allowedRagExtStr = ALLOWED_RAG_EXTENSIONS.join(', ');
  const maxRagMb = Math.round(MAX_RAG_FILE_BYTES / (1024 * 1024));

  // Load available content on mount
  useEffect(() => {
    const loadAvailableContent = async () => {
      try {
        setLoadingContent(true);
        
        // Load all available courses
        const coursesData = await coursesApi.getAdminCourses({ limit: 100 });
        setAvailableCourses(coursesData || []);
        
        // Load all available videos
        try {
          const videosData = await videosApi.getAdminVideos({ limit: 100 });
          setAvailableVideos(videosData || []);
          console.log('Loaded available videos:', videosData?.length || 0);
        } catch (error) {
          console.error('Error loading available videos:', error);
        }
        
        // Load all available tasks
        const tasksData = await tasksApi.getAdminTasks({ limit: 100 });
        setAvailableTasks(tasksData || []);
        
        // Load all available tests  
        const testsData = await testsApi.getTests({ limit: 100 });
        setAvailableTests(testsData.items || testsData || []);
        
        console.log('Loaded available content:', { 
          courses: coursesData?.length, 
          videos: availableVideos?.length || 0,
          tasks: tasksData?.length, 
          tests: testsData?.items?.length || 0
        });
      } catch (error) {
        console.error('Error loading available content:', error);
        toast.error('Ошибка при загрузке доступного контента');
      } finally {
        setLoadingContent(false);
      }
    };
    
    loadAvailableContent();
  }, []);

  const handleInputChange = (field: keyof UnitFormData, value: any) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
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

  const getRagFileExtension = (file: File): string =>
    (file.name || '').split('.').pop()?.toLowerCase() || '';
  const isAllowedRagFile = (file: File): boolean =>
    ALLOWED_RAG_EXTENSIONS.includes(getRagFileExtension(file) as any);
  const isWithinRagSize = (file: File): boolean => file.size <= MAX_RAG_FILE_BYTES;

  const handleRagFilesSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const chosen = Array.from(e.target.files || []);
    e.target.value = '';
    const errors: string[] = [];
    const toAdd: File[] = [];
    for (const file of chosen) {
      if (!isAllowedRagFile(file)) {
        errors.push(`"${file.name}": допустимы только ${allowedRagExtStr}`);
        continue;
      }
      if (!isWithinRagSize(file)) {
        errors.push(`"${file.name}": размер не более ${maxRagMb} МБ`);
        continue;
      }
      toAdd.push(file);
    }
    if (errors.length) errors.forEach((msg) => toast.error(msg));
    setRagFiles((prev) => {
      const next = [...prev, ...toAdd].slice(0, maxRagFiles);
      if (next.length > maxRagFiles) toast.error(`Максимум ${maxRagFiles} файлов`);
      return next;
    });
  };

  const removeRagFile = (index: number) => {
    setRagFiles((prev) => prev.filter((_, i) => i !== index));
  };


  const handleRemoveContent = (type: 'video' | 'task' | 'test', id: number) => {
    if (type === 'video') {
      setVideos(prev => prev.filter(item => item.id !== id));
    } else if (type === 'task') {
      setTasks(prev => prev.filter(item => item.id !== id));
    } else {
      setTests(prev => prev.filter(item => item.id !== id));
    }
  };

  const handleVideoChange = (id: number, field: keyof VideoItem, value: any) => {
    setVideos(prev => prev.map(video => 
      video.id === id ? { ...video, [field]: value } : video
    ));
  };

  const validateYouTubeUrl = (url: string): boolean => {
    const youtubeRegex = /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+/;
    return youtubeRegex.test(url);
  };

  // const extractYouTubeVideoId = (url: string): string | null => {
  //   const regex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/;
  //   const match = url.match(regex);
  //   return match ? match[1] : null;
  // };

  const handleSave = async (publish: boolean = false) => {
    setSaving(true);
    try {
      const status = publish ? 'published' : 'draft';
      const is_visible_to_students = publish;
      const unitData = {
        title: formData.title,
        level: formData.level as 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2',
        description: formData.description,
        goals: formData.goals,
        tags: formData.tags,
        status: status as 'draft' | 'published' | 'archived',
        publish_at: formData.publish_at || undefined,
        order_index: 0,
        course_id: formData.course_id || undefined,
        is_visible_to_students,
        meta_title: formData.meta_title,
        meta_description: formData.meta_description,
      };

      // Reuse the unit already created via "Prepare content for AI", just update status
      let savedUnit: any;
      if (savedUnitId) {
        savedUnit = await unitsApi.updateUnit(savedUnitId, {
          ...unitData,
          status: status as 'draft' | 'published' | 'archived',
          is_visible_to_students,
        });
      } else {
        savedUnit = await unitsApi.createUnit(unitData);
        setSavedUnitId(savedUnit.id);
      }

      // Save new videos
      for (const video of videos) {
        try {
          await videosApi.createVideo({
            unit_id: savedUnit.id, title: video.title, description: video.description,
            source_type: video.source_type,
            external_url: video.source_type === 'url' ? video.external_url : undefined,
            file_path: video.source_type === 'file' ? video.file_path : undefined,
            status: publish ? 'published' : 'draft',
            order_index: video.order_index, is_visible_to_students: true,
          });
        } catch (err: any) { toast.error(`Ошибка видео "${video.title}"`); }
      }

      let tasksUpdated = 0, testsUpdated = 0;
      for (const task of tasks) {
        try { await tasksApi.updateTask(task.id, { unit_id: savedUnit.id } as any); tasksUpdated++; }
        catch (e) { console.error(`Task ${task.id}:`, e); }
      }
      for (const test of tests) {
        try { await testsApi.updateTest(test.id, { unit_id: savedUnit.id } as any); testsUpdated++; }
        catch (e) { console.error(`Test ${test.id}:`, e); }
      }

      // Upload any RAG files that haven't been ingested yet via "Prepare content"
      let ragIngested = 0;
      const courseId = formData.course_id ?? savedUnit.course_id;
      if (ragFiles.length > 0 && courseId) {
        setRagUploading(true);
        try {
          const results = await ingestApi.uploadMany(ragFiles, savedUnit.id, courseId);
          ragIngested = results?.length ?? 0;
          if (ragIngested > 0) {
            setRagIngestedCount(prev => prev + ragIngested);
            toast.success(`Загружено документов для RAG: ${ragIngested}`);
          }
        } catch (err: any) {
          toast.error(err.response?.data?.detail || 'Ошибка загрузки RAG-документов');
        } finally { setRagUploading(false); setRagFiles([]); }
      }

      toast.success(
        publish
          ? `Юнит опубликован! Задания: ${tasksUpdated}, тесты: ${testsUpdated}${ragIngested ? `, RAG: ${ragIngested}` : ''}`
          : `Юнит сохранён как черновик`
      );
      navigate('/admin/units');
    } catch (error: any) {
      console.error('Error saving unit:', error);
      toast.error(error.response?.data?.detail || 'Ошибка при сохранении юнита');
    } finally { setSaving(false); }
  };

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      draft: { color: 'bg-gray-100 text-gray-800', text: 'Черновик' },
      scheduled: { color: 'bg-blue-100 text-blue-800', text: 'Запланировано' },
      published: { color: 'bg-green-100 text-green-800', text: 'Опубликовано' },
      archived: { color: 'bg-red-100 text-red-800', text: 'Архив' }
    };
    
    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.draft;
    
    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${config.color}`}>
        {config.text}
      </span>
    );
  };

  const handleAddExistingContent = (type: 'video' | 'task' | 'test', contentId: number) => {
    const availableContent = type === 'video' ? availableVideos : type === 'task' ? availableTasks : availableTests;
    const content = availableContent.find(item => item.id === contentId);
    
    if (!content) return;
    
    if (type === 'video') {
      const newVideoItem: VideoItem = {
        id: content.id,
        title: content.title,
        status: content.status || 'draft',
        order_index: videos.length,
        type: 'video',
        source_type: content.source_type || 'url',
        external_url: content.external_url,
        file_path: content.file_path,
        description: content.description,
        duration_sec: content.duration_sec,
        thumbnail_path: content.thumbnail_path
      };
      setVideos(prev => [...prev, newVideoItem]);
    } else {
      const newItem: ContentItem = {
        id: content.id,
        title: content.title,
        status: content.status || 'draft',
        order_index: type === 'task' ? tasks.length : tests.length,
        type
      };
      
      if (type === 'task') {
        setTasks(prev => [...prev, newItem]);
      } else {
        setTests(prev => [...prev, newItem]);
      }
    }
  };

  const renderContentSection = (
    title: string,
    items: ContentItem[] | VideoItem[],
    type: 'video' | 'task' | 'test',
    icon: React.ReactNode
  ) => {
    const availableContent = type === 'video' ? availableVideos : type === 'task' ? availableTasks : type === 'test' ? availableTests : [];
    const unusedContent = availableContent.filter(content => 
      !items.some(item => item.id === content.id)
    );
    
    const createPageUrl = type === 'video' ? '/admin/videos/new' : 
                          type === 'task' ? '/admin/tasks/new' : 
                          '/admin/tests/new';
    
    return (
      <div className="bg-gray-50 rounded-lg p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-medium text-gray-900 flex items-center">
            {icon}
            <span className="ml-2">{title}</span>
            <span className="ml-2 text-sm text-gray-500">({items.length})</span>
          </h3>
          <div className="flex items-center space-x-2">
            {unusedContent.length > 0 && (
              <select
                onChange={(e) => {
                  if (e.target.value) {
                    handleAddExistingContent(type, parseInt(e.target.value));
                    e.target.value = '';
                  }
                }}
                className="text-sm px-3 py-1 border border-gray-300 rounded-md focus:ring-primary-500 focus:border-primary-500"
              >
                <option value="">Добавить существующий...</option>
                {unusedContent.map(content => (
                  <option key={content.id} value={content.id}>
                    {content.title}
                  </option>
                ))}
              </select>
            )}
            <button
              onClick={() => navigate(createPageUrl)}
              className="inline-flex items-center px-3 py-1 border border-transparent text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700"
              title={`Создать новый ${type === 'video' ? 'видео' : type === 'task' ? 'задание' : 'тест'}`}
            >
              <Plus className="h-4 w-4 mr-1" />
              Создать новый
            </button>
            {type === 'video' && (
              <button
                onClick={handleNavigateToSlideGenerator}
                disabled={saving}
                className="inline-flex items-center px-3 py-1 border border-transparent text-sm font-medium rounded-md text-white bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 shadow-sm disabled:opacity-60 disabled:cursor-not-allowed"
                title={savedUnitId ? "Открыть генератор слайдов" : "Сохранить черновик и открыть генератор слайдов"}
              >
                {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Sparkles className="h-4 w-4 mr-1" />}
                ✨ Generate Slides with AI
              </button>
            )}
          </div>
        </div>
        
        {availableContent.length === 0 && !loadingContent ? (
          <div className="text-center py-8 bg-white rounded-lg border-2 border-dashed border-gray-300">
            <p className="text-gray-500 mb-3">
              Нет доступных {type === 'video' ? 'видео' : type === 'task' ? 'заданий' : 'тестов'}
            </p>
            <button
              onClick={() => navigate(createPageUrl)}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700"
            >
              <ExternalLink className="h-4 w-4 mr-2" />
              Создать первый {type === 'video' ? 'видео' : type === 'task' ? 'задание' : 'тест'}
            </button>
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <p>В этом юните нет {type === 'video' ? 'видео' : type === 'task' ? 'заданий' : 'тестов'}</p>
            <p className="text-sm mt-1">Выберите существующий или создайте новый выше</p>
          </div>
        ) : (
        <div className="space-y-2">
          {items.map((item, index) => (
            <div key={item.id} className="bg-white p-3 rounded-md border">
              {type === 'video' ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <span className="text-sm text-gray-500">#{index + 1}</span>
                      <div className="flex-1">
                        <input
                          type="text"
                          value={(item as VideoItem).title}
                          onChange={(e) => handleVideoChange(item.id, 'title', e.target.value)}
                          className="block w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-primary-500"
                          placeholder="Название видео"
                        />
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      {getStatusBadge(item.status)}
                      <button 
                        onClick={() => handleRemoveContent(type, item.id)}
                        className="text-red-400 hover:text-red-600"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        Тип видео
                      </label>
                      <select
                        value={(item as VideoItem).source_type}
                        onChange={(e) => handleVideoChange(item.id, 'source_type', e.target.value)}
                        className="block w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-primary-500"
                      >
                        <option value="url">YouTube/Vimeo ссылка</option>
                        <option value="file">Загрузить файл</option>
                      </select>
                    </div>
                    
                    {(item as VideoItem).source_type === 'url' ? (
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">
                          Ссылка на видео
                        </label>
                        <input
                          type="url"
                          value={(item as VideoItem).external_url || ''}
                          onChange={(e) => handleVideoChange(item.id, 'external_url', e.target.value)}
                          className={`block w-full px-2 py-1 text-sm border rounded focus:outline-none focus:ring-1 focus:ring-primary-500 ${
                            (item as VideoItem).external_url && !validateYouTubeUrl((item as VideoItem).external_url || '')
                              ? 'border-red-300 focus:ring-red-500'
                              : 'border-gray-300 focus:ring-primary-500'
                          }`}
                          placeholder="https://www.youtube.com/watch?v=..."
                        />
                        {(item as VideoItem).external_url && !validateYouTubeUrl((item as VideoItem).external_url || '') && (
                          <p className="text-xs text-red-600 mt-1">Пожалуйста, введите корректную ссылку на YouTube</p>
                        )}
                      </div>
                    ) : (
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">
                          Загрузить файл
                        </label>
                        <input
                          type="file"
                          accept="video/*"
                          className="block w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-primary-500"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              handleVideoChange(item.id, 'file_path', file.name);
                            }
                          }}
                        />
                      </div>
                    )}
                  </div>
                  
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Описание
                    </label>
                    <textarea
                      value={(item as VideoItem).description || ''}
                      onChange={(e) => handleVideoChange(item.id, 'description', e.target.value)}
                      rows={2}
                      className="block w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-primary-500"
                      placeholder="Краткое описание видео"
                    />
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <span className="text-sm text-gray-500">#{index + 1}</span>
                <div>
                  <div className="font-medium text-gray-900">{item.title}</div>
                  <div className="flex items-center space-x-2">
                    {getStatusBadge(item.status)}
                    <span className="text-sm text-gray-500">Порядок: {item.order_index}</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <button className="text-gray-400 hover:text-gray-600">
                  <Eye className="h-4 w-4" />
                </button>
                <button className="text-gray-400 hover:text-gray-600">
                  <Pencil className="h-4 w-4" />
                </button>
                <button 
                  onClick={() => handleRemoveContent(type, item.id)}
                  className="text-red-400 hover:text-red-600"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top sticky bar – Udemy/Coursera style */}
      <div className="sticky top-0 z-20 border-b bg-white/90 backdrop-blur">
        <div className="max-w-7xl mx-auto px-4 lg:px-8 py-3 sm:py-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4">
            <div className="flex items-center gap-2 sm:gap-4 min-w-0 flex-1">
              <button
                onClick={() => navigate('/admin/units')}
                className="inline-flex items-center rounded-lg border border-gray-300 bg-white px-2 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm font-medium text-gray-700 hover:bg-gray-50 flex-shrink-0"
              >
                <ArrowLeft className="h-3 w-3 sm:h-4 sm:w-4 sm:mr-2" />
                <span className="hidden sm:inline">Назад к юнитам</span>
              </button>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1 sm:gap-2 flex-wrap">
                  <h1 className="text-base sm:text-xl md:text-2xl font-semibold text-gray-900 truncate">
                    Создать новый юнит
                  </h1>
                </div>
                <p className="text-xs sm:text-sm text-gray-500 mt-1 hidden sm:block">
                  Настройте структуру юнита — как модули и лекции на Coursera/Udemy
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 sm:gap-3 w-full sm:w-auto">
              <button
                onClick={() => handleSave(true)}
                disabled={saving || ragUploading}
                className="inline-flex items-center justify-center rounded-lg border border-transparent bg-primary-600 px-3 sm:px-4 py-2 text-xs sm:text-sm font-medium text-white hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50 flex-1 sm:flex-initial whitespace-nowrap"
              >
                {saving || ragUploading ? (ragUploading ? 'Загрузка документов...' : 'Публикация...') : 'Опубликовать'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="max-w-4xl mx-auto px-4 lg:px-8 py-8">
        <div className="space-y-6">
            {/* Basic info */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">
                Основная информация
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Название */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Название *
                  </label>
                  <input
                    type="text"
                    value={formData.title}
                    onChange={(e) => handleInputChange('title', e.target.value)}
                    className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                    placeholder="Например: Итальянский A1: Приветствия и базовые фразы"
                  />
                </div>

                {/* Уровень */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Уровень
                  </label>
                  <select
                    value={formData.level}
                    onChange={(e) => handleInputChange('level', e.target.value)}
                    className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                  >
                    <option value="A1">A1 – Начальный</option>
                    <option value="A2">A2 – Элементарный</option>
                    <option value="B1">B1 – Средний</option>
                    <option value="B2">B2 – Выше среднего</option>
                    <option value="C1">C1 – Продвинутый</option>
                    <option value="C2">C2 – В совершенстве</option>
                  </select>
                </div>

                {/* Course Selection */}
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center">
                    <BookMarked className="h-4 w-4 mr-1 text-gray-400" />
                    Курс
                  </label>
                  <select
                    value={formData.course_id || ''}
                    onChange={(e) => handleInputChange('course_id', e.target.value ? parseInt(e.target.value) : null)}
                    className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                  >
                    <option value="">Без курса (автономный юнит)</option>
                    {availableCourses.map((course) => (
                      <option key={course.id} value={course.id}>
                        {course.title} {course.level && `(${course.level})`}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-xs text-gray-500">
                    Выберите курс, к которому будет принадлежать этот юнит. Если не выбран, юнит будет автономным.
                  </p>
                  {availableCourses.length === 0 && !loadingContent && (
                    <p className="mt-2 text-xs text-amber-600">
                      Нет доступных курсов. <button 
                        type="button"
                        onClick={() => navigate('/admin/courses/new')}
                        className="text-primary-600 hover:text-primary-700 underline"
                      >
                        Создать курс
                      </button>
                    </p>
                  )}
                </div>
              </div>

              {/* Описание */}
              <div className="mt-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Описание
                </label>
                <RichTextEditor
                  value={formData.description}
                  onChange={(value) => handleInputChange('description', value)}
                  placeholder="Кратко опишите, что студенты будут изучать в этом юните"
                />
              </div>

              {/* Цели */}
              <div className="mt-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Ключевые цели обучения
                </label>
                <textarea
                  value={formData.goals}
                  onChange={(e) => handleInputChange('goals', e.target.value)}
                  rows={3}
                  className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                  placeholder="Например: уметь представиться, поприветствовать, задать базовые вопросы…"
                />
              </div>
            </div>

            {/* Content builder – like course curriculum */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">
                    Контент юнита
                  </h2>
                  <p className="text-sm text-gray-500">
                    Добавьте видео, задания и тесты — как лекции и квизы в онлайн-курсе
                  </p>
                </div>
              </div>

              <div className="space-y-6">
                {renderContentSection(
                  'Видео-уроки',
                  videos,
                  'video',
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-red-500/10">
                    <Eye className="h-4 w-4 text-red-500" />
                  </div>
                )}

                {renderContentSection(
                  'Задания',
                  tasks,
                  'task',
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-500/10">
                    <Pencil className="h-4 w-4 text-blue-500" />
                  </div>
                )}

                {renderContentSection(
                  'Тесты',
                  tests,
                  'test',
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-purple-500/10">
                    <span className="text-xs font-semibold text-purple-600">Q</span>
                  </div>
                )}
              </div>
            </div>

            {/* RAG documents — PDF/DOCX for vector search (only when course selected) */}
            {formData.course_id && (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-1 flex items-center">
                  <FileText className="h-5 w-5 text-gray-500 mr-2" />
                  Документы для RAG
                </h2>
                <p className="text-sm text-gray-500 mb-4">
                  PDF или DOCX, не более {maxRagMb} МБ на файл.{' '}
                  <span className="font-medium text-amber-700">
                    Загрузите документы здесь, затем нажмите «Подготовить контент» ниже — это разблокирует генерацию теста.
                  </span>
                </p>
                <div className="flex flex-wrap items-center gap-3">
                  <label className="inline-flex items-center px-3 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 cursor-pointer">
                    <Upload className="h-4 w-4 mr-2 text-gray-500" />
                    Выбрать файлы
                    <input
                      type="file"
                      accept=".pdf,.docx"
                      multiple
                      className="sr-only"
                      onChange={handleRagFilesSelect}
                      disabled={ragFiles.length >= maxRagFiles}
                    />
                  </label>
                  <span className="text-xs text-gray-500">
                    {ragFiles.length} / {maxRagFiles} файлов выбрано
                    {ragIngestedCount > 0 && (
                      <span className="ml-2 text-green-600 font-medium">
                        · {ragIngestedCount} загружено ✓
                      </span>
                    )}
                  </span>
                </div>
                {ragFiles.length > 0 && (
                  <ul className="mt-3 space-y-2">
                    {ragFiles.map((file, i) => (
                      <li key={i} className="flex items-center justify-between py-2 px-3 bg-gray-50 rounded-lg text-sm">
                        <span className="truncate text-gray-800">{file.name}</span>
                        <span className="text-gray-500 flex-shrink-0 ml-2">
                          {(file.size / 1024).toFixed(1)} KB
                        </span>
                        <button
                          type="button"
                          onClick={() => removeRagFile(i)}
                          className="text-red-500 hover:text-red-700 flex-shrink-0 ml-2"
                          aria-label="Удалить"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {/* ── AI Test Generator ─────────────────────────────────────────── */}
            <div className="bg-white rounded-2xl shadow-sm border border-violet-100 overflow-hidden">
              {/* Header */}
              <button
                type="button"
                onClick={() => setShowAiPanel(p => !p)}
                className="w-full flex items-center justify-between px-6 py-4 text-left hover:bg-violet-50/50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-violet-100">
                    <Brain className="h-5 w-5 text-violet-600" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-900">AI Генератор тестов</p>
                    <p className="text-xs text-gray-500">
                      Создать MCQ тест автоматически из контента этого юнита
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {/* Status badge */}
                  {contentReady ? (
                    <span className="inline-flex items-center gap-1 text-xs bg-green-100 text-green-700 font-medium px-2 py-0.5 rounded-full">
                      <CheckCheck className="h-3 w-3" /> Контент готов
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs bg-gray-100 text-gray-500 font-medium px-2 py-0.5 rounded-full">
                      <Lock className="h-3 w-3" /> Заблокировано
                    </span>
                  )}
                  {showAiPanel
                    ? <ChevronUp className="h-4 w-4 text-gray-400" />
                    : <ChevronDown className="h-4 w-4 text-gray-400" />}
                </div>
              </button>

              {showAiPanel && (
                <div className="border-t border-violet-100">

                  {/* ── STEP TRACKER ─────────────────────────────────────────── */}
                  <div className="px-6 pt-4 pb-3 flex items-center gap-2">
                    {/* Step 1 */}
                    <div className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${
                      formData.title.trim() ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'
                    }`}>
                      {formData.title.trim()
                        ? <CheckCircle2 className="h-3.5 w-3.5" />
                        : <span className="w-3.5 h-3.5 rounded-full border border-current flex items-center justify-center text-[10px]">1</span>}
                      Заполните форму
                    </div>
                    <div className="flex-1 h-px bg-gray-200" />
                    {/* Step 2 */}
                    <div className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${
                      savedUnitId ? 'bg-green-100 text-green-700'
                      : formData.course_id && ragFiles.length > 0 ? 'bg-amber-100 text-amber-700'
                      : 'bg-gray-100 text-gray-400'
                    }`}>
                      {savedUnitId
                        ? <CheckCircle2 className="h-3.5 w-3.5" />
                        : <FileStack className="h-3.5 w-3.5" />}
                      {formData.course_id ? 'Сохранить + RAG' : 'Сохранить юнит'}
                    </div>
                    <div className="flex-1 h-px bg-gray-200" />
                    {/* Step 3 */}
                    <div className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${
                      generation.status === 'done' ? 'bg-green-100 text-green-700'
                      : contentReady ? 'bg-violet-100 text-violet-700'
                      : 'bg-gray-100 text-gray-400'
                    }`}>
                      {generation.status === 'done'
                        ? <CheckCircle2 className="h-3.5 w-3.5" />
                        : <Sparkles className="h-3.5 w-3.5" />}
                      Сгенерировать тест
                    </div>
                  </div>

                  <div className="px-6 pb-6 space-y-4">

                    {/* ── STEP 2 BLOCK: Prepare content button ─────────────── */}
                    {!contentReady && (
                      <div className={`rounded-xl border-2 p-4 space-y-3 ${
                        savedUnitId ? 'border-amber-200 bg-amber-50' : 'border-dashed border-gray-200 bg-gray-50'
                      }`}>
                        <div className="flex items-start gap-2">
                          {savedUnitId
                            ? <AlertCircle className="h-4 w-4 text-amber-500 flex-shrink-0 mt-0.5" />
                            : <Lock className="h-4 w-4 text-gray-400 flex-shrink-0 mt-0.5" />}
                          <div>
                            <p className="text-xs font-semibold text-gray-800">
                              {savedUnitId
                                ? 'Юнит сохранён. Добавьте описание или загрузите RAG-документы выше.'
                                : 'Сначала подготовьте контент для генерации'}
                            </p>
                            <p className="text-xs text-gray-500 mt-0.5">
                              {formData.course_id
                                ? 'Кнопка ниже сохранит юнит как черновик и загрузит выбранные RAG-файлы.'
                                : 'Кнопка ниже сохранит юнит. Для загрузки документов выберите курс выше.'}
                            </p>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={handlePrepareContent}
                          disabled={preparingContent || ragUploading || !formData.title.trim()}
                          className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-gray-800 px-4 py-2.5 text-sm font-semibold text-white hover:bg-gray-900 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                          {preparingContent || ragUploading ? (
                            <><Loader2 className="h-4 w-4 animate-spin" />
                              {ragUploading ? 'Загрузка документов...' : 'Сохранение...'}</>
                          ) : (
                            <><FileStack className="h-4 w-4" />
                              {formData.course_id && ragFiles.length > 0
                                ? `Сохранить юнит и загрузить ${ragFiles.length} файл(ов)`
                                : 'Сохранить юнит как черновик'}</>
                          )}
                        </button>

                        {!formData.title.trim() && (
                          <p className="text-xs text-center text-gray-400">
                            Введите название юнита, чтобы продолжить
                          </p>
                        )}
                      </div>
                    )}

                    {/* ── Content ready summary ──────────────────────────────── */}
                    {contentReady && (
                      <div className="rounded-xl bg-green-50 border border-green-200 px-4 py-3 flex items-center gap-3">
                        <CheckCircle2 className="h-5 w-5 text-green-500 flex-shrink-0" />
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-green-800">
                            Контент готов · Unit #{savedUnitId}
                          </p>
                          <p className="text-xs text-green-600 mt-0.5">
                            {ragIngestedCount > 0
                              ? `${ragIngestedCount} RAG-документ(ов) загружено`
                              : 'Описание/цели юнита используются как источник'}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={handlePrepareContent}
                          disabled={preparingContent || ragUploading || ragFiles.length === 0}
                          className="ml-auto text-xs text-green-700 underline disabled:no-underline disabled:text-gray-400 whitespace-nowrap"
                          title="Загрузить дополнительные файлы"
                        >
                          {ragFiles.length > 0 ? `+ ${ragFiles.length} файл(ов)` : 'Обновить'}
                        </button>
                      </div>
                    )}

                    {/* ── STEP 3: Generation form (only when content is ready) ─ */}
                    {contentReady && (generation.status === 'idle' || generation.status === 'failed') && (
                      <div className="space-y-3">
                        {generation.status === 'failed' && (
                          <div className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2.5">
                            <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0 mt-0.5" />
                            <div className="min-w-0">
                              <p className="text-xs font-semibold text-red-800">Ошибка генерации</p>
                              <p className="text-xs text-red-600 break-words mt-0.5">
                                {generation.errorMessage}
                              </p>
                              <button onClick={handleResetGeneration} className="mt-1 text-xs text-red-700 underline">
                                Попробовать снова
                              </button>
                            </div>
                          </div>
                        )}

                        {/* Test title */}
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">Название теста</label>
                          <input
                            type="text"
                            value={aiForm.title}
                            onChange={e => handleAiFormChange('title', e.target.value)}
                            className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
                            placeholder={`Авто: "${formData.title || '...'} — AI тест (${aiForm.difficulty})"`}
                            maxLength={255}
                          />
                        </div>

                        {/* Difficulty + count + options */}
                        <div className="grid grid-cols-3 gap-3">
                          <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">Уровень</label>
                            <select
                              value={aiForm.difficulty}
                              onChange={e => handleAiFormChange('difficulty', e.target.value)}
                              className="block w-full rounded-lg border border-gray-300 px-2 py-2 text-xs shadow-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
                            >
                              {AI_DIFFICULTIES.map(d => (
                                <option key={d.value} value={d.value}>{d.label}</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">Вопросов</label>
                            <input type="number" value={aiForm.mcq_count}
                              onChange={e => handleAiFormChange('mcq_count', Math.min(50, Math.max(1, +e.target.value)))}
                              className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
                              min="1" max="50" />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">Вариантов</label>
                            <input type="number" value={aiForm.answers_per_question}
                              onChange={e => handleAiFormChange('answers_per_question', Math.min(6, Math.max(2, +e.target.value)))}
                              className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
                              min="2" max="6" />
                          </div>
                        </div>

                        {/* Language settings */}
                        <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 space-y-2">
                          <p className="text-xs font-semibold text-amber-800 flex items-center gap-1">
                            🌐 Языки генерации
                          </p>
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="block text-xs font-medium text-gray-700 mb-1">
                                Язык документов
                                <span className="ml-1 text-gray-400 font-normal">(в чём написан файл)</span>
                              </label>
                              <select
                                value={aiForm.content_language}
                                onChange={e => handleAiFormChange('content_language', e.target.value)}
                                className="block w-full rounded-lg border border-amber-300 px-2 py-2 text-xs shadow-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500 bg-white"
                              >
                                {LANGUAGES.map(l => (
                                  <option key={l.value} value={l.value}>{l.label}</option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-gray-700 mb-1">
                                Язык вопросов
                                <span className="ml-1 text-gray-400 font-normal">(для студентов)</span>
                              </label>
                              <select
                                value={aiForm.question_language}
                                onChange={e => handleAiFormChange('question_language', e.target.value)}
                                className="block w-full rounded-lg border border-amber-300 px-2 py-2 text-xs shadow-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500 bg-white"
                              >
                                {LANGUAGES.filter(l => l.value !== 'auto').map(l => (
                                  <option key={l.value} value={l.value}>{l.label}</option>
                                ))}
                              </select>
                            </div>
                          </div>
                          <p className="text-xs text-amber-700">
                            Пример: файл на <strong>русском</strong> объясняет итальянский → вопросы на <strong>русском</strong> об итальянских правилах.
                          </p>
                        </div>

                        {/* Time + score */}
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">Лимит (мин)</label>
                            <input type="number" value={aiForm.time_limit_minutes}
                              onChange={e => handleAiFormChange('time_limit_minutes', Math.min(180, Math.max(5, +e.target.value)))}
                              className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
                              min="5" max="180" />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">Проходной %</label>
                            <input type="number" value={aiForm.passing_score}
                              onChange={e => handleAiFormChange('passing_score', Math.min(100, Math.max(0, +e.target.value)))}
                              className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
                              min="0" max="100" />
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={handleGenerateTest}
                          disabled={aiSubmitting}
                          className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 py-3 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
                        >
                          {aiSubmitting
                            ? <><Loader2 className="h-4 w-4 animate-spin" />Запуск генерации...</>
                            : <><Sparkles className="h-4 w-4" />Сгенерировать тест с AI</>}
                        </button>
                      </div>
                    )}

                    {/* ── Pending / Running ─────────────────────────────────── */}
                    {(generation.status === 'pending' || generation.status === 'running') && (
                      <div className="space-y-4">
                        <div className="flex flex-col items-center gap-3 py-4">
                          <div className="relative">
                            <div className="w-14 h-14 rounded-2xl bg-violet-100 flex items-center justify-center">
                              <Brain className="h-7 w-7 text-violet-500" />
                            </div>
                            <div className="absolute -top-1.5 -right-1.5 bg-white rounded-full p-0.5 shadow-sm">
                              <Loader2 className="h-4 w-4 text-violet-600 animate-spin" />
                            </div>
                          </div>
                          <div className="text-center">
                            <p className="text-sm font-semibold text-gray-800">
                              {generation.status === 'pending' ? 'В очереди...' : 'LLaMA генерирует вопросы...'}
                            </p>
                            <p className="text-xs text-gray-500 mt-1">
                              {generation.status === 'running'
                                ? `Создаём ${aiForm.mcq_count} вопросов уровня ${aiForm.difficulty}`
                                : 'Задание поставлено в очередь'}
                            </p>
                          </div>
                        </div>
                        <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-full bg-gradient-to-r from-violet-500 to-purple-400 rounded-full transition-all duration-1000"
                            style={{ width: generation.status === 'running' ? '70%' : '15%' }} />
                        </div>
                        {generation.testId && (
                          <div className="flex items-center justify-between rounded-lg bg-violet-50 border border-violet-100 px-3 py-2">
                            <span className="text-xs text-violet-700">Тест: <strong>#{generation.testId}</strong></span>
                            <span className="text-xs text-violet-400 animate-pulse">обновление каждые 3с...</span>
                          </div>
                        )}
                        <button type="button" onClick={handleResetGeneration}
                          className="w-full text-xs text-gray-400 hover:text-gray-600 underline">
                          Сбросить
                        </button>
                      </div>
                    )}

                    {/* ── Done ─────────────────────────────────────────────── */}
                    {generation.status === 'done' && (
                      <div className="space-y-4">
                        <div className="flex flex-col items-center gap-2 py-3">
                          <div className="w-14 h-14 rounded-2xl bg-green-100 flex items-center justify-center">
                            <CheckCircle2 className="h-8 w-8 text-green-500" />
                          </div>
                          <p className="text-sm font-bold text-gray-800">Тест готов!</p>
                          <p className="text-xs text-gray-500">{generation.questionCount} вопросов · Черновик</p>
                        </div>
                        <div className="rounded-xl bg-green-50 border border-green-200 divide-y divide-green-100">
                          {[
                            ['Test ID', `#${generation.testId}`],
                            ['Вопросов', `${generation.questionCount}`],
                            ['Уровень', aiForm.difficulty],
                            ['Источник RAG', ragIngestedCount > 0 ? `${ragIngestedCount} документ(ов)` : 'Описание юнита'],
                          ].map(([label, value]) => (
                            <div key={label} className="flex justify-between px-3 py-2">
                              <span className="text-xs text-gray-500">{label}</span>
                              <span className="text-xs font-semibold text-gray-800">{value}</span>
                            </div>
                          ))}
                        </div>
                        <div className="flex flex-col gap-2">
                          <a href={`/admin/tests/${generation.testId}`}
                            className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-green-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-green-700 transition-colors">
                            <ExternalLink className="h-4 w-4" /> Открыть тест
                          </a>
                          <button type="button" onClick={handleResetGeneration}
                            className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
                            <Sparkles className="h-4 w-4 text-violet-500" /> Сгенерировать ещё один
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Advanced Settings */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              <button
                type="button"
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="w-full flex items-center justify-between text-left"
              >
                <h2 className="text-lg font-semibold text-gray-900">
                  Расширенные настройки
                </h2>
                <span className="text-sm text-gray-600 hover:text-primary-600">
                  {showAdvanced ? 'Скрыть' : 'Показать'}
                </span>
              </button>

              {showAdvanced && (
                <div className="mt-6 space-y-6">
                  {/* Order Index */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Порядок отображения
                    </label>
                    <input
                      type="number"
                      value={formData.order_index}
                      onChange={(e) => handleInputChange('order_index', parseInt(e.target.value) || 0)}
                      min="0"
                      className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                      placeholder="0"
                    />
                    <p className="mt-1 text-xs text-gray-500">
                      Порядок отображения юнита в списке. Меньшие значения отображаются первыми.
                    </p>
                  </div>

                  {/* Tags */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Теги
                    </label>
                    <div className="flex flex-wrap gap-2 mb-2">
                      {formData.tags.map((tag, index) => (
                        <span
                          key={index}
                          className="inline-flex items-center rounded-full bg-primary-50 px-2.5 py-1 text-xs font-medium text-primary-800"
                        >
                          {tag}
                          <button
                            type="button"
                            onClick={() => handleRemoveTag(tag)}
                            className="ml-1 text-primary-600 hover:text-primary-800"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={newTag}
                        onChange={(e) => setNewTag(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && handleAddTag()}
                        className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                        placeholder="Добавить тег (например: грамматика, A1, приветствия)"
                      />
                      <button
                        type="button"
                        onClick={handleAddTag}
                        className="inline-flex items-center rounded-lg border border-transparent bg-primary-600 px-3 py-2 text-sm font-medium text-white hover:bg-primary-700"
                      >
                        <Plus className="h-4 w-4 mr-1" />
                        Добавить
                      </button>
                    </div>
                  </div>

                  {/* Publish at */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Запланировать публикацию (опционально)
                    </label>
                    <input
                      type="datetime-local"
                      value={formData.publish_at}
                      onChange={(e) => handleInputChange('publish_at', e.target.value)}
                      className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                    />
                    <p className="mt-1 text-xs text-gray-500">
                      Если указано, юнит будет опубликован в указанное время. Если не указано, публикация произойдет сразу.
                    </p>
                  </div>

                  {/* SEO */}
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900 mb-3">
                      SEO настройки
                    </h3>
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Meta заголовок
                        </label>
                        <input
                          type="text"
                          value={formData.meta_title}
                          onChange={(e) => handleInputChange('meta_title', e.target.value)}
                          className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                          placeholder="SEO заголовок"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Meta описание
                        </label>
                        <textarea
                          value={formData.meta_description}
                          onChange={(e) => handleInputChange('meta_description', e.target.value)}
                          rows={3}
                          className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                          placeholder="Краткое описание для поисковых систем"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
        </div>
      </div>
    </div>
  );
}