import { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { 
  Save, 
  Plus, 
  Trash2, 
  ArrowLeft,
  FileText,
  Headphones,
  BookOpen,
  Calendar,
  Clock,
  Settings,
  Loader,
  Upload,
  X,
  Check,
  Edit3,
  GripVertical,
  Type,
  List,
  ListOrdered,
  Bold,
  Italic,
  Underline,
  Link as LinkIcon
} from 'lucide-react';
import { tasksApi, unitsApi, usersApi } from '../../services/api';
import { Task, Unit, Student } from '../../types';

interface Question {
  id: string;
  question: string;
  type: 'multiple_choice' | 'short_answer' | 'true_false';
  options?: string[];
  correct_answer?: string | string[];
  points?: number;
}

export default function AdminTaskEditPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const taskId = id ? parseInt(id) : null;
  const instructionsEditorRef = useRef<HTMLDivElement>(null);

  // Basic fields
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [instructions, setInstructions] = useState('');
  const [taskType, setTaskType] = useState<'writing' | 'listening' | 'reading'>('writing');
  const [gradingType, setGradingType] = useState<'automatic' | 'manual'>('manual');
  const [selectedUnitId, setSelectedUnitId] = useState<number | null>(null);
  const [status, setStatus] = useState<'draft' | 'scheduled' | 'published' | 'archived'>('draft');
  
  // Content for listening/reading
  const [content, setContent] = useState('');
  const [contentSource, setContentSource] = useState<'url' | 'file' | 'text'>('url');
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploadedFiles, setUploadedFiles] = useState<Array<{ file_path: string; filename: string; original_filename: string; size: number; url: string }>>([]);
  const [uploading, setUploading] = useState(false);
  const [questions, setQuestions] = useState<Question[]>([]);
  
  // Settings
  const [maxScore, setMaxScore] = useState(100);
  const [dueAt, setDueAt] = useState('');
  const [publishAt, setPublishAt] = useState(''); // For scheduled status
  const [allowLateSubmissions, setAllowLateSubmissions] = useState(false);
  const [latePenaltyPercent, setLatePenaltyPercent] = useState(0);
  const [maxAttempts, setMaxAttempts] = useState<number | null>(null);
  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false);
  const [isVisible, setIsVisible] = useState(true);
  const [shuffleQuestions, setShuffleQuestions] = useState(false);
  
  // Assignment settings
  const [assignToAll, setAssignToAll] = useState(true);
  const [assignedStudents, setAssignedStudents] = useState<number[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [loadingStudents, setLoadingStudents] = useState(false);
  
  // Units
  const [units, setUnits] = useState<Unit[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (taskId) {
      loadTask();
    }
    loadUnits();
    loadStudents();
  }, [taskId]);

  const loadTask = async () => {
    if (!taskId) return;
    
    try {
      setLoading(true);
      const task = await tasksApi.getAdminTask(taskId);
      
      setTitle(task.title || '');
      setDescription(task.description || '');
      setInstructions(task.instructions || '');
      setTaskType(task.type as any);
      setSelectedUnitId(task.unit_id || null);
      setStatus(task.status as any);
      setMaxScore(task.max_score || 100);
      setDueAt(task.due_at ? new Date(task.due_at).toISOString().slice(0, 16) : '');
      setPublishAt(task.publish_at ? new Date(task.publish_at).toISOString().slice(0, 16) : '');
      setAllowLateSubmissions(task.allow_late_submissions || false);
      setLatePenaltyPercent(task.late_penalty_percent || 0);
      setMaxAttempts(task.max_attempts || null);
      setContent(task.content || '');
      setIsVisible(task.is_visible ?? true);
      setShuffleQuestions(task.shuffle_questions || false);
      
      // Load attachments if they exist
      if (task.attachments && Array.isArray(task.attachments) && task.attachments.length > 0) {
        // Convert attachment paths to file info objects
        const fileInfos = task.attachments.map((path: string) => {
          const filename = path.split('/').pop() || path;
          return {
            file_path: path,
            filename: filename,
            original_filename: filename,
            size: 0, // Size not available from stored path
            url: `${import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api/v1'}/static/${path}`
          };
        });
        setUploadedFiles(fileInfos);
        // If there are attachments, set content source to 'file'
        if (fileInfos.length > 0 && !task.content) {
          setContentSource('file');
        }
      }
      
      // Load grading type from auto_check_config
      const gradingTypeFromConfig = task.auto_check_config?.grading_type || 'manual';
      setGradingType(gradingTypeFromConfig as 'automatic' | 'manual');
      
      // Load assignment settings
      setAssignToAll(task.assign_to_all ?? true);
      setAssignedStudents(task.assigned_students || []);
      
      // Load questions if they exist
      if (task.questions && Array.isArray(task.questions)) {
        setQuestions(task.questions.map((q: any, idx: number) => ({
          id: q.id || `q-${idx}-${Date.now()}`,
          question: q.question || '',
          type: q.type || 'multiple_choice',
          options: q.options || [],
          correct_answer: q.correct_answer,
          points: q.points || 1
        })));
      }
    } catch (error: any) {
      console.error('Error loading task:', error);
      toast.error(error.response?.data?.detail || 'Ошибка загрузки задания');
      navigate('/admin/tasks');
    } finally {
      setLoading(false);
    }
  };

  const loadStudents = async () => {
    setLoadingStudents(true);
    try {
      const fetchedStudents = await usersApi.getStudents();
      setStudents(fetchedStudents);
    } catch (error) {
      console.error('Error loading students:', error);
      toast.error('Ошибка загрузки студентов');
    } finally {
      setLoadingStudents(false);
    }
  };

  const loadUnits = async () => {
    try {
      const fetchedUnits = await unitsApi.getAdminUnits();
      setUnits(fetchedUnits as any);
    } catch (error) {
      console.error('Error loading units:', error);
      toast.error('Ошибка загрузки юнитов');
    }
  };

  const addQuestion = (type: Question['type']) => {
    const newQuestion: Question = {
      id: `q-${Date.now()}-${Math.random()}`,
      question: '',
      type,
      points: 1,
      ...(type === 'multiple_choice' || type === 'true_false' 
        ? { options: type === 'true_false' ? ['True', 'False'] : ['', ''] }
        : {}),
      ...(type === 'true_false' 
        ? { correct_answer: '' }
        : type === 'multiple_choice'
        ? { correct_answer: [] }
        : {})
    };
    setQuestions([...questions, newQuestion]);
  };

  const updateQuestion = (id: string, updates: Partial<Question>) => {
    setQuestions(questions.map(q => q.id === id ? { ...q, ...updates } : q));
  };

  const removeQuestion = (id: string) => {
    setQuestions(questions.filter(q => q.id !== id));
  };

  const addOption = (questionId: string) => {
    setQuestions(questions.map(q => 
      q.id === questionId 
        ? { ...q, options: [...(q.options || []), ''] }
        : q
    ));
  };

  const updateOption = (questionId: string, optionIndex: number, value: string) => {
    setQuestions(questions.map(q => 
      q.id === questionId 
        ? { 
            ...q, 
            options: q.options?.map((opt, idx) => idx === optionIndex ? value : opt)
          }
        : q
    ));
  };

  const removeOption = (questionId: string, optionIndex: number) => {
    setQuestions(questions.map(q => 
      q.id === questionId 
        ? { 
            ...q, 
            options: q.options?.filter((_, idx) => idx !== optionIndex)
          }
        : q
    ));
  };

  const toggleCorrectAnswer = (questionId: string, optionIndex: number) => {
    const question = questions.find(q => q.id === questionId);
    if (!question) return;
    
    if (question.type === 'multiple_choice') {
      const current = (question.correct_answer as string[] || []);
      const option = question.options?.[optionIndex] || '';
      const updated = current.includes(option)
        ? current.filter(a => a !== option)
        : [...current, option];
      updateQuestion(questionId, { correct_answer: updated });
    } else if (question.type === 'true_false') {
      const option = question.options?.[optionIndex] || '';
      updateQuestion(questionId, { correct_answer: option });
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      setSelectedFiles([...selectedFiles, ...files]);
    }
  };

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      setSelectedFiles([...selectedFiles, ...files]);
    }
  };

  const handleFileUpload = async () => {
    if (selectedFiles.length === 0) return;
    setUploading(true);
    try {
      const result = await tasksApi.uploadTaskFile(selectedFiles, taskType);
      setUploadedFiles([...uploadedFiles, ...result.files]);
      setSelectedFiles([]);
      toast.success(`${result.files.length} файл(ов) успешно загружено`);
    } catch (error: any) {
      console.error('Error uploading files:', error);
      toast.error(error.response?.data?.detail || 'Ошибка при загрузке файлов');
    } finally {
      setUploading(false);
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

  const formatEditor = (command: string) => {
    if (instructionsEditorRef.current) {
      instructionsEditorRef.current.focus();
      document.execCommand(command, false);
      const html = instructionsEditorRef.current.innerHTML;
      setInstructions(html);
    }
  };

  const [editorInitialized, setEditorInitialized] = useState(false);

  useEffect(() => {
    if (instructionsEditorRef.current && !editorInitialized) {
      if (instructions) {
        instructionsEditorRef.current.innerHTML = instructions;
      }
      setEditorInitialized(true);
    }
  }, [instructions, editorInitialized]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!taskId) return;
    
    if (!title.trim()) {
      toast.error('Введите название задания');
      return;
    }

    if ((taskType === 'listening' || taskType === 'reading')) {
      if (contentSource === 'file' && uploadedFiles.length === 0) {
        toast.error('Загрузите хотя бы один файл или выберите другой способ ввода');
        return;
      }
      if ((contentSource === 'url' || contentSource === 'text') && !content.trim()) {
        toast.error('Введите содержание задания');
        return;
      }
    }

    if (status === 'scheduled' && !publishAt) {
      toast.error('Укажите дату публикации для запланированного задания');
      return;
    }

    if ((taskType === 'listening' || taskType === 'reading') && questions.length === 0) {
      toast.error('Добавьте хотя бы один вопрос');
      return;
    }

    // Validate questions
    for (const q of questions) {
      if (!q.question.trim()) {
        toast.error('Все вопросы должны иметь текст');
        return;
      }
      if ((q.type === 'multiple_choice' || q.type === 'true_false')) {
        if (!q.options || q.options.length < 2) {
          toast.error('Вопросы с выбором должны иметь минимум 2 варианта');
          return;
        }
        if (q.type === 'true_false') {
          if (!q.correct_answer) {
            toast.error('Укажите правильный ответ для каждого вопроса');
            return;
          }
        }
        if (q.type === 'multiple_choice') {
          if (!q.correct_answer || (q.correct_answer as string[]).length === 0) {
            toast.error('Укажите хотя бы один правильный ответ');
            return;
          }
        }
      }
    }

    setSaving(true);
    try {
      const taskData: Partial<Task> = {
        title: title.trim(),
        description: description.trim() || undefined,
        instructions: instructions.trim() || undefined,
        type: taskType,
        unit_id: selectedUnitId || undefined,
        status,
        max_score: maxScore,
        auto_check_config: {
          grading_type: (taskType === 'listening' || taskType === 'reading') ? gradingType : 'manual'
        },
        due_at: dueAt || undefined,
        publish_at: status === 'scheduled' && publishAt ? publishAt : undefined,
        allow_late_submissions: allowLateSubmissions,
        late_penalty_percent: allowLateSubmissions ? latePenaltyPercent : undefined,
        max_attempts: maxAttempts || undefined,
        content: (taskType === 'listening' || taskType === 'reading') ? content.trim() : undefined,
        attachments: (taskType === 'listening' || taskType === 'reading') && contentSource === 'file' && uploadedFiles.length > 0 
          ? uploadedFiles.map(f => f.file_path) 
          : undefined,
        questions: (taskType === 'listening' || taskType === 'reading') ? questions.map(q => ({
          question: q.question,
          type: q.type,
          options: q.options,
          correct_answer: q.correct_answer,
          points: q.points || 1
        })) : undefined,
        assign_to_all: assignToAll,
        assigned_students: assignToAll ? [] : assignedStudents,
        is_visible: isVisible,
        shuffle_questions: (taskType === 'listening' || taskType === 'reading') ? shuffleQuestions : undefined
      };

      await tasksApi.updateTask(taskId, taskData);
      toast.success('Задание успешно обновлено');
      navigate(`/admin/tasks/${taskId}`);
    } catch (error: any) {
      console.error('Error updating task:', error);
      toast.error(error.response?.data?.detail || 'Ошибка при обновлении задания');
    } finally {
      setSaving(false);
    }
  };

  const selectedUnit = units.find(u => u.id === selectedUnitId);
  const typeConfig: Record<string, { label: string; color: string }> = {
    writing: { label: 'Письмо', color: '#1a7070' },
    listening: { label: 'Аудирование', color: '#c9962a' },
    reading: { label: 'Чтение', color: '#3a5aa0' }
  };

  const stepNumber = (field: 'maxScore' | 'maxAttempts', delta: number) => {
    if (field === 'maxScore') {
      setMaxScore(prev => Math.max(1, Math.min(9999, prev + delta)));
    } else if (field === 'maxAttempts') {
      setMaxAttempts(prev => {
        const current = prev || 1;
        const newValue = Math.max(1, Math.min(99, current + delta));
        return newValue;
      });
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen" style={{ background: '#f0e9d8', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="text-center">
          <Loader className="w-8 h-8 animate-spin mx-auto mb-4" style={{ color: '#c9962a' }} />
          <p style={{ color: '#6b6456' }}>Загрузка задания...</p>
        </div>
      </div>
    );
  }

  const isListeningOrReading = taskType === 'listening' || taskType === 'reading';

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
          color: var(--gold);
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

        .tf-btn-ghost {
          background: none;
          border: none;
          padding: 0.48rem 0.85rem;
          font-family: 'Space Mono', monospace;
          font-size: 0.65rem;
          letter-spacing: 0.07em;
          cursor: pointer;
          color: var(--muted);
          transition: color 0.2s;
        }

        .tf-btn-ghost:hover {
          color: var(--rust);
        }

        .tf-btn-primary {
          background: var(--gold);
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
          background: var(--gold-light);
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
          color: var(--gold);
        }

        .tf-form-layout {
          display: grid;
          grid-template-columns: 1fr 300px;
          gap: 1.75rem;
          align-items: start;
        }

        .tf-form-card {
          background: var(--cream);
          border: 1px solid var(--line);
          margin-bottom: 1.25rem;
        }

        .tf-form-card:last-child {
          margin-bottom: 0;
        }

        .tf-card-header {
          padding: 1rem 1.5rem;
          border-bottom: 1px solid var(--line);
          background: var(--warm);
          display: flex;
          align-items: center;
          justify-content: space-between;
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
          background: var(--gold);
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
          line-height: 1.5;
          margin-top: -0.15rem;
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
          border-color: var(--gold);
          background: var(--cream);
          box-shadow: 0 0 0 3px rgba(201,150,42,0.1);
        }

        .tf-field-input::placeholder {
          color: rgba(107,100,86,0.4);
        }

        .tf-field-input.error {
          border-color: var(--rust) !important;
        }

        textarea.tf-field-input {
          min-height: 90px;
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

        .tf-field-input.sel {
          appearance: none;
          -webkit-appearance: none;
          cursor: pointer;
          padding-right: 2.5rem;
        }

        .tf-seg-control {
          display: flex;
          border: 1px solid var(--line);
          overflow: hidden;
        }

        .tf-seg-opt {
          display: none;
        }

        .tf-seg-lbl {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 0.7rem 0.5rem;
          gap: 0.35rem;
          border-right: 1px solid var(--line);
          background: var(--warm);
          cursor: pointer;
          transition: all 0.18s;
          text-align: center;
        }

        .tf-seg-lbl:last-of-type {
          border-right: none;
        }

        .tf-seg-lbl svg {
          width: 16px;
          height: 16px;
          stroke: var(--muted);
          fill: none;
          stroke-width: 1.6;
          stroke-linecap: round;
          stroke-linejoin: round;
          transition: stroke 0.18s;
        }

        .tf-seg-lbl .tf-seg-txt {
          font-family: 'Space Mono', monospace;
          font-size: 0.58rem;
          letter-spacing: 0.07em;
          text-transform: uppercase;
          color: var(--muted);
          transition: color 0.18s;
        }

        .tf-seg-lbl:hover {
          background: var(--cream);
        }

        .tf-seg-lbl:hover svg {
          stroke: var(--ink);
        }

        .tf-seg-lbl:hover .tf-seg-txt {
          color: var(--ink);
        }

        #type-letter:checked + .tf-seg-lbl {
          background: rgba(26,112,112,0.85);
        }

        #type-audio:checked + .tf-seg-lbl {
          background: rgba(201,150,42,0.85);
        }

        #type-read:checked + .tf-seg-lbl {
          background: rgba(58,90,160,0.85);
        }

        .tf-seg-opt:checked + .tf-seg-lbl svg {
          stroke: #fff;
        }

        .tf-seg-opt:checked + .tf-seg-lbl .tf-seg-txt {
          color: #fff;
        }

        .tf-check-options {
          display: flex;
          gap: 0.75rem;
        }

        .tf-check-opt {
          display: none;
        }

        .tf-check-lbl {
          flex: 1;
          display: flex;
          align-items: center;
          gap: 0.6rem;
          padding: 0.8rem 1rem;
          border: 1px solid var(--line);
          background: var(--warm);
          cursor: pointer;
          transition: all 0.18s;
        }

        .tf-check-lbl:hover {
          border-color: var(--ink);
          background: var(--cream);
        }

        .tf-check-opt:checked + .tf-check-lbl {
          border-color: var(--gold);
          background: rgba(201,150,42,0.08);
        }

        .tf-check-lbl-icon {
          width: 30px;
          height: 30px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          background: var(--line);
          border-radius: 50%;
          transition: background 0.18s;
        }

        .tf-check-lbl-icon svg {
          width: 14px;
          height: 14px;
          stroke: var(--muted);
          fill: none;
          stroke-width: 2;
          stroke-linecap: round;
          stroke-linejoin: round;
        }

        .tf-check-opt:checked + .tf-check-lbl .tf-check-lbl-icon {
          background: var(--gold);
        }

        .tf-check-opt:checked + .tf-check-lbl .tf-check-lbl-icon svg {
          stroke: #fff;
        }

        .tf-check-name {
          font-family: 'Space Mono', monospace;
          font-size: 0.62rem;
          font-weight: 700;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          color: var(--muted);
          transition: color 0.18s;
        }

        .tf-check-desc {
          font-size: 0.73rem;
          color: var(--muted);
          opacity: 0.7;
          margin-top: 0.15rem;
        }

        .tf-check-opt:checked + .tf-check-lbl .tf-check-name {
          color: var(--gold);
        }

        .tf-src-tabs {
          display: flex;
          border: 1px solid var(--line);
          overflow: hidden;
        }

        .tf-src-tab {
          flex: 1;
          padding: 0.6rem;
          border: none;
          background: var(--warm);
          font-family: 'Space Mono', monospace;
          font-size: 0.6rem;
          letter-spacing: 0.07em;
          text-transform: uppercase;
          color: var(--muted);
          cursor: pointer;
          transition: all 0.18s;
          text-align: center;
          border-right: 1px solid var(--line);
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.4rem;
        }

        .tf-src-tab:last-child {
          border-right: none;
        }

        .tf-src-tab:hover {
          background: var(--cream);
          color: var(--ink);
        }

        .tf-src-tab.active {
          background: var(--ink);
          color: var(--cream);
        }

        .tf-src-panel {
          display: none;
          flex-direction: column;
          gap: 1rem;
        }

        .tf-src-panel.active {
          display: flex;
        }

        .tf-file-drop {
          border: 2px dashed var(--line);
          background: var(--warm);
          padding: 1.75rem 1rem;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.6rem;
          cursor: pointer;
          transition: all 0.22s;
          text-align: center;
        }

        .tf-file-drop:hover,
        .tf-file-drop.drag {
          border-color: var(--gold);
          background: rgba(201,150,42,0.05);
        }

        .tf-file-drop-icon {
          width: 40px;
          height: 40px;
          background: var(--ink);
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .tf-file-drop-title {
          font-weight: 500;
          font-size: 0.85rem;
          color: var(--ink);
        }

        .tf-file-drop-sub {
          font-family: 'Space Mono', monospace;
          font-size: 0.56rem;
          color: var(--muted);
          opacity: 0.55;
        }

        .tf-questions-list {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }

        .tf-question-block {
          border: 1px solid var(--line);
          background: var(--warm);
          animation: qIn 0.3s ease;
        }

        @keyframes qIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .tf-q-header {
          display: flex;
          align-items: center;
          gap: 0.6rem;
          padding: 0.7rem 1rem;
          background: rgba(14,14,14,0.03);
          border-bottom: 1px solid var(--line);
        }

        .tf-q-num {
          font-family: 'Playfair Display', serif;
          font-size: 1rem;
          font-weight: 900;
          color: var(--muted);
          line-height: 1;
          min-width: 20px;
        }

        .tf-q-badge {
          font-family: 'Space Mono', monospace;
          font-size: 0.55rem;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          padding: 0.18rem 0.5rem;
          border-radius: 2px;
        }

        .tf-q-mc {
          background: var(--teal-dim);
          color: var(--teal);
        }

        .tf-q-open {
          background: rgba(201,150,42,0.1);
          color: var(--gold);
        }

        .tf-q-tf {
          background: rgba(58,90,160,0.1);
          color: #3a5aa0;
        }

        .tf-q-del {
          background: none;
          border: none;
          cursor: pointer;
          color: var(--muted);
          padding: 0.2rem;
          transition: color 0.15s;
          display: flex;
          align-items: center;
          margin-left: auto;
        }

        .tf-q-del:hover {
          color: var(--rust);
        }

        .tf-q-body {
          padding: 0.9rem 1rem;
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }

        .tf-q-input {
          width: 100%;
          padding: 0.55rem 0.75rem;
          border: 1px solid var(--line);
          background: var(--cream);
          font-family: 'DM Sans', sans-serif;
          font-size: 0.85rem;
          color: var(--ink);
          outline: none;
          transition: border-color 0.2s;
          border-radius: 0;
        }

        .tf-q-input:focus {
          border-color: var(--gold);
        }

        .tf-q-input::placeholder {
          color: rgba(107,100,86,0.4);
        }

        .tf-mc-opts {
          display: flex;
          flex-direction: column;
          gap: 0.45rem;
        }

        .tf-mc-row {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        .tf-mc-circle {
          width: 18px;
          height: 18px;
          border: 1.5px solid var(--line);
          border-radius: 50%;
          flex-shrink: 0;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.18s;
          background: var(--cream);
        }

        .tf-mc-circle.ok {
          border-color: var(--teal);
          background: var(--teal);
        }

        .tf-mc-circle.ok svg {
          display: block;
        }

        .tf-mc-circle svg {
          display: none;
          width: 9px;
          height: 9px;
          stroke: #fff;
          fill: none;
          stroke-width: 3;
          stroke-linecap: round;
          stroke-linejoin: round;
        }

        .tf-mc-letter {
          font-family: 'Space Mono', monospace;
          font-size: 0.6rem;
          font-weight: 700;
          color: var(--muted);
          width: 16px;
          text-align: center;
          flex-shrink: 0;
        }

        .tf-mc-text {
          flex: 1;
          padding: 0.42rem 0.65rem;
          border: 1px solid var(--line);
          background: var(--cream);
          font-family: 'DM Sans', sans-serif;
          font-size: 0.82rem;
          color: var(--ink);
          outline: none;
          transition: border-color 0.18s;
          border-radius: 0;
        }

        .tf-mc-text:focus {
          border-color: var(--gold);
        }

        .tf-mc-text::placeholder {
          color: rgba(107,100,86,0.35);
        }

        .tf-mc-rm {
          background: none;
          border: none;
          cursor: pointer;
          color: var(--muted);
          padding: 0.2rem;
          opacity: 0.4;
          transition: opacity 0.15s, color 0.15s;
          display: flex;
        }

        .tf-mc-rm:hover {
          opacity: 1;
          color: var(--rust);
        }

        .tf-add-opt-btn {
          display: flex;
          align-items: center;
          gap: 0.4rem;
          background: none;
          border: 1px dashed var(--line);
          padding: 0.42rem 0.75rem;
          font-family: 'Space Mono', monospace;
          font-size: 0.57rem;
          letter-spacing: 0.07em;
          text-transform: uppercase;
          color: var(--muted);
          cursor: pointer;
          transition: all 0.18s;
          align-self: flex-start;
        }

        .tf-add-opt-btn:hover {
          border-color: var(--gold);
          color: var(--gold);
        }

        .tf-tf-opts {
          display: flex;
          gap: 0.6rem;
        }

        .tf-tf-btn {
          flex: 1;
          padding: 0.6rem;
          border: 1px solid var(--line);
          background: var(--cream);
          font-family: 'Space Mono', monospace;
          font-size: 0.65rem;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          cursor: pointer;
          transition: all 0.18s;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.4rem;
          color: var(--muted);
        }

        .tf-tf-btn svg {
          width: 12px;
          height: 12px;
          stroke: currentColor;
          fill: none;
          stroke-width: 2.5;
          stroke-linecap: round;
          stroke-linejoin: round;
        }

        .tf-tf-true {
          background: var(--teal-dim);
          border-color: var(--teal);
          color: var(--teal);
        }

        .tf-tf-false {
          background: rgba(201,74,42,0.08);
          border-color: var(--rust);
          color: var(--rust);
        }

        .tf-add-q-bar {
          display: flex;
          gap: 0.6rem;
          flex-wrap: wrap;
        }

        .tf-add-q-btn {
          display: flex;
          align-items: center;
          gap: 0.45rem;
          padding: 0.55rem 0.9rem;
          border: 1px solid var(--line);
          background: var(--cream);
          font-family: 'Space Mono', monospace;
          font-size: 0.58rem;
          letter-spacing: 0.07em;
          text-transform: uppercase;
          color: var(--muted);
          cursor: pointer;
          transition: all 0.18s;
          white-space: nowrap;
        }

        .tf-add-q-btn:hover {
          border-color: var(--gold);
          color: var(--gold);
          background: rgba(201,150,42,0.05);
        }

        .tf-instructions-editor {
          border: 1px solid var(--line);
          background: var(--warm);
        }

        .tf-editor-toolbar {
          display: flex;
          gap: 0.2rem;
          padding: 0.5rem 0.6rem;
          border-bottom: 1px solid var(--line);
          flex-wrap: wrap;
        }

        .tf-editor-btn {
          width: 28px;
          height: 28px;
          display: flex;
          align-items: center;
          justify-content: center;
          border: none;
          background: none;
          cursor: pointer;
          color: var(--muted);
          border-radius: 2px;
          transition: all 0.15s;
        }

        .tf-editor-btn:hover {
          background: var(--line);
          color: var(--ink);
        }

        .tf-editor-divider {
          width: 1px;
          height: 20px;
          background: var(--line);
          margin: 4px 0.2rem;
          align-self: center;
        }

        .tf-editor-area {
          min-height: 100px;
          padding: 0.85rem 1rem;
          outline: none;
          font-family: 'DM Sans', sans-serif;
          font-size: 0.88rem;
          line-height: 1.65;
          color: var(--ink);
        }

        .tf-editor-area:empty::before {
          content: attr(data-placeholder);
          color: rgba(107,100,86,0.4);
          pointer-events: none;
        }

        .tf-num-wrap {
          position: relative;
          display: flex;
          align-items: center;
        }

        .tf-num-wrap .tf-field-input {
          -moz-appearance: textfield;
          padding-right: 2.5rem;
        }

        .tf-num-wrap .tf-field-input::-webkit-inner-spin-button,
        .tf-num-wrap .tf-field-input::-webkit-outer-spin-button {
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
          color: var(--gold);
        }

        .tf-num-arrow + .tf-num-arrow {
          border-top: 1px solid var(--line);
        }

        .tf-status-seg {
          display: flex;
          border: 1px solid var(--line);
          overflow: hidden;
        }

        .tf-s-opt {
          display: none;
        }

        .tf-s-lbl {
          flex: 1;
          padding: 0.55rem 0.15rem;
          text-align: center;
          font-family: 'Space Mono', monospace;
          font-size: 0.52rem;
          font-weight: 700;
          letter-spacing: 0.05em;
          text-transform: uppercase;
          cursor: pointer;
          background: var(--warm);
          color: var(--muted);
          border-right: 1px solid var(--line);
          transition: all 0.18s;
        }

        .tf-s-lbl:last-of-type {
          border-right: none;
        }

        .tf-s-lbl:hover {
          background: var(--cream);
          color: var(--ink);
        }

        .tf-s-opt:checked + .tf-s-lbl {
          color: #fff;
        }

        #s-draft:checked + .tf-s-lbl {
          background: var(--muted);
        }

        #s-sched:checked + .tf-s-lbl {
          background: var(--gold);
        }

        #s-pub:checked + .tf-s-lbl {
          background: var(--teal);
        }

        #s-arch:checked + .tf-s-lbl {
          background: var(--ink);
        }

        .tf-toggle-field {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 1rem;
        }

        .tf-toggle-info .tf-t-name {
          font-family: 'Space Mono', monospace;
          font-size: 0.62rem;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: var(--ink);
        }

        .tf-toggle-info .tf-t-desc {
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
          background: var(--gold);
          border-color: var(--gold);
        }

        .tf-ts-inner input:checked ~ .tf-ts-thumb {
          transform: translateX(20px);
        }

        .tf-summary-sidebar {
          display: flex;
          flex-direction: column;
          gap: 1.25rem;
          position: sticky;
          top: 84px;
        }

        .tf-summary-card {
          background: var(--cream);
          border: 1px solid var(--line);
        }

        .tf-sc-header {
          padding: 0.9rem 1.25rem;
          border-bottom: 1px solid var(--line);
          background: var(--warm);
        }

        .tf-sc-title {
          font-family: 'Space Mono', monospace;
          font-size: 0.65rem;
          font-weight: 700;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: var(--ink);
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        .tf-sc-title svg {
          width: 13px;
          height: 13px;
          stroke: var(--gold);
          fill: none;
          stroke-width: 2;
          stroke-linecap: round;
          stroke-linejoin: round;
        }

        .tf-sc-body {
          padding: 1.1rem 1.25rem;
          display: flex;
          flex-direction: column;
          gap: 0.85rem;
        }

        .tf-s-row {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 0.75rem;
        }

        .tf-s-key {
          font-family: 'Space Mono', monospace;
          font-size: 0.58rem;
          letter-spacing: 0.09em;
          text-transform: uppercase;
          color: var(--muted);
          white-space: nowrap;
          margin-top: 0.05rem;
        }

        .tf-s-val {
          font-size: 0.82rem;
          font-weight: 500;
          color: var(--ink);
          text-align: right;
        }

        .tf-s-val.dim {
          color: var(--muted);
          font-style: italic;
          font-weight: 300;
          font-size: 0.78rem;
        }

        .tf-type-row {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.65rem 0;
          border-bottom: 1px solid var(--line);
        }

        .tf-type-dot {
          width: 10px;
          height: 10px;
          border-radius: 50%;
          flex-shrink: 0;
        }

        .tf-type-txt {
          font-family: 'Space Mono', monospace;
          font-size: 0.65rem;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }

        .tf-q-count-badge {
          font-family: 'Space Mono', monospace;
          font-size: 0.6rem;
          font-weight: 700;
          background: var(--gold);
          color: #fff;
          padding: 0.1rem 0.45rem;
          border-radius: 2px;
          margin-left: auto;
        }

        .tf-action-strip {
          display: flex;
          flex-direction: column;
          gap: 0.6rem;
          padding-top: 0.6rem;
          border-top: 1px solid var(--line);
          margin-top: 0.25rem;
        }

        .tf-action-strip .tf-btn-primary {
          justify-content: center;
          width: 100%;
        }

        .tf-action-strip .tf-btn-ghost {
          justify-content: center;
          font-size: 0.62rem;
          letter-spacing: 0.07em;
          display: flex;
          align-items: center;
          padding: 0.48rem;
        }

        .tf-field-input[type="date"],
        .tf-field-input[type="datetime-local"] {
          color-scheme: light;
        }

        @media (max-width: 1100px) {
          .tf-form-layout {
            grid-template-columns: 1fr;
          }
          .tf-summary-sidebar {
            position: static;
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
            <button onClick={() => navigate('/admin/tasks')} className="tf-back-link">
              <ArrowLeft className="w-3 h-3" />
              Назад
            </button>
            <div className="tf-topbar-divider"></div>
            <div className="tf-breadcrumb">
              <span>Задания</span>
              <span className="sep">›</span>
              <span className="current">Редактировать задание</span>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <button className="tf-btn-ghost" onClick={() => navigate('/admin/tasks')}>
              Отмена
            </button>
            <button className="tf-btn-primary" onClick={handleSubmit} disabled={saving}>
              <Check className="w-3 h-3" />
              {saving ? 'Сохранение...' : 'Сохранить изменения'}
            </button>
          </div>
        </header>

        <div className="tf-page-content">
          <div className="tf-page-header">
            <h1 className="tf-page-title">Редактировать <em>задание</em></h1>
          </div>

          <div className="tf-form-layout">
            <div>
              {/* Card 1: Основная информация */}
              <div className="tf-form-card">
                <div className="tf-card-header">
                  <div className="tf-card-title">
                    <div className="tf-card-title-num">1</div>
                    Основная информация
                  </div>
                </div>
                <div className="tf-card-body">
                  <div className="tf-field">
                    <label className="tf-field-label" htmlFor="task-title">
                      Название задания <span className="tf-required-star">*</span>
                    </label>
                    <div className="tf-input-wrap">
                      <input
                        type="text"
                        id="task-title"
                        className="tf-field-input"
                        placeholder="Например: Аудирование — диалог в кафе"
                        maxLength={120}
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                      />
                      <span className="tf-char-counter">{title.length} / 120</span>
                    </div>
                  </div>

                  <div className="tf-field">
                    <label className="tf-field-label" htmlFor="task-desc">Описание</label>
                    <div className="tf-input-wrap">
                      <textarea
                        id="task-desc"
                        className="tf-field-input"
                        placeholder="Опишите суть задания и что от студента ожидается…"
                        rows={3}
                        maxLength={600}
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                      />
                      <span className="tf-char-counter">{description.length} / 600</span>
                    </div>
                  </div>

                  {/* Task type */}
                  <div className="tf-field">
                    <label className="tf-field-label">Тип задания <span className="tf-required-star">*</span></label>
                    <div className="tf-seg-control">
                      <input
                        type="radio"
                        name="task-type"
                        id="type-letter"
                        value="writing"
                        className="tf-seg-opt"
                        checked={taskType === 'writing'}
                        onChange={(e) => {
                          setTaskType('writing');
                          setGradingType('manual');
                          setContent('');
                          setQuestions([]);
                          setContentSource('url');
                          setSelectedFiles([]);
                          setUploadedFiles([]);
                        }}
                      />
                      <label htmlFor="type-letter" className="tf-seg-lbl">
                        <Edit3 className="w-4 h-4" />
                        <span className="tf-seg-txt">Письмо</span>
                      </label>
                      <input
                        type="radio"
                        name="task-type"
                        id="type-audio"
                        value="listening"
                        className="tf-seg-opt"
                        checked={taskType === 'listening'}
                        onChange={(e) => {
                          setTaskType('listening');
                          setContentSource('url');
                        }}
                      />
                      <label htmlFor="type-audio" className="tf-seg-lbl">
                        <Headphones className="w-4 h-4" />
                        <span className="tf-seg-txt">Аудирование</span>
                      </label>
                      <input
                        type="radio"
                        name="task-type"
                        id="type-read"
                        value="reading"
                        className="tf-seg-opt"
                        checked={taskType === 'reading'}
                        onChange={(e) => {
                          setTaskType('reading');
                          setContentSource('text');
                        }}
                      />
                      <label htmlFor="type-read" className="tf-seg-lbl">
                        <BookOpen className="w-4 h-4" />
                        <span className="tf-seg-txt">Чтение</span>
                      </label>
                    </div>
                  </div>

                  {/* Check type */}
                  {(taskType === 'listening' || taskType === 'reading') && (
                    <div className="tf-field">
                      <label className="tf-field-label">Тип проверки <span className="tf-required-star">*</span></label>
                      <div className="tf-check-options">
                        <input
                          type="radio"
                          name="check-type"
                          id="check-auto"
                          value="automatic"
                          className="tf-check-opt"
                          checked={gradingType === 'automatic'}
                          onChange={(e) => setGradingType('automatic')}
                        />
                        <label htmlFor="check-auto" className="tf-check-lbl">
                          <div className="tf-check-lbl-icon">
                            <svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
                          </div>
                          <div>
                            <div className="tf-check-name">Автоматическая проверка</div>
                            <div className="tf-check-desc">Проверяется системой мгновенно</div>
                          </div>
                        </label>
                        <input
                          type="radio"
                          name="check-type"
                          id="check-manual"
                          value="manual"
                          className="tf-check-opt"
                          checked={gradingType === 'manual'}
                          onChange={(e) => setGradingType('manual')}
                        />
                        <label htmlFor="check-manual" className="tf-check-lbl">
                          <div className="tf-check-lbl-icon">
                            <svg viewBox="0 0 24 24"><path d="M18 11V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v0"/><path d="M14 10V4a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v2"/><path d="M10 10.5V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/></svg>
                          </div>
                          <div>
                            <div className="tf-check-name">Ручная проверка</div>
                            <div className="tf-check-desc">Задание требует проверки преподавателем</div>
                          </div>
                        </label>
                      </div>
                    </div>
                  )}

                  {/* Unit */}
                  <div className="tf-field">
                    <label className="tf-field-label" htmlFor="task-unit">Юнит</label>
                    <div className="tf-custom-select-wrap">
                      <select
                        id="task-unit"
                        className="tf-field-input sel"
                        value={selectedUnitId || ''}
                        onChange={(e) => setSelectedUnitId(e.target.value ? parseInt(e.target.value) : null)}
                      >
                        <option value="">Без юнита</option>
                        {units.map(unit => (
                          <option key={unit.id} value={unit.id}>
                            {unit.title} {unit.level ? `(${unit.level})` : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              </div>

              {/* Card 2: Audio/Video (Аудирование only) */}
              {(taskType === 'listening' || taskType === 'reading') && (
                <div className="tf-form-card">
                  <div className="tf-card-header">
                    <div className="tf-card-title">
                      <div className="tf-card-title-num">2</div>
                      {taskType === 'listening' ? 'Аудио / Видео контент' : 'Текст для чтения'}
                    </div>
                  </div>
                  <div className="tf-card-body">
                    <div className="tf-src-tabs">
                      {taskType === 'listening' ? (
                        <>
                          <button
                            className={`tf-src-tab ${contentSource === 'url' ? 'active' : ''}`}
                            type="button"
                            onClick={() => {
                              setContentSource('url');
                              setSelectedFiles([]);
                              setUploadedFiles([]);
                            }}
                          >
                            <LinkIcon className="w-3 h-3" />
                            URL
                          </button>
                          <button
                            className={`tf-src-tab ${contentSource === 'file' ? 'active' : ''}`}
                            type="button"
                            onClick={() => {
                              setContentSource('file');
                              setContent('');
                            }}
                          >
                            <Upload className="w-3 h-3" />
                            Загрузить файл
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            className={`tf-src-tab ${contentSource === 'text' ? 'active' : ''}`}
                            type="button"
                            onClick={() => {
                              setContentSource('text');
                              setSelectedFiles([]);
                              setUploadedFiles([]);
                            }}
                          >
                            <Type className="w-3 h-3" />
                            Текст
                          </button>
                          <button
                            className={`tf-src-tab ${contentSource === 'file' ? 'active' : ''}`}
                            type="button"
                            onClick={() => {
                              setContentSource('file');
                              setContent('');
                            }}
                          >
                            <Upload className="w-3 h-3" />
                            Загрузить файл
                          </button>
                        </>
                      )}
                    </div>

                    {/* URL Input for Listening */}
                    {taskType === 'listening' && contentSource === 'url' && (
                      <div className="tf-src-panel active">
                        <div className="tf-field">
                          <label className="tf-field-label" htmlFor="audio-url">
                            URL аудио или видео <span className="tf-required-star">*</span>
                          </label>
                          <input
                            type="url"
                            id="audio-url"
                            className="tf-field-input"
                            placeholder="https://youtube.com/watch?v=… или прямая ссылка на MP3"
                            value={content}
                            onChange={(e) => setContent(e.target.value)}
                          />
                          <p className="tf-field-hint">Поддерживаются YouTube и Vimeo ссылки</p>
                        </div>
                      </div>
                    )}

                    {/* Text Input for Reading */}
                    {taskType === 'reading' && contentSource === 'text' && (
                      <div className="tf-src-panel active">
                        <div className="tf-field">
                          <label className="tf-field-label" htmlFor="read-text">
                            Текст для чтения <span className="tf-required-star">*</span>
                          </label>
                          <textarea
                            id="read-text"
                            className="tf-field-input"
                            rows={10}
                            placeholder="Введите текст, который студенты должны прочитать..."
                            value={content}
                            onChange={(e) => setContent(e.target.value)}
                          />
                        </div>
                      </div>
                    )}

                    {/* File Upload */}
                    {contentSource === 'file' && (
                      <div className="tf-src-panel active">
                        {selectedFiles.length === 0 && uploadedFiles.length === 0 ? (
                          <div
                            className="tf-file-drop"
                            onClick={() => document.getElementById('task-file')?.click()}
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
                              {taskType === 'listening' ? (
                                <Headphones className="w-5 h-5" style={{ stroke: 'rgba(245,240,232,0.55)' }} />
                              ) : (
                                <FileText className="w-5 h-5" style={{ stroke: 'rgba(245,240,232,0.55)' }} />
                              )}
                            </div>
                            <div className="tf-file-drop-title">
                              {taskType === 'listening' ? 'Перетащите аудиофайл' : 'Перетащите файл'}
                            </div>
                            <div className="tf-file-drop-sub">
                              {taskType === 'listening' ? 'MP3 · OGG · WAV · MP4 · до 500 MB' : 'PDF · DOC · DOCX · TXT · до 500 MB'}
                            </div>
                          </div>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                            {selectedFiles.map((file, index) => (
                              <div key={index} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontSize: '0.82rem', fontWeight: 500 }}>{file.name}</span>
                                <button
                                  type="button"
                                  onClick={() => setSelectedFiles(selectedFiles.filter((_, i) => i !== index))}
                                  style={{ color: 'var(--muted)', padding: '0.2rem' }}
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              </div>
                            ))}
                            {uploadedFiles.map((file, index) => (
                              <div key={index} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontSize: '0.82rem', fontWeight: 500, color: 'var(--teal)' }}>{file.original_filename}</span>
                                <button
                                  type="button"
                                  onClick={() => setUploadedFiles(uploadedFiles.filter((_, i) => i !== index))}
                                  style={{ color: 'var(--muted)', padding: '0.2rem' }}
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              </div>
                            ))}
                            {selectedFiles.length > 0 && (
                              <button
                                type="button"
                                onClick={handleFileUpload}
                                disabled={uploading}
                                className="tf-btn-primary"
                                style={{ marginTop: '0.5rem' }}
                              >
                                {uploading ? (
                                  <>
                                    <Loader className="w-3 h-3 animate-spin" />
                                    Загрузка...
                                  </>
                                ) : (
                                  <>
                                    <Upload className="w-3 h-3" />
                                    Загрузить ({selectedFiles.length})
                                  </>
                                )}
                              </button>
                            )}
                          </div>
                        )}
                        <input
                          type="file"
                          id="task-file"
                          accept={taskType === 'listening' ? 'audio/*,video/*' : '.pdf,.doc,.docx,.txt,.html,.rtf'}
                          multiple
                          style={{ display: 'none' }}
                          onChange={handleFileSelect}
                        />
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Card: Questions */}
              {(taskType === 'listening' || taskType === 'reading') && (
                <div className="tf-form-card">
                  <div className="tf-card-header">
                    <div className="tf-card-title">
                      <div className="tf-card-title-num">{taskType === 'listening' || taskType === 'reading' ? (contentSource === 'file' ? '3' : '2') : '2'}</div>
                      Вопросы о содержании
                      <span className="tf-q-count-badge">{questions.length}</span>
                    </div>
                  </div>
                  <div className="tf-card-body">
                    <div className="tf-questions-list">
                      {questions.map((question, index) => (
                        <div key={question.id} className="tf-question-block">
                          <div className="tf-q-header">
                            <span className="tf-q-num">{index + 1}</span>
                            <span className={`tf-q-badge ${
                              question.type === 'multiple_choice' ? 'tf-q-mc' :
                              question.type === 'short_answer' ? 'tf-q-open' :
                              'tf-q-tf'
                            }`}>
                              {question.type === 'multiple_choice' ? 'Множественный выбор' :
                               question.type === 'short_answer' ? 'Открытый вопрос' :
                               'Верно / Неверно'}
                            </span>
                            <button className="tf-q-del" type="button" onClick={() => removeQuestion(question.id)}>
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                          <div className="tf-q-body">
                            <input
                              type="text"
                              className="tf-q-input"
                              placeholder="Вопрос…"
                              value={question.question}
                              onChange={(e) => updateQuestion(question.id, { question: e.target.value })}
                            />
                            
                            {question.type === 'multiple_choice' && (
                              <>
                                <div className="tf-mc-opts">
                                  {question.options?.map((opt, optIdx) => {
                                    const isCorrect = (question.correct_answer as string[] || []).includes(opt);
                                    return (
                                      <div key={optIdx} className="tf-mc-row">
                                        <div
                                          className={`tf-mc-circle ${isCorrect ? 'ok' : ''}`}
                                          onClick={() => toggleCorrectAnswer(question.id, optIdx)}
                                        >
                                          <svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
                                        </div>
                                        <span className="tf-mc-letter">{letters[optIdx] || '?'}</span>
                                        <input
                                          type="text"
                                          className="tf-mc-text"
                                          placeholder={`Вариант ${letters[optIdx] || optIdx + 1}…`}
                                          value={opt}
                                          onChange={(e) => updateOption(question.id, optIdx, e.target.value)}
                                        />
                                        {question.options && question.options.length > 2 && (
                                          <button
                                            className="tf-mc-rm"
                                            type="button"
                                            onClick={() => removeOption(question.id, optIdx)}
                                          >
                                            <X className="w-3 h-3" />
                                          </button>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                                <button
                                  className="tf-add-opt-btn"
                                  type="button"
                                  onClick={() => addOption(question.id)}
                                >
                                  <Plus className="w-3 h-3" />
                                  Добавить вариант
                                </button>
                              </>
                            )}

                            {question.type === 'true_false' && (
                              <div className="tf-tf-opts">
                                <button
                                  type="button"
                                  className={`tf-tf-btn ${question.correct_answer === 'True' ? 'tf-tf-true' : ''}`}
                                  onClick={() => updateQuestion(question.id, { correct_answer: 'True' })}
                                >
                                  <Check className="w-3 h-3" />
                                  Верно
                                </button>
                                <button
                                  type="button"
                                  className={`tf-tf-btn ${question.correct_answer === 'False' ? 'tf-tf-false' : ''}`}
                                  onClick={() => updateQuestion(question.id, { correct_answer: 'False' })}
                                >
                                  <X className="w-3 h-3" />
                                  Неверно
                                </button>
                              </div>
                            )}

                            {question.type === 'short_answer' && (
                              <textarea
                                className="tf-q-input"
                                style={{ minHeight: '60px', resize: 'vertical' }}
                                placeholder="Эталонный ответ (для ручной проверки)…"
                                value={question.correct_answer as string || ''}
                                onChange={(e) => updateQuestion(question.id, { correct_answer: e.target.value })}
                              />
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="tf-add-q-bar">
                      <button className="tf-add-q-btn" type="button" onClick={() => addQuestion('multiple_choice')}>
                        <Plus className="w-3 h-3" />
                        Множественный выбор
                      </button>
                      <button className="tf-add-q-btn" type="button" onClick={() => addQuestion('short_answer')}>
                        <Plus className="w-3 h-3" />
                        Открытый вопрос
                      </button>
                      <button className="tf-add-q-btn" type="button" onClick={() => addQuestion('true_false')}>
                        <Plus className="w-3 h-3" />
                        Верно / Неверно
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Card: Instructions */}
              <div className="tf-form-card">
                <div className="tf-card-header">
                  <div className="tf-card-title">
                    <div className="tf-card-title-num">
                      {taskType === 'listening' || taskType === 'reading' 
                        ? (contentSource === 'file' ? '4' : '3')
                        : '2'}
                    </div>
                    Инструкции
                  </div>
                </div>
                <div className="tf-card-body">
                  <div className="tf-instructions-editor">
                    <div className="tf-editor-toolbar">
                      <button className="tf-editor-btn" type="button" onClick={() => formatEditor('bold')} style={{ fontFamily: "'Playfair Display',serif", fontWeight: 900 }}>
                        B
                      </button>
                      <button className="tf-editor-btn" type="button" onClick={() => formatEditor('italic')} style={{ fontStyle: 'italic', fontFamily: "'Playfair Display',serif" }}>
                        I
                      </button>
                      <button className="tf-editor-btn" type="button" onClick={() => formatEditor('underline')} style={{ textDecoration: 'underline', fontSize: '0.8rem' }}>
                        U
                      </button>
                      <div className="tf-editor-divider"></div>
                      <button className="tf-editor-btn" type="button" onClick={() => formatEditor('insertUnorderedList')}>
                        <List className="w-3 h-3" />
                      </button>
                      <button className="tf-editor-btn" type="button" onClick={() => formatEditor('insertOrderedList')}>
                        <ListOrdered className="w-3 h-3" />
                      </button>
                      <div className="tf-editor-divider"></div>
                      <button className="tf-editor-btn" type="button" onClick={() => formatEditor('removeFormat')}>
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                    <div
                      ref={instructionsEditorRef}
                      className="tf-editor-area"
                      contentEditable
                      data-placeholder="Напишите инструкции для студентов — что нужно сделать, на что обратить внимание…"
                      onInput={(e) => {
                        if (instructionsEditorRef.current) {
                          const html = instructionsEditorRef.current.innerHTML;
                          setInstructions(html);
                        }
                      }}
                      suppressContentEditableWarning
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* RIGHT SIDEBAR */}
            <div className="tf-summary-sidebar">
              {/* Summary card */}
              <div className="tf-summary-card">
                <div className="tf-sc-header">
                  <div className="tf-sc-title">
                    <Check className="w-3 h-3" />
                    Задание
                  </div>
                </div>
                <div className="tf-sc-body">
                  <div className="tf-type-row">
                    <div
                      className="tf-type-dot"
                      style={{ background: typeConfig[taskType]?.color || 'var(--teal)' }}
                    />
                    <span className="tf-type-txt" style={{ color: typeConfig[taskType]?.color || 'var(--teal)' }}>
                      {typeConfig[taskType]?.label || 'Письмо'}
                    </span>
                  </div>
                  <div className="tf-s-row">
                    <span className="tf-s-key">Название</span>
                    <span className={`tf-s-val ${title.trim() ? '' : 'dim'}`}>
                      {title.trim() || 'Не указано'}
                    </span>
                  </div>
                  {(taskType === 'listening' || taskType === 'reading') && (
                    <div className="tf-s-row">
                      <span className="tf-s-key">Проверка</span>
                      <span className="tf-s-val" style={{ color: gradingType === 'manual' ? 'var(--gold)' : 'var(--teal)' }}>
                        {gradingType === 'manual' ? 'Ручная' : 'Авто'}
                      </span>
                    </div>
                  )}
                  <div className="tf-s-row">
                    <span className="tf-s-key">Юнит</span>
                    <span className={`tf-s-val ${selectedUnit ? '' : 'dim'}`}>
                      {selectedUnit ? selectedUnit.title : 'Без юнита'}
                    </span>
                  </div>
                  {(taskType === 'listening' || taskType === 'reading') && (
                    <div className="tf-s-row">
                      <span className="tf-s-key">Вопросов</span>
                      <span className="tf-s-val" style={{ fontFamily: "'Playfair Display',serif", fontSize: '1.1rem', fontWeight: 900 }}>
                        {questions.length}
                      </span>
                    </div>
                  )}
                  <div className="tf-s-row">
                    <span className="tf-s-key">Макс. балл</span>
                    <span className="tf-s-val">{maxScore}</span>
                  </div>
                  <div className="tf-action-strip">
                    <button className="tf-btn-primary" type="button" onClick={handleSubmit} disabled={saving}>
                      <Check className="w-3 h-3" />
                      {saving ? 'Сохранение...' : 'Сохранить изменения'}
                    </button>
                    <button className="tf-btn-ghost" type="button" onClick={() => navigate('/admin/tasks')}>
                      Отмена
                    </button>
                  </div>
                </div>
              </div>

              {/* Settings card */}
              <div className="tf-summary-card">
                <div className="tf-sc-header">
                  <div className="tf-sc-title">
                    <Settings className="w-3 h-3" />
                    Настройки
                  </div>
                </div>
                <div className="tf-sc-body">
                  <div className="tf-field">
                    <label className="tf-field-label" htmlFor="max-score">Максимальный балл</label>
                    <div className="tf-num-wrap">
                      <input
                        type="number"
                        id="max-score"
                        className="tf-field-input"
                        value={maxScore}
                        min="1"
                        max="9999"
                        onChange={(e) => setMaxScore(parseInt(e.target.value) || 100)}
                      />
                      <div className="tf-num-arrows">
                        <button type="button" className="tf-num-arrow" onClick={() => stepNumber('maxScore', 10)}>▲</button>
                        <button type="button" className="tf-num-arrow" onClick={() => stepNumber('maxScore', -10)}>▼</button>
                      </div>
                    </div>
                  </div>

                  <div className="tf-field">
                    <label className="tf-field-label" htmlFor="deadline">
                      <Calendar className="w-3 h-3" style={{ display: 'inline', marginRight: '0.25rem' }} />
                      Срок сдачи
                    </label>
                    <input
                      type="datetime-local"
                      id="deadline"
                      className="tf-field-input"
                      value={dueAt}
                      onChange={(e) => setDueAt(e.target.value)}
                    />
                  </div>

                  <div className="tf-field">
                    <label className="tf-field-label">Статус</label>
                    <div className="tf-status-seg">
                      <input
                        type="radio"
                        name="task-status"
                        id="s-draft"
                        value="draft"
                        className="tf-s-opt"
                        checked={status === 'draft'}
                        onChange={(e) => setStatus('draft')}
                      />
                      <label htmlFor="s-draft" className="tf-s-lbl">Черновик</label>
                      <input
                        type="radio"
                        name="task-status"
                        id="s-sched"
                        value="scheduled"
                        className="tf-s-opt"
                        checked={status === 'scheduled'}
                        onChange={(e) => setStatus('scheduled')}
                      />
                      <label htmlFor="s-sched" className="tf-s-lbl">Запланировано</label>
                      <input
                        type="radio"
                        name="task-status"
                        id="s-pub"
                        value="published"
                        className="tf-s-opt"
                        checked={status === 'published'}
                        onChange={(e) => setStatus('published')}
                      />
                      <label htmlFor="s-pub" className="tf-s-lbl">Опубликовано</label>
                      <input
                        type="radio"
                        name="task-status"
                        id="s-arch"
                        value="archived"
                        className="tf-s-opt"
                        checked={status === 'archived'}
                        onChange={(e) => setStatus('archived')}
                      />
                      <label htmlFor="s-arch" className="tf-s-lbl">Архив</label>
                    </div>
                  </div>

                  {status === 'scheduled' && (
                    <div className="tf-field">
                      <label className="tf-field-label" htmlFor="publish-date">
                        <Calendar className="w-3 h-3" style={{ display: 'inline', marginRight: '0.25rem' }} />
                        Дата публикации
                      </label>
                      <input
                        type="datetime-local"
                        id="publish-date"
                        className="tf-field-input"
                        value={publishAt}
                        onChange={(e) => setPublishAt(e.target.value)}
                      />
                    </div>
                  )}

                  <div className="tf-field">
                    <label className="tf-field-label" htmlFor="max-attempts">Максимум попыток</label>
                    <div className="tf-num-wrap">
                      <input
                        type="number"
                        id="max-attempts"
                        className="tf-field-input"
                        value={maxAttempts || ''}
                        min="1"
                        max="99"
                        onChange={(e) => setMaxAttempts(e.target.value ? parseInt(e.target.value) : null)}
                      />
                      <div className="tf-num-arrows">
                        <button type="button" className="tf-num-arrow" onClick={() => stepNumber('maxAttempts', 1)}>▲</button>
                        <button type="button" className="tf-num-arrow" onClick={() => stepNumber('maxAttempts', -1)}>▼</button>
                      </div>
                    </div>
                  </div>

                  <div className="tf-toggle-field">
                    <div className="tf-toggle-info">
                      <div className="tf-t-name">Видимость</div>
                      <div className="tf-t-desc">Отображается студентам</div>
                    </div>
                    <label>
                      <div className="tf-ts-inner">
                        <input
                          type="checkbox"
                          checked={isVisible}
                          onChange={(e) => setIsVisible(e.target.checked)}
                        />
                        <div className="tf-ts-track"></div>
                        <div className="tf-ts-thumb"></div>
                      </div>
                    </label>
                  </div>

                  {(taskType === 'listening' || taskType === 'reading') && (
                    <div className="tf-toggle-field">
                      <div className="tf-toggle-info">
                        <div className="tf-t-name">Перемешать вопросы</div>
                        <div className="tf-t-desc">Случайный порядок для каждого</div>
                      </div>
                      <label>
                        <div className="tf-ts-inner">
                          <input
                            type="checkbox"
                            checked={shuffleQuestions}
                            onChange={(e) => setShuffleQuestions(e.target.checked)}
                          />
                          <div className="tf-ts-track"></div>
                          <div className="tf-ts-thumb"></div>
                        </div>
                      </label>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
