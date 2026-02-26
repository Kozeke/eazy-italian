import { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { 
  ArrowLeft,
  Plus,
  X,
  Pencil,
  Trash2,
  BookMarked,
  Check,
  AlertCircle,
  GripVertical,
  Video,
  FileText,
  ClipboardList
} from 'lucide-react';
import { unitsApi, tasksApi, testsApi, videosApi, coursesApi } from '../../services/api';
import toast from 'react-hot-toast';
import RichTextEditor from '../../components/admin/RichTextEditor';

interface LearningGoal {
  id: string;
  text: string;
}

interface UnitFormData {
  title: string;
  level: string;
  description: string;
  goals: string;
  tags: string[];
  status: string;
  publish_at: string;
  order_index: number | '';
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
  is_visible_to_students?: boolean;
}

export default function AdminUnitEditPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [newTag, setNewTag] = useState('');
  const [learningGoals, setLearningGoals] = useState<LearningGoal[]>([]);
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const dropdownRefs = useRef<{ [key: string]: HTMLDivElement | null }>({});

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

  // Mock content data
  const [videos, setVideos] = useState<ContentItem[]>([]);
  const [tasks, setTasks] = useState<ContentItem[]>([]);
  const [tests, setTests] = useState<ContentItem[]>([]);
  
  // Available content from API
  const [availableVideos, setAvailableVideos] = useState<any[]>([]);
  const [availableTasks, setAvailableTasks] = useState<any[]>([]);
  const [availableTests, setAvailableTests] = useState<any[]>([]);
  const [availableCourses, setAvailableCourses] = useState<any[]>([]);
  const [loadingContent, setLoadingContent] = useState(true);

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
        } catch (error) {
          console.error('Error loading available videos:', error);
        }
        
        // Load all available tasks
        const tasksData = await tasksApi.getAdminTasks({ limit: 100 });
        setAvailableTasks(tasksData || []);
        
        // Load all available tests  
        const testsData = await testsApi.getTests({ limit: 100 });
        const testsList = testsData?.items || (Array.isArray(testsData) ? testsData : []);
        setAvailableTests(testsList);
        
        console.log('Loaded available content:', { 
          videos: availableVideos?.length || 0,
          tasks: tasksData?.length || 0, 
          tests: testsList?.length || 0,
          tasksData,
          testsData 
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

  useEffect(() => {
    // Load unit data
    const loadUnitData = async () => {
      if (!id) {
        toast.error('ID юнита не найден');
        navigate('/admin/units');
        return;
      }

      try {
        setLoading(true);
        const unitData = await unitsApi.getAdminUnit(parseInt(id));
        
        const goalsText = (unitData as any).goals || '';
        const goalsList = goalsText ? goalsText.split('\n').filter((g: string) => g.trim()).map((g: string, idx: number) => ({
          id: `goal-${idx}-${Date.now()}`,
          text: g.trim()
        })) : [];

        setFormData({
          title: unitData.title || '',
          level: unitData.level || 'A1',
          description: unitData.description || '',
          goals: goalsText,
          tags: (unitData as any).tags || [],
          status: unitData.status || 'draft',
          publish_at: (unitData as any).publish_at ? (unitData as any).publish_at.slice(0, 16) : '',
          order_index: unitData.order_index ?? 0,
          course_id: (unitData as any).course_id || null,
          is_visible_to_students: (unitData as any).is_visible_to_students || false,
          meta_title: (unitData as any).meta_title || '',
          meta_description: (unitData as any).meta_description || ''
        });

        setLearningGoals(goalsList);

        // Load videos, tasks, tests for this unit
        try {
          // Load videos using admin API service (to get all videos including drafts)
          try {
            const videosData = await videosApi.getAdminVideos({ unit_id: parseInt(id), limit: 100 });
            setVideos(videosData.map((v: any) => ({ 
              id: v.id, 
              title: v.title, 
              status: v.status, 
              order_index: v.order_index, 
              type: 'video' as const,
              is_visible_to_students: v.is_visible_to_students ?? true
            })));
            console.log('Loaded videos:', videosData.length);
          } catch (error) {
            console.error('Error loading videos:', error);
          }

          // Load tasks using API service
          try {
            const tasksData = await tasksApi.getAdminTasks({ unit_id: parseInt(id) });
            console.log('Loaded tasks for unit:', tasksData);
            const tasksList = Array.isArray(tasksData) ? tasksData : [];
            setTasks(tasksList.map((t: any) => ({ id: t.id, title: t.title, status: t.status, order_index: t.order_index, type: 'task' })));
            console.log('Set tasks state:', tasksList.length);
          } catch (error) {
            console.error('Error loading tasks:', error);
          }

          // Load tests using API service
          try {
            const testsData = await testsApi.getTests({ unit_id: parseInt(id) });
            console.log('Loaded tests for unit:', testsData);
            const testsList = testsData?.items || (Array.isArray(testsData) ? testsData : []);
            setTests(testsList.map((t: any) => ({ id: t.id, title: t.title, status: t.status, order_index: t.order_index, type: 'test' })));
            console.log('Set tests state:', testsList.length);
          } catch (error) {
            console.error('Error loading tests:', error);
          }
        } catch (contentError) {
          console.error('Error loading unit content:', contentError);
        }

      } catch (error: any) {
        console.error('Error loading unit:', error);
        toast.error(error.response?.data?.detail || 'Ошибка при загрузке юнита');
        navigate('/admin/units');
      } finally {
        setLoading(false);
      }
    };

    if (id) {
      loadUnitData();
    }
  }, [id]);

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

  const handleAddExistingContent = (type: 'video' | 'task' | 'test', contentId: number) => {
    const availableContent = type === 'video' ? availableVideos : type === 'task' ? availableTasks : availableTests;
    const content = availableContent.find(item => item.id === contentId);
    
    if (!content) return;

    // Check if already added
    const allItems = type === 'video' ? videos : type === 'task' ? tasks : tests;
    if (allItems.some(item => item.id === content.id)) {
      toast.error(`${content.title} уже добавлен`);
      setOpenDropdown(null);
      return;
    }
    
    const newItem: ContentItem = {
      id: content.id,
      title: content.title,
      status: content.status || 'draft',
      order_index: type === 'video' ? videos.length : type === 'task' ? tasks.length : tests.length,
      type,
      is_visible_to_students: type === 'video' ? (content.is_visible_to_students ?? true) : undefined
    };
    
    if (type === 'video') {
      setVideos(prev => [...prev, newItem]);
    } else if (type === 'task') {
      setTasks(prev => [...prev, newItem]);
    } else {
      setTests(prev => [...prev, newItem]);
    }
    
    toast.success(`${content.title} добавлен`);
    setOpenDropdown(null);
  };

  const handleRemoveContent = async (type: 'video' | 'task' | 'test', id: number) => {
    // Get the item to show confirmation
    const items = type === 'video' ? videos : type === 'task' ? tasks : tests;
    const item = items.find(i => i.id === id);
    
    if (!item) return;
    
    // Confirm deletion
    const confirmMessage = type === 'video' 
      ? `Вы уверены, что хотите удалить видео "${item.title}"? Это действие нельзя отменить.`
      : type === 'task'
      ? `Вы уверены, что хотите удалить задание "${item.title}"? Это действие нельзя отменить.`
      : `Вы уверены, что хотите удалить тест "${item.title}"? Это действие нельзя отменить.`;
    
    if (!window.confirm(confirmMessage)) {
      return;
    }
    
    try {
      // Delete from backend
      if (type === 'video') {
        await videosApi.deleteVideo(id);
        setVideos(prev => prev.filter(item => item.id !== id));
        toast.success('Видео успешно удалено');
      } else if (type === 'task') {
        await tasksApi.deleteTask(id);
        setTasks(prev => prev.filter(item => item.id !== id));
        toast.success('Задание успешно удалено');
      } else {
        await testsApi.deleteTest(id);
        setTests(prev => prev.filter(item => item.id !== id));
        toast.success('Тест успешно удален');
      }
    } catch (error: any) {
      console.error(`Error deleting ${type}:`, error);
      toast.error(
        error.response?.data?.detail || 
        `Ошибка при удалении ${type === 'video' ? 'видео' : type === 'task' ? 'задания' : 'теста'}`
      );
    }
  };

  const handleSave = async (publish: boolean = false) => {
    if (!id) {
      toast.error('ID юнита не найден');
      return;
    }

    setSaving(true);
    
    try {
      console.log('=== STARTING SAVE ===');
      console.log('Unit ID:', id);
      console.log('Tasks to save:', tasks);
      console.log('Tests to save:', tests);
      console.log('Videos to save:', videos);
      
      // Smart defaults: status and visibility derived from publish action
      const status = publish ? 'published' : 'draft';
      const is_visible_to_students = publish; // Always true when published
      
      // Convert learning goals to string
      const goalsText = learningGoals.map(g => g.text.trim()).filter(Boolean).join('\n');
      
      // Save unit data
      const unitData = {
        ...formData,
        goals: goalsText || formData.goals,
        order_index: formData.order_index === '' ? 0 : formData.order_index,
        status: status,
        is_visible_to_students: is_visible_to_students,
        publish_at: formData.publish_at || (publish ? new Date().toISOString() : null)
      } as any;
      
      console.log('Sending unit data:', JSON.stringify(unitData, null, 2));

      await unitsApi.updateUnit(parseInt(id), unitData);
      console.log('✅ Unit data saved');
      
      // Update tasks to associate with this unit
      let tasksUpdated = 0;
      for (const task of tasks) {
        try {
          console.log(`Updating task ${task.id} to unit ${id}...`);
          await tasksApi.updateTask(task.id, { unit_id: parseInt(id) } as any);
          tasksUpdated++;
          console.log(`✅ Task ${task.id} updated`);
        } catch (error) {
          console.error(`❌ Error updating task ${task.id}:`, error);
        }
      }
      
      // Update tests to associate with this unit
      let testsUpdated = 0;
      for (const test of tests) {
        try {
          console.log(`Updating test ${test.id} to unit ${id}...`);
          await testsApi.updateTest(test.id, { unit_id: parseInt(id) } as any);
          testsUpdated++;
          console.log(`✅ Test ${test.id} updated`);
        } catch (error) {
          console.error(`❌ Error updating test ${test.id}:`, error);
        }
      }
      
      // Update videos to associate with this unit
      let videosUpdated = 0;
      for (const video of videos) {
        try {
          console.log(`Updating video ${video.id} to unit ${id}...`);
          await videosApi.updateVideo(video.id, { unit_id: parseInt(id) } as any);
          videosUpdated++;
          console.log(`✅ Video ${video.id} updated`);
        } catch (error) {
          console.error(`❌ Error updating video ${video.id}:`, error);
        }
      }
      
      console.log(`=== SAVE COMPLETE: ${tasksUpdated} tasks, ${testsUpdated} tests, ${videosUpdated} videos updated ===`);
      toast.success(`Юнит сохранен! Обновлено: ${videosUpdated} видео, ${tasksUpdated} заданий, ${testsUpdated} тестов`);
      
      // Navigate back to units page
      setTimeout(() => {
        navigate('/admin/units');
      }, 500);
    } catch (error: any) {
      console.error('Error saving unit:', error);
      // Handle validation errors (422)
      if (error.response?.status === 422) {
        const detail = error.response?.data?.detail;
        if (Array.isArray(detail)) {
          const errorMessages = detail.map((err: any) => err.msg || JSON.stringify(err)).join(', ');
          toast.error(`Ошибка валидации: ${errorMessages}`);
        } else if (typeof detail === 'string') {
          toast.error(detail);
        } else {
          toast.error('Ошибка валидации данных');
        }
      } else {
        const message = typeof error.response?.data?.detail === 'string' 
          ? error.response.data.detail 
          : 'Ошибка при сохранении юнита';
        toast.error(message);
      }
    } finally {
      setSaving(false);
    }
  };


  const unusedVideos = availableVideos.filter(v => !videos.some(item => item.id === v.id));
  const unusedTasks = availableTasks.filter(t => !tasks.some(item => item.id === t.id));
  const unusedTests = availableTests.filter(t => !tests.some(item => item.id === t.id));

  const selectedCourse = availableCourses.find(c => c.id === formData.course_id);
  const courseName = selectedCourse ? `${selectedCourse.title}${selectedCourse.level ? ` (${selectedCourse.level})` : ''}` : 'Автономный';

  // Checklist items
  const checklistItems = [
    {
      ok: !!formData.title.trim(),
      label: 'Название юнита',
      status: formData.title.trim() ? 'Указано' : 'Необходимо добавить название',
      type: formData.title.trim() ? 'ok' : 'warn'
    },
    {
      ok: videos.length + tasks.length + tests.length > 0,
      label: 'Контент добавлен',
      status: videos.length + tasks.length + tests.length > 0 
        ? `${videos.length} видео, ${tasks.length} заданий, ${tests.length} тестов`
        : 'Добавьте хотя бы один элемент',
      type: videos.length + tasks.length + tests.length > 0 ? 'ok' : 'warn'
    },
    {
      ok: !!formData.course_id,
      label: 'Привязка к курсу',
      status: formData.course_id ? courseName : 'Не выбрано (автономный юнит)',
      type: formData.course_id ? 'ok' : 'warn'
    },
    {
      ok: videos.length > 0,
      label: 'Видео-уроки',
      status: videos.length > 0 ? `${videos.length} видео добавлено` : 'Рекомендуется добавить хотя бы одно видео',
      type: videos.length > 0 ? 'ok' : 'warn'
    }
  ];

  if (loading) {
    return (
      <div className="tf-unit-page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <div className="animate-spin rounded-full h-8 w-8 border-b-2" style={{ borderColor: 'var(--teal)', margin: '0 auto 1rem' }}></div>
          <p style={{ color: 'var(--muted)' }}>Загрузка юнита...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,700;0,900;1,700&family=DM+Sans:wght@300;400;500&family=Space+Mono:wght@400;700&display=swap');
        
        .tf-unit-root {
          --ink: #0e0e0e;
          --cream: #f5f0e8;
          --warm: #f0e9d8;
          --gold: #c9962a;
          --gold-light: #e8b84b;
          --gold-dim: rgba(201,150,42,.1);
          --rust: #c94a2a;
          --rust-dim: rgba(201,74,42,.1);
          --teal: #1a7070;
          --teal-light: #2a9898;
          --teal-dim: rgba(26,112,112,.1);
          --violet: #5a3080;
          --violet-dim: rgba(90,48,128,.1);
          --muted: #6b6456;
          --line: rgba(14,14,14,.1);
        }

        .tf-unit-page {
          min-height: 100vh;
          font-family: 'DM Sans', sans-serif;
          font-weight: 300;
          background: var(--warm);
          color: var(--ink);
        }

        .tf-unit-page::after {
          content: '';
          position: fixed;
          inset: 0;
          z-index: 9999;
          pointer-events: none;
          background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.04'/%3E%3C/svg%3E");
          opacity: .25;
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

        .tf-tbl {
          display: flex;
          align-items: center;
          gap: 1rem;
        }

        .tf-back-link {
          display: flex;
          align-items: center;
          gap: .45rem;
          font-family: 'Space Mono', monospace;
          font-size: .65rem;
          letter-spacing: .08em;
          text-transform: uppercase;
          color: var(--muted);
          text-decoration: none;
          transition: color .2s;
          white-space: nowrap;
          background: none;
          border: none;
          cursor: pointer;
        }

        .tf-back-link:hover {
          color: var(--teal);
        }

        .tf-back-link svg {
          width: 13px;
          height: 13px;
          stroke: currentColor;
          fill: none;
          stroke-width: 2;
          stroke-linecap: round;
          stroke-linejoin: round;
        }

        .tf-tbdiv {
          width: 1px;
          height: 18px;
          background: var(--line);
        }

        .tf-breadcrumb {
          font-family: 'Space Mono', monospace;
          font-size: .65rem;
          letter-spacing: .1em;
          text-transform: uppercase;
          color: var(--muted);
          display: flex;
          align-items: center;
          gap: .4rem;
        }

        .tf-breadcrumb .sep {
          opacity: .35;
        }

        .tf-breadcrumb .cur {
          color: var(--ink);
        }

        .tf-tbr {
          display: flex;
          align-items: center;
          gap: .7rem;
        }

        .tf-btn-outline {
          background: none;
          border: 1px solid var(--line);
          padding: .48rem .9rem;
          font-family: 'Space Mono', monospace;
          font-size: .65rem;
          letter-spacing: .07em;
          cursor: pointer;
          color: var(--muted);
          transition: all .2s;
          display: flex;
          align-items: center;
          gap: .4rem;
        }

        .tf-btn-outline:hover {
          border-color: var(--ink);
          color: var(--ink);
        }

        .tf-btn-outline svg {
          width: 12px;
          height: 12px;
          stroke: currentColor;
          fill: none;
          stroke-width: 2;
          stroke-linecap: round;
          stroke-linejoin: round;
        }

        .tf-btn-teal {
          background: var(--teal);
          color: #fff;
          border: none;
          padding: .52rem 1.25rem;
          font-family: 'Space Mono', monospace;
          font-size: .68rem;
          letter-spacing: .07em;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: .45rem;
          transition: background .2s;
          white-space: nowrap;
        }

        .tf-btn-teal:hover {
          background: var(--teal-light);
        }

        .tf-btn-teal:disabled {
          opacity: .5;
          cursor: not-allowed;
        }

        .tf-btn-teal svg {
          width: 13px;
          height: 13px;
          stroke: currentColor;
          fill: none;
          stroke-width: 2.2;
          stroke-linecap: round;
          stroke-linejoin: round;
        }

        .tf-page-content {
          padding: 2.5rem 2.5rem 5rem;
          flex: 1;
          position: relative;
          z-index: 1;
        }

        .tf-page-header {
          margin-bottom: 2.25rem;
          opacity: 0;
          animation: tfFadeUp .6s .08s forwards;
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
          margin-top: .4rem;
          font-size: .85rem;
          color: var(--muted);
          display: flex;
          align-items: center;
          gap: .5rem;
        }

        .tf-page-meta svg {
          width: 13px;
          height: 13px;
          stroke: var(--muted);
          fill: none;
          stroke-width: 1.8;
          stroke-linecap: round;
          stroke-linejoin: round;
          opacity: .6;
          flex-shrink: 0;
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
          opacity: 0;
          animation: tfFadeUp .6s forwards;
          margin-bottom: 1.25rem;
        }

        .tf-form-card:last-child {
          margin-bottom: 0;
        }

        .tf-form-card.fc1 { animation-delay: .12s; }
        .tf-form-card.fc2 { animation-delay: .18s; }
        .tf-form-card.fc3 { animation-delay: .24s; }
        .tf-form-card.fc4 { animation-delay: .30s; }

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
          font-size: .68rem;
          font-weight: 700;
          letter-spacing: .12em;
          text-transform: uppercase;
          color: var(--ink);
          display: flex;
          align-items: center;
          gap: .6rem;
        }

        .tf-card-title svg {
          width: 14px;
          height: 14px;
          stroke: var(--teal);
          fill: none;
          stroke-width: 1.8;
          stroke-linecap: round;
          stroke-linejoin: round;
        }

        .tf-card-num {
          width: 22px;
          height: 22px;
          background: var(--teal);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: .62rem;
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
          gap: .45rem;
        }

        .tf-field-label {
          font-family: 'Space Mono', monospace;
          font-size: .62rem;
          font-weight: 700;
          letter-spacing: .1em;
          text-transform: uppercase;
          color: var(--ink);
          display: flex;
          align-items: center;
          gap: .35rem;
        }

        .tf-required-star {
          color: var(--rust);
          font-size: .8rem;
        }

        .tf-field-hint {
          font-size: .78rem;
          color: var(--muted);
          line-height: 1.5;
          margin-top: -.15rem;
        }

        .tf-field-input {
          width: 100%;
          padding: .7rem .9rem;
          border: 1px solid var(--line);
          background: var(--warm);
          font-family: 'DM Sans', sans-serif;
          font-size: .9rem;
          font-weight: 300;
          color: var(--ink);
          outline: none;
          transition: border-color .2s, background .2s, box-shadow .2s;
          border-radius: 0;
          resize: none;
        }

        .tf-field-input:focus {
          border-color: var(--teal);
          background: var(--cream);
          box-shadow: 0 0 0 3px var(--teal-dim);
        }

        .tf-field-input::placeholder {
          color: rgba(107,100,86,.4);
        }

        .tf-field-input.err {
          border-color: var(--rust) !important;
        }

        textarea.tf-field-input {
          min-height: 88px;
          line-height: 1.6;
        }

        .tf-input-wrap {
          position: relative;
        }

        .tf-char-counter {
          position: absolute;
          bottom: .55rem;
          right: .7rem;
          font-family: 'Space Mono', monospace;
          font-size: .55rem;
          color: var(--muted);
          opacity: .5;
          pointer-events: none;
        }

        .tf-select-wrap {
          position: relative;
        }

        .tf-select-wrap::after {
          content: '';
          position: absolute;
          right: .9rem;
          top: 50%;
          transform: translateY(-50%);
          width: 0;
          height: 0;
          border-left: 4px solid transparent;
          border-right: 4px solid transparent;
          border-top: 5px solid var(--muted);
          pointer-events: none;
        }

        .tf-field-input.select {
          appearance: none;
          -webkit-appearance: none;
          cursor: pointer;
          padding-right: 2.5rem;
        }

        .tf-level-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: .5rem;
        }

        .tf-level-option {
          display: none;
        }

        .tf-level-label {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: .65rem .5rem;
          border: 1px solid var(--line);
          background: var(--warm);
          cursor: pointer;
          transition: all .18s;
          text-align: center;
          gap: .2rem;
        }

        .tf-level-label:hover {
          background: var(--cream);
          border-color: var(--muted);
        }

        .tf-level-option:checked + .tf-level-label {
          border-color: var(--teal);
          background: var(--teal-dim);
        }

        .tf-level-code {
          font-family: 'Space Mono', monospace;
          font-size: .72rem;
          font-weight: 700;
          letter-spacing: .05em;
          color: var(--muted);
          transition: color .18s;
        }

        .tf-level-name {
          font-size: .68rem;
          color: var(--muted);
          transition: color .18s;
        }

        .tf-level-option:checked + .tf-level-label .tf-level-code,
        .tf-level-option:checked + .tf-level-label .tf-level-name {
          color: var(--teal);
        }

        .tf-goals-list {
          display: flex;
          flex-direction: column;
          gap: .45rem;
        }

        .tf-goal-row {
          display: flex;
          align-items: center;
          gap: .5rem;
          animation: tfGoalIn .25s ease;
        }

        @keyframes tfGoalIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .tf-goal-bullet {
          width: 22px;
          height: 22px;
          border-radius: 50%;
          background: var(--teal-dim);
          border: 1px solid var(--teal);
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        .tf-goal-bullet svg {
          width: 10px;
          height: 10px;
          stroke: var(--teal);
          fill: none;
          stroke-width: 2.5;
          stroke-linecap: round;
          stroke-linejoin: round;
        }

        .tf-goal-input {
          flex: 1;
          padding: .45rem .65rem;
          border: 1px solid var(--line);
          background: var(--warm);
          font-family: 'DM Sans', sans-serif;
          font-size: .85rem;
          color: var(--ink);
          outline: none;
          transition: border-color .18s;
          border-radius: 0;
        }

        .tf-goal-input:focus {
          border-color: var(--teal);
        }

        .tf-goal-input::placeholder {
          color: rgba(107,100,86,.4);
        }

        .tf-goal-del {
          background: none;
          border: none;
          cursor: pointer;
          color: var(--muted);
          padding: .2rem;
          opacity: .35;
          transition: opacity .15s, color .15s;
          display: flex;
        }

        .tf-goal-del:hover {
          opacity: 1;
          color: var(--rust);
        }

        .tf-goal-del svg {
          width: 11px;
          height: 11px;
          stroke: currentColor;
          fill: none;
          stroke-width: 2.5;
          stroke-linecap: round;
          stroke-linejoin: round;
        }

        .tf-add-goal-btn {
          display: inline-flex;
          align-items: center;
          gap: .4rem;
          background: none;
          border: 1px dashed var(--line);
          padding: .42rem .75rem;
          font-family: 'Space Mono', monospace;
          font-size: .57rem;
          letter-spacing: .07em;
          text-transform: uppercase;
          color: var(--muted);
          cursor: pointer;
          transition: all .18s;
          align-self: flex-start;
        }

        .tf-add-goal-btn:hover {
          border-color: var(--teal);
          color: var(--teal);
        }

        .tf-add-goal-btn svg {
          width: 10px;
          height: 10px;
          stroke: currentColor;
          fill: none;
          stroke-width: 2.5;
          stroke-linecap: round;
          stroke-linejoin: round;
        }

        .tf-content-section {
          border: 1px solid var(--line);
          background: var(--cream);
        }

        .tf-content-section + .tf-content-section {
          border-top: none;
        }

        .tf-cs-head {
          display: flex;
          align-items: center;
          padding: .85rem 1.25rem;
          background: var(--warm);
          border-bottom: 1px solid var(--line);
          gap: .65rem;
        }

        .tf-cs-icon {
          width: 28px;
          height: 28px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        .tf-cs-icon svg {
          width: 14px;
          height: 14px;
          stroke: var(--muted);
          fill: none;
          stroke-width: 1.8;
          stroke-linecap: round;
          stroke-linejoin: round;
        }

        .tf-cs-title-wrap {
          flex: 1;
        }

        .tf-cs-title {
          font-family: 'Space Mono', monospace;
          font-size: .65rem;
          font-weight: 700;
          letter-spacing: .1em;
          text-transform: uppercase;
          color: var(--ink);
        }

        .tf-cs-count {
          font-family: 'Space Mono', monospace;
          font-size: .6rem;
          color: var(--muted);
          margin-top: .1rem;
        }

        .tf-cs-add-wrap {
          position: relative;
        }

        .tf-cs-add-btn {
          display: flex;
          align-items: center;
          gap: .4rem;
          padding: .4rem .8rem;
          border: 1px solid var(--line);
          background: var(--cream);
          font-family: 'Space Mono', monospace;
          font-size: .58rem;
          letter-spacing: .06em;
          text-transform: uppercase;
          color: var(--muted);
          cursor: pointer;
          transition: all .18s;
        }

        .tf-cs-add-btn:hover {
          border-color: var(--teal);
          color: var(--teal);
        }

        .tf-cs-add-btn svg {
          width: 11px;
          height: 11px;
          stroke: currentColor;
          fill: none;
          stroke-width: 2;
          stroke-linecap: round;
          stroke-linejoin: round;
        }

        .tf-cs-dropdown {
          position: absolute;
          right: 0;
          top: calc(100% + 4px);
          min-width: 260px;
          background: var(--cream);
          border: 1px solid var(--line);
          box-shadow: 0 8px 24px rgba(0,0,0,.12);
          z-index: 200;
          display: none;
          max-height: 400px;
          overflow-y: auto;
        }

        .tf-cs-dropdown.open {
          display: block;
        }

        .tf-dd-section {
          padding: .35rem 0;
          border-bottom: 1px solid var(--line);
        }

        .tf-dd-section:last-child {
          border-bottom: none;
        }

        .tf-dd-section-label {
          font-family: 'Space Mono', monospace;
          font-size: .54rem;
          letter-spacing: .1em;
          text-transform: uppercase;
          color: var(--muted);
          padding: .4rem 1rem .2rem;
          opacity: .6;
        }

        .tf-dd-item {
          display: flex;
          align-items: center;
          gap: .6rem;
          padding: .55rem 1rem;
          cursor: pointer;
          transition: background .15s;
          font-size: .85rem;
          color: var(--ink);
        }

        .tf-dd-item:hover {
          background: var(--warm);
        }

        .tf-dd-item svg {
          width: 12px;
          height: 12px;
          stroke: var(--muted);
          fill: none;
          stroke-width: 1.8;
          stroke-linecap: round;
          stroke-linejoin: round;
          flex-shrink: 0;
        }

        .tf-dd-item.create {
          color: var(--teal);
          font-family: 'Space Mono', monospace;
          font-size: .62rem;
          letter-spacing: .06em;
          text-transform: uppercase;
          font-weight: 700;
        }

        .tf-dd-item.create svg {
          stroke: var(--teal);
        }

        .tf-cs-body {
          padding: .75rem 1.25rem;
          display: flex;
          flex-direction: column;
          gap: .5rem;
        }

        .tf-cs-empty {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: .5rem;
          padding: 1.5rem;
          border: 1px dashed var(--line);
          background: var(--warm);
          text-align: center;
        }

        .tf-cs-empty-icon svg {
          width: 18px;
          height: 18px;
          stroke: rgba(14,14,14,.2);
          fill: none;
          stroke-width: 1.5;
          stroke-linecap: round;
          stroke-linejoin: round;
        }

        .tf-cs-empty-title {
          font-family: 'Space Mono', monospace;
          font-size: .6rem;
          letter-spacing: .07em;
          text-transform: uppercase;
          color: var(--muted);
          opacity: .55;
        }

        .tf-cs-empty-sub {
          font-size: .73rem;
          color: var(--muted);
          opacity: .5;
        }

        .tf-content-chip {
          display: flex;
          align-items: center;
          gap: .65rem;
          padding: .6rem .85rem;
          border: 1px solid var(--line);
          background: var(--warm);
          transition: all .18s;
          animation: tfGoalIn .25s ease;
        }

        .tf-content-chip:hover {
          border-color: var(--teal);
          background: var(--teal-dim);
        }

        .tf-chip-drag {
          cursor: grab;
          color: var(--muted);
          opacity: .3;
          display: flex;
          align-items: center;
        }

        .tf-chip-drag svg {
          width: 12px;
          height: 12px;
          stroke: currentColor;
          fill: none;
          stroke-width: 1.8;
          stroke-linecap: round;
          stroke-linejoin: round;
        }

        .tf-chip-icon {
          width: 26px;
          height: 26px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        .tf-chip-icon svg {
          width: 12px;
          height: 12px;
          stroke: var(--muted);
          fill: none;
          stroke-width: 1.8;
          stroke-linecap: round;
          stroke-linejoin: round;
        }

        .tf-chip-info {
          flex: 1;
          min-width: 0;
        }

        .tf-chip-name {
          font-size: .84rem;
          color: var(--ink);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .tf-chip-meta {
          font-family: 'Space Mono', monospace;
          font-size: .55rem;
          color: var(--muted);
          margin-top: .08rem;
          opacity: .6;
        }

        .tf-chip-del {
          background: none;
          border: none;
          cursor: pointer;
          color: var(--muted);
          padding: .22rem;
          opacity: .35;
          transition: opacity .15s, color .15s;
          display: flex;
        }

        .tf-chip-del:hover {
          opacity: 1;
          color: var(--rust);
        }

        .tf-chip-del svg {
          width: 11px;
          height: 11px;
          stroke: currentColor;
          fill: none;
          stroke-width: 2.5;
          stroke-linecap: round;
          stroke-linejoin: round;
        }

        .tf-adv-toggle {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: .85rem 1.5rem;
          background: var(--warm);
          border: 1px solid var(--line);
          cursor: pointer;
          user-select: none;
          transition: background .2s;
          opacity: 0;
          animation: tfFadeUp .6s .36s forwards;
        }

        .tf-adv-toggle:hover {
          background: var(--cream);
        }

        .tf-adv-toggle-lbl {
          font-family: 'Space Mono', monospace;
          font-size: .65rem;
          font-weight: 700;
          letter-spacing: .1em;
          text-transform: uppercase;
          color: var(--muted);
          display: flex;
          align-items: center;
          gap: .5rem;
        }

        .tf-adv-toggle-lbl svg {
          width: 13px;
          height: 13px;
          stroke: var(--muted);
          fill: none;
          stroke-width: 1.8;
          stroke-linecap: round;
          stroke-linejoin: round;
        }

        .tf-adv-chevron {
          width: 15px;
          height: 15px;
          stroke: var(--muted);
          fill: none;
          stroke-width: 2;
          stroke-linecap: round;
          stroke-linejoin: round;
          transition: transform .3s;
        }

        .tf-adv-toggle.open .tf-adv-chevron {
          transform: rotate(180deg);
        }

        .tf-adv-panel {
          display: none;
          flex-direction: column;
          gap: 1.25rem;
        }

        .tf-adv-panel.open {
          display: flex;
        }

        .tf-adv-panel .tf-form-card {
          animation: none;
          opacity: 1;
          border-top: none;
          margin-bottom: 0;
        }

        .tf-tags-wrap {
          display: flex;
          flex-wrap: wrap;
          gap: .4rem;
          align-items: center;
        }

        .tf-tag-chip {
          display: flex;
          align-items: center;
          gap: .35rem;
          background: var(--ink);
          color: var(--cream);
          font-family: 'Space Mono', monospace;
          font-size: .58rem;
          font-weight: 700;
          letter-spacing: .05em;
          text-transform: uppercase;
          padding: .28rem .6rem;
        }

        .tf-tag-chip svg {
          width: 9px;
          height: 9px;
          stroke: currentColor;
          fill: none;
          stroke-width: 2.5;
          stroke-linecap: round;
          stroke-linejoin: round;
          cursor: pointer;
          opacity: .5;
          transition: opacity .15s;
        }

        .tf-tag-chip svg:hover {
          opacity: 1;
        }

        .tf-tag-input-row {
          display: flex;
          gap: .5rem;
        }

        .tf-tag-input {
          flex: 1;
          padding: .55rem .75rem;
          border: 1px solid var(--line);
          background: var(--warm);
          font-family: 'DM Sans', sans-serif;
          font-size: .85rem;
          color: var(--ink);
          outline: none;
          transition: border-color .2s;
          border-radius: 0;
        }

        .tf-tag-input:focus {
          border-color: var(--teal);
        }

        .tf-tag-add-btn {
          padding: .52rem 1rem;
          background: var(--ink);
          color: var(--cream);
          border: none;
          font-family: 'Space Mono', monospace;
          font-size: .62rem;
          letter-spacing: .06em;
          cursor: pointer;
          transition: background .18s;
        }

        .tf-tag-add-btn:hover {
          background: var(--teal);
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
          font-size: .58rem;
          transition: background .15s, color .15s;
        }

        .tf-num-arrow:hover {
          background: var(--cream);
          color: var(--teal);
        }

        .tf-num-arrow + .tf-num-arrow {
          border-top: 1px solid var(--line);
        }

        .tf-sidebar-cards {
          display: flex;
          flex-direction: column;
          gap: 1.25rem;
          position: sticky;
          top: 84px;
        }

        .tf-sidebar-card {
          background: var(--cream);
          border: 1px solid var(--line);
          opacity: 0;
          animation: tfFadeUp .6s forwards;
        }

        .tf-sidebar-card.sc1 { animation-delay: .15s; }
        .tf-sidebar-card.sc2 { animation-delay: .22s; }
        .tf-sidebar-card.sc3 { animation-delay: .28s; }

        .tf-sc-header {
          padding: .9rem 1.25rem;
          border-bottom: 1px solid var(--line);
          background: var(--warm);
        }

        .tf-sc-title {
          font-family: 'Space Mono', monospace;
          font-size: .65rem;
          font-weight: 700;
          letter-spacing: .12em;
          text-transform: uppercase;
          color: var(--ink);
          display: flex;
          align-items: center;
          gap: .5rem;
        }

        .tf-sc-title svg {
          width: 13px;
          height: 13px;
          stroke: var(--teal);
          fill: none;
          stroke-width: 2;
          stroke-linecap: round;
          stroke-linejoin: round;
        }

        .tf-sc-body {
          padding: 1.1rem 1.25rem;
          display: flex;
          flex-direction: column;
          gap: .85rem;
        }

        .tf-status-pill {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: .5rem .75rem;
          border: 1px solid var(--line);
          background: var(--warm);
        }

        .tf-sp-label {
          font-family: 'Space Mono', monospace;
          font-size: .58rem;
          font-weight: 700;
          letter-spacing: .08em;
          text-transform: uppercase;
        }

        .tf-sp-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: var(--muted);
          transition: all .2s;
        }

        .tf-status-pill.pub .tf-sp-label {
          color: var(--teal);
        }

        .tf-status-pill.pub .tf-sp-dot {
          background: var(--teal);
          box-shadow: 0 0 0 2px rgba(26,112,112,.2);
        }

        .tf-status-pill.draft .tf-sp-label {
          color: var(--muted);
        }

        .tf-stat-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .tf-stat-key {
          font-family: 'Space Mono', monospace;
          font-size: .58rem;
          letter-spacing: .08em;
          text-transform: uppercase;
          color: var(--muted);
        }

        .tf-stat-val {
          font-family: 'Playfair Display', serif;
          font-size: 1.1rem;
          font-weight: 900;
          color: var(--ink);
        }

        .tf-stat-val.small {
          font-size: .85rem;
          font-family: 'DM Sans', sans-serif;
          font-weight: 500;
          color: var(--ink);
        }

        .tf-stat-val.dim {
          color: var(--muted);
          font-style: italic;
          font-weight: 300;
          font-size: .78rem;
          font-family: 'DM Sans', sans-serif;
        }

        .tf-action-strip {
          display: flex;
          flex-direction: column;
          gap: .55rem;
          padding-top: .55rem;
          border-top: 1px solid var(--line);
        }

        .tf-action-strip .tf-btn-teal {
          justify-content: center;
          width: 100%;
        }

        .tf-action-strip .tf-btn-outline {
          justify-content: center;
        }

        .tf-check-item {
          display: flex;
          align-items: flex-start;
          gap: .6rem;
        }

        .tf-ci-icon {
          width: 18px;
          height: 18px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          margin-top: .1rem;
        }

        .tf-ci-icon.ok {
          background: var(--teal-dim);
        }

        .tf-ci-icon.warn {
          background: var(--gold-dim);
        }

        .tf-ci-icon svg {
          width: 9px;
          height: 9px;
          stroke: currentColor;
          fill: none;
          stroke-width: 2.5;
          stroke-linecap: round;
          stroke-linejoin: round;
        }

        .tf-ci-icon.ok svg {
          stroke: var(--teal);
        }

        .tf-ci-icon.warn svg {
          stroke: var(--gold);
        }

        .tf-ci-text {
          font-size: .76rem;
          color: var(--muted);
          line-height: 1.4;
        }

        .tf-ci-text strong {
          color: var(--ink);
          font-weight: 500;
        }

        @keyframes tfFadeUp {
          from { opacity: 0; transform: translateY(18px); }
          to { opacity: 1; transform: translateY(0); }
        }

        @media (max-width: 1100px) {
          .tf-form-layout {
            grid-template-columns: 1fr;
          }
          .tf-sidebar-cards {
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

      <div className="tf-unit-page">
        <header className="tf-topbar">
          <div className="tf-tbl">
            <button onClick={() => navigate('/admin/units')} className="tf-back-link">
              <ArrowLeft className="w-3 h-3" />
              Назад к юнитам
            </button>
            <div className="tf-tbdiv"></div>
            <div className="tf-breadcrumb">
              <span>Units</span>
              <span className="sep">›</span>
              <span className="cur">Редактировать юнит</span>
            </div>
          </div>
          <div className="tf-tbr">
            <button className="tf-btn-outline" onClick={() => handleSave(false)} disabled={saving}>
              <svg viewBox="0 0 24 24"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
              Черновик
            </button>
            <button className="tf-btn-teal" onClick={() => handleSave(true)} disabled={saving}>
              <svg viewBox="0 0 24 24"><path d="M22 2L11 13"/><path d="M22 2L15 22 11 13 2 9l20-7z"/></svg>
              Опубликовать
            </button>
          </div>
        </header>

        <div className="tf-page-content">
          <div className="tf-page-header">
            <h1 className="tf-page-title">Редактировать <em>юнит</em></h1>
            <p className="tf-page-meta">
              <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              Настройте структуру юнита — как модули и лекции на Coursera/Udemy
            </p>
          </div>

          <div className="tf-form-layout">
            {/* LEFT COLUMN */}
            <div>
              {/* Card 1: Основная информация */}
              <div className="tf-form-card fc1">
                <div className="tf-card-header">
                  <div className="tf-card-title">
                    <div className="tf-card-num">1</div>
                    Основная информация
                  </div>
                </div>
                <div className="tf-card-body">
                  {/* Название */}
                  <div className="tf-field">
                    <label className="tf-field-label" htmlFor="unit-title">
                      Название <span className="tf-required-star">*</span>
                    </label>
                    <div className="tf-input-wrap">
                      <input
                        type="text"
                        id="unit-title"
                        className={`tf-field-input ${!formData.title.trim() && saving ? 'err' : ''}`}
                        placeholder="Например: знакомство (A1)"
                        maxLength={100}
                        value={formData.title}
                        onChange={(e) => handleInputChange('title', e.target.value)}
                      />
                      <span className="tf-char-counter">{formData.title.length} / 100</span>
                    </div>
                  </div>

                  {/* Уровень */}
                  <div className="tf-field">
                    <label className="tf-field-label">Уровень</label>
                    <div className="tf-level-grid">
                      <input type="radio" name="level" id="lv-a1" value="A1" className="tf-level-option" checked={formData.level === 'A1'} onChange={(e) => handleInputChange('level', e.target.value)} />
                      <label htmlFor="lv-a1" className="tf-level-label">
                        <span className="tf-level-code">A1</span>
                        <span className="tf-level-name">Начальный</span>
                      </label>

                      <input type="radio" name="level" id="lv-a2" value="A2" className="tf-level-option" checked={formData.level === 'A2'} onChange={(e) => handleInputChange('level', e.target.value)} />
                      <label htmlFor="lv-a2" className="tf-level-label">
                        <span className="tf-level-code">A2</span>
                        <span className="tf-level-name">Элементарный</span>
                      </label>

                      <input type="radio" name="level" id="lv-b1" value="B1" className="tf-level-option" checked={formData.level === 'B1'} onChange={(e) => handleInputChange('level', e.target.value)} />
                      <label htmlFor="lv-b1" className="tf-level-label">
                        <span className="tf-level-code">B1</span>
                        <span className="tf-level-name">Средний</span>
                      </label>

                      <input type="radio" name="level" id="lv-b2" value="B2" className="tf-level-option" checked={formData.level === 'B2'} onChange={(e) => handleInputChange('level', e.target.value)} />
                      <label htmlFor="lv-b2" className="tf-level-label">
                        <span className="tf-level-code">B2</span>
                        <span className="tf-level-name">Выше среднего</span>
                      </label>

                      <input type="radio" name="level" id="lv-c1" value="C1" className="tf-level-option" checked={formData.level === 'C1'} onChange={(e) => handleInputChange('level', e.target.value)} />
                      <label htmlFor="lv-c1" className="tf-level-label">
                        <span className="tf-level-code">C1</span>
                        <span className="tf-level-name">Продвинутый</span>
                      </label>

                      <input type="radio" name="level" id="lv-c2" value="C2" className="tf-level-option" checked={formData.level === 'C2'} onChange={(e) => handleInputChange('level', e.target.value)} />
                      <label htmlFor="lv-c2" className="tf-level-label">
                        <span className="tf-level-code">C2</span>
                        <span className="tf-level-name">В совершенстве</span>
                      </label>
                    </div>
                  </div>

                  {/* Курс */}
                  <div className="tf-field">
                    <label className="tf-field-label" htmlFor="unit-course">Курс</label>
                    <div className="tf-select-wrap">
                      <select
                        id="unit-course"
                        className="tf-field-input select"
                        value={formData.course_id || ''}
                        onChange={(e) => handleInputChange('course_id', e.target.value ? parseInt(e.target.value) : null)}
                      >
                        <option value="">Без курса (автономный юнит)</option>
                        {availableCourses.map((course) => (
                          <option key={course.id} value={course.id}>
                            {course.title} {course.level && `(${course.level})`}
                          </option>
                        ))}
                      </select>
                    </div>
                    <p className="tf-field-hint">Выберите курс, к которому будет принадлежать этот юнит. Если не выбран, юнит будет автономным.</p>
                    {availableCourses.length === 0 && !loadingContent && (
                      <p style={{ marginTop: '.5rem', fontSize: '.75rem', color: 'var(--rust)' }}>
                        Нет доступных курсов. <button
                          type="button"
                          onClick={() => navigate('/admin/courses/new')}
                          style={{ color: 'var(--teal)', textDecoration: 'underline', background: 'none', border: 'none', cursor: 'pointer' }}
                        >
                          Создать курс
                        </button>
                      </p>
                    )}
                  </div>

                  {/* Описание */}
                  <div className="tf-field">
                    <label className="tf-field-label" htmlFor="unit-desc">Описание</label>
                    <div className="tf-input-wrap">
                      <RichTextEditor
                        value={formData.description}
                        onChange={(value) => handleInputChange('description', value)}
                        placeholder="Опишите содержание и цели этого юнита…"
                      />
                      <span className="tf-char-counter">{formData.description.length} / 600</span>
                    </div>
                  </div>

                  {/* Learning goals */}
                  <div className="tf-field">
                    <label className="tf-field-label">Ключевые цели обучения</label>
                    <div className="tf-goals-list">
                      {learningGoals.map((goal) => (
                        <div key={goal.id} className="tf-goal-row">
                          <div className="tf-goal-bullet">
                            <Check className="w-2.5 h-2.5" />
                          </div>
                          <input
                            type="text"
                            className="tf-goal-input"
                            placeholder="Студент сможет…"
                            value={goal.text}
                            onChange={(e) => handleGoalChange(goal.id, e.target.value)}
                          />
                          <button
                            type="button"
                            className="tf-goal-del"
                            onClick={() => handleRemoveGoal(goal.id)}
                          >
                            <X className="w-2.5 h-2.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                    <button type="button" className="tf-add-goal-btn" onClick={handleAddGoal}>
                      <Plus className="w-2.5 h-2.5" />
                      Добавить цель
                    </button>
                  </div>
                </div>
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
                      value={formData.order_index === '' ? '' : formData.order_index}
                      onChange={(e) => {
                        const raw = e.target.value;
                        if (raw === '') {
                          handleInputChange('order_index', '');
                          return;
                        }
                        handleInputChange('order_index', parseInt(raw, 10));
                      }}
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
                        Дата публикации (опционально)
                      </label>
                      <input
                        type="datetime-local"
                        value={formData.publish_at}
                        onChange={(e) => handleInputChange('publish_at', e.target.value)}
                        className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                      />
                      <p className="mt-1 text-xs text-gray-500">
                        Если не указано, юнит будет опубликован сразу
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
                            onChange={(e) =>
                              handleInputChange('meta_description', e.target.value)
                            }
                            rows={3}
                            className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                            placeholder="SEO описание"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Card 2: Контент юнита */}
              <div className="tf-form-card fc2">
                <div className="tf-card-header">
                  <div className="tf-card-title">
                    <div className="tf-card-num">2</div>
                    Контент юнита
                  </div>
                  <span style={{ fontSize: '.75rem', color: 'var(--muted)' }}>Добавьте видео, задания и тесты</span>
                </div>
                <div className="tf-card-body" style={{ padding: 0, gap: 0 }}>
                  {/* Videos section */}
                  <div className="tf-content-section">
                    <div className="tf-cs-head">
                      <div className="tf-cs-icon">
                        <Video className="w-3.5 h-3.5" />
                      </div>
                      <div className="tf-cs-title-wrap">
                        <div className="tf-cs-title">Видео-уроки</div>
                        <div className="tf-cs-count">{videos.length} видео</div>
                      </div>
                      <div className="tf-cs-add-wrap" ref={el => dropdownRefs.current['video'] = el}>
                        <button className="tf-cs-add-btn" onClick={() => toggleDropdown('video')}>
                          <Plus className="w-2.5 h-2.5" />
                          Добавить существующий…
                          <svg viewBox="0 0 24 24" style={{ width: '9px', height: '9px', marginLeft: '.15rem' }}>
                            <polyline points="6 9 12 15 18 9"/>
                          </svg>
                        </button>
                        <div className={`tf-cs-dropdown ${openDropdown === 'video' ? 'open' : ''}`}>
                          {unusedVideos.length > 0 && (
                            <div className="tf-dd-section">
                              <div className="tf-dd-section-label">Существующие видео</div>
                              {unusedVideos.map(video => (
                                <div key={video.id} className="tf-dd-item" onClick={() => handleAddExistingContent('video', video.id)}>
                                  <Video className="w-3 h-3" />
                                  {video.title}
                                </div>
                              ))}
                            </div>
                          )}
                          <div className="tf-dd-section">
                            <div className="tf-dd-item create" onClick={() => navigate('/admin/videos/new')}>
                              <Plus className="w-3 h-3" />
                              Создать новый
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="tf-cs-body">
                      {videos.length === 0 ? (
                        <div className="tf-cs-empty">
                          <div className="tf-cs-empty-icon">
                            <Video className="w-4.5 h-4.5" />
                          </div>
                          <div className="tf-cs-empty-title">В этом юните нет видео</div>
                          <div className="tf-cs-empty-sub">Выберите существующий или создайте новый выше</div>
                        </div>
                      ) : (
                        videos.map((item, index) => (
                          <div key={item.id} className="tf-content-chip">
                            <div className="tf-chip-drag">
                              <GripVertical className="w-3 h-3" />
                            </div>
                            <div className="tf-chip-icon">
                              <Video className="w-3 h-3" style={{ stroke: 'var(--teal)' }} />
                            </div>
                            <div className="tf-chip-info">
                              <div className="tf-chip-name">{item.title}</div>
                              <div className="tf-chip-meta">Видео · №{index + 1}</div>
                            </div>
                            <div style={{ display: 'flex', gap: '.5rem' }}>
                              <button
                                type="button"
                                className="tf-chip-del"
                                onClick={() => navigate(`/admin/videos/${item.id}/edit`)}
                                title="Редактировать"
                              >
                                <Pencil className="w-2.5 h-2.5" />
                              </button>
                              <button
                                type="button"
                                className="tf-chip-del"
                                onClick={() => handleRemoveContent('video', item.id)}
                              >
                                <X className="w-2.5 h-2.5" />
                              </button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  {/* Tasks section */}
                  <div className="tf-content-section">
                    <div className="tf-cs-head">
                      <div className="tf-cs-icon">
                        <FileText className="w-3.5 h-3.5" />
                      </div>
                      <div className="tf-cs-title-wrap">
                        <div className="tf-cs-title">Задания</div>
                        <div className="tf-cs-count">{tasks.length} заданий</div>
                      </div>
                      <div className="tf-cs-add-wrap" ref={el => dropdownRefs.current['task'] = el}>
                        <button className="tf-cs-add-btn" onClick={() => toggleDropdown('task')}>
                          <Plus className="w-2.5 h-2.5" />
                          Добавить существующий…
                          <svg viewBox="0 0 24 24" style={{ width: '9px', height: '9px', marginLeft: '.15rem' }}>
                            <polyline points="6 9 12 15 18 9"/>
                          </svg>
                        </button>
                        <div className={`tf-cs-dropdown ${openDropdown === 'task' ? 'open' : ''}`}>
                          {unusedTasks.length > 0 && (
                            <div className="tf-dd-section">
                              <div className="tf-dd-section-label">Существующие задания</div>
                              {unusedTasks.map(task => (
                                <div key={task.id} className="tf-dd-item" onClick={() => handleAddExistingContent('task', task.id)}>
                                  <FileText className="w-3 h-3" />
                                  {task.title}
                                </div>
                              ))}
                            </div>
                          )}
                          <div className="tf-dd-section">
                            <div className="tf-dd-item create" onClick={() => navigate('/admin/tasks/new')}>
                              <Plus className="w-3 h-3" />
                              Создать новый
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="tf-cs-body">
                      {tasks.length === 0 ? (
                        <div className="tf-cs-empty">
                          <div className="tf-cs-empty-icon">
                            <FileText className="w-4.5 h-4.5" />
                          </div>
                          <div className="tf-cs-empty-title">В этом юните нет заданий</div>
                          <div className="tf-cs-empty-sub">Выберите существующий или создайте новый выше</div>
                        </div>
                      ) : (
                        tasks.map((item, index) => (
                          <div key={item.id} className="tf-content-chip">
                            <div className="tf-chip-drag">
                              <GripVertical className="w-3 h-3" />
                            </div>
                            <div className="tf-chip-icon">
                              <FileText className="w-3 h-3" style={{ stroke: 'var(--gold)' }} />
                            </div>
                            <div className="tf-chip-info">
                              <div className="tf-chip-name">{item.title}</div>
                              <div className="tf-chip-meta">Задание · №{index + 1}</div>
                            </div>
                            <div style={{ display: 'flex', gap: '.5rem' }}>
                              <button
                                type="button"
                                className="tf-chip-del"
                                onClick={() => navigate(`/admin/tasks/${item.id}/edit`)}
                                title="Редактировать"
                              >
                                <Pencil className="w-2.5 h-2.5" />
                              </button>
                              <button
                                type="button"
                                className="tf-chip-del"
                                onClick={() => handleRemoveContent('task', item.id)}
                              >
                                <X className="w-2.5 h-2.5" />
                              </button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  {/* Tests section */}
                  <div className="tf-content-section">
                    <div className="tf-cs-head">
                      <div className="tf-cs-icon">
                        <ClipboardList className="w-3.5 h-3.5" />
                      </div>
                      <div className="tf-cs-title-wrap">
                        <div className="tf-cs-title">Тесты</div>
                        <div className="tf-cs-count">{tests.length} тестов</div>
                      </div>
                      <div className="tf-cs-add-wrap" ref={el => dropdownRefs.current['test'] = el}>
                        <button className="tf-cs-add-btn" onClick={() => toggleDropdown('test')}>
                          <Plus className="w-2.5 h-2.5" />
                          Добавить существующий…
                          <svg viewBox="0 0 24 24" style={{ width: '9px', height: '9px', marginLeft: '.15rem' }}>
                            <polyline points="6 9 12 15 18 9"/>
                          </svg>
                        </button>
                        <div className={`tf-cs-dropdown ${openDropdown === 'test' ? 'open' : ''}`}>
                          {unusedTests.length > 0 && (
                            <div className="tf-dd-section">
                              <div className="tf-dd-section-label">Существующие тесты</div>
                              {unusedTests.map(test => (
                                <div key={test.id} className="tf-dd-item" onClick={() => handleAddExistingContent('test', test.id)}>
                                  <ClipboardList className="w-3 h-3" />
                                  {test.title}
                                </div>
                              ))}
                            </div>
                          )}
                          <div className="tf-dd-section">
                            <div className="tf-dd-item create" onClick={() => navigate('/admin/tests/new')}>
                              <Plus className="w-3 h-3" />
                              Создать новый
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="tf-cs-body">
                      {tests.length === 0 ? (
                        <div className="tf-cs-empty">
                          <div className="tf-cs-empty-icon">
                            <ClipboardList className="w-4.5 h-4.5" />
                          </div>
                          <div className="tf-cs-empty-title">В этом юните нет тестов</div>
                          <div className="tf-cs-empty-sub">Выберите существующий или создайте новый выше</div>
                        </div>
                      ) : (
                        tests.map((item, index) => (
                          <div key={item.id} className="tf-content-chip">
                            <div className="tf-chip-drag">
                              <GripVertical className="w-3 h-3" />
                            </div>
                            <div className="tf-chip-icon">
                              <ClipboardList className="w-3 h-3" style={{ stroke: 'var(--rust)' }} />
                            </div>
                            <div className="tf-chip-info">
                              <div className="tf-chip-name">{item.title}</div>
                              <div className="tf-chip-meta">Тест · №{index + 1}</div>
                            </div>
                            <div style={{ display: 'flex', gap: '.5rem' }}>
                              <button
                                type="button"
                                className="tf-chip-del"
                                onClick={() => navigate(`/admin/tests/${item.id}/edit`)}
                                title="Редактировать"
                              >
                                <Pencil className="w-2.5 h-2.5" />
                              </button>
                              <button
                                type="button"
                                className="tf-chip-del"
                                onClick={() => handleRemoveContent('test', item.id)}
                              >
                                <X className="w-2.5 h-2.5" />
                              </button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Advanced toggle */}
              <div className={`tf-adv-toggle ${showAdvanced ? 'open' : ''}`} onClick={() => setShowAdvanced(!showAdvanced)}>
                <span className="tf-adv-toggle-lbl">
                  <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
                  {showAdvanced ? 'Скрыть' : 'Расширенные настройки'}
                </span>
                <svg className="tf-adv-chevron" viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg>
              </div>

              <div className={`tf-adv-panel ${showAdvanced ? 'open' : ''}`}>
                {/* Sort order + Tags */}
                <div className="tf-form-card" style={{ borderTop: 'none' }}>
                  <div className="tf-card-header">
                    <div className="tf-card-title">
                      <svg viewBox="0 0 24 24"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
                      Порядок и теги
                    </div>
                  </div>
                  <div className="tf-card-body">
                    <div className="tf-field">
                      <label className="tf-field-label" htmlFor="sort-order">Порядок отображения</label>
                      <p className="tf-field-hint">Порядок отображения юнита в списке. Меньшие значения отображаются первыми.</p>
                      <div className="tf-num-wrap">
                        <input
                          type="number"
                          id="sort-order"
                          className="tf-field-input"
                          value={formData.order_index === '' ? '' : formData.order_index}
                          min="0"
                          max="9999"
                          onChange={(e) => {
                            const raw = e.target.value;
                            if (raw === '') {
                              handleInputChange('order_index', '');
                              return;
                            }
                            handleInputChange('order_index', parseInt(raw, 10));
                          }}
                        />
                        <div className="tf-num-arrows">
                          <button type="button" className="tf-num-arrow" onClick={() => stepNumber('order_index', 1)}>▲</button>
                          <button type="button" className="tf-num-arrow" onClick={() => stepNumber('order_index', -1)}>▼</button>
                        </div>
                      </div>
                    </div>
                    <div className="tf-field">
                      <label className="tf-field-label">Теги</label>
                      <div className="tf-tags-wrap">
                        {formData.tags.map((tag, index) => (
                          <span key={index} className="tf-tag-chip">
                            {tag}
                            <X className="w-2.5 h-2.5" onClick={() => handleRemoveTag(tag)} />
                          </span>
                        ))}
                      </div>
                      <div className="tf-tag-input-row">
                        <input
                          type="text"
                          className="tf-tag-input"
                          placeholder="Новый тег…"
                          value={newTag}
                          onChange={(e) => setNewTag(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddTag())}
                        />
                        <button type="button" className="tf-tag-add-btn" onClick={handleAddTag}>
                          Добавить
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Schedule + SEO */}
                <div className="tf-form-card" style={{ borderTop: 'none' }}>
                  <div className="tf-card-header">
                    <div className="tf-card-title">
                      <svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                      Публикация и SEO
                    </div>
                  </div>
                  <div className="tf-card-body">
                    <div className="tf-field">
                      <label className="tf-field-label" htmlFor="sched-pub">
                        Запланировать публикацию <span style={{ fontFamily: "'DM Sans',sans-serif", fontWeight: 300, textTransform: 'none', letterSpacing: 0, color: 'var(--muted)' }}>(опционально)</span>
                      </label>
                      <p className="tf-field-hint">Если указано, юнит будет опубликован в указанное время. Если не указано, публикация произойдет сразу.</p>
                      <input
                        type="datetime-local"
                        id="sched-pub"
                        className="tf-field-input"
                        value={formData.publish_at}
                        onChange={(e) => handleInputChange('publish_at', e.target.value)}
                      />
                    </div>

                    <div style={{ height: '1px', background: 'var(--line)', margin: '0 -.1rem' }}></div>

                    <div className="tf-field">
                      <label className="tf-field-label">SEO настройки</label>
                    </div>
                    <div className="tf-field">
                      <label className="tf-field-label" htmlFor="meta-title">Meta заголовок</label>
                      <div className="tf-input-wrap">
                        <input
                          type="text"
                          id="meta-title"
                          className="tf-field-input"
                          placeholder="SEO заголовок страницы юнита…"
                          maxLength={60}
                          value={formData.meta_title}
                          onChange={(e) => handleInputChange('meta_title', e.target.value)}
                        />
                        <span className="tf-char-counter">{formData.meta_title.length} / 60</span>
                      </div>
                      <p className="tf-field-hint">Рекомендуется до 60 символов для корректного отображения в поисковиках.</p>
                    </div>
                    <div className="tf-field">
                      <label className="tf-field-label" htmlFor="meta-desc">Meta описание</label>
                      <div className="tf-input-wrap">
                        <textarea
                          id="meta-desc"
                          className="tf-field-input"
                          placeholder="Краткое описание для поисковых систем…"
                          rows={2}
                          maxLength={160}
                          value={formData.meta_description}
                          onChange={(e) => handleInputChange('meta_description', e.target.value)}
                        />
                        <span className="tf-char-counter">{formData.meta_description.length} / 160</span>
                      </div>
                      <p className="tf-field-hint">Рекомендуется до 160 символов.</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* RIGHT SIDEBAR */}
            <div className="tf-sidebar-cards">
              {/* Summary card */}
              <div className="tf-sidebar-card sc1">
                <div className="tf-sc-header">
                  <div className="tf-sc-title">
                    <svg viewBox="0 0 24 24"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
                    Юнит
                  </div>
                </div>
                <div className="tf-sc-body">
                  <div className={`tf-status-pill ${formData.status === 'published' ? 'pub' : 'draft'}`}>
                    <span className="tf-sp-label">{formData.status === 'published' ? 'Опубликовано' : 'Черновик'}</span>
                    <div className="tf-sp-dot"></div>
                  </div>
                  <div className="tf-stat-row">
                    <span className="tf-stat-key">Название</span>
                    <span className={`tf-stat-val ${formData.title.trim() ? '' : 'dim'}`} style={formData.title.trim() ? { fontFamily: "'DM Sans',sans-serif", fontWeight: 500, fontSize: '.85rem' } : {}}>
                      {formData.title.trim() || 'Не указано'}
                    </span>
                  </div>
                  <div className="tf-stat-row">
                    <span className="tf-stat-key">Уровень</span>
                    <span className="tf-stat-val small">{formData.level}</span>
                  </div>
                  <div className="tf-stat-row">
                    <span className="tf-stat-key">Курс</span>
                    <span className={`tf-stat-val ${formData.course_id ? 'small' : 'dim'}`}>
                      {courseName}
                    </span>
                  </div>
                  <div className="tf-stat-row">
                    <span className="tf-stat-key">Видео</span>
                    <span className="tf-stat-val">{videos.length}</span>
                  </div>
                  <div className="tf-stat-row">
                    <span className="tf-stat-key">Задания</span>
                    <span className="tf-stat-val">{tasks.length}</span>
                  </div>
                  <div className="tf-stat-row">
                    <span className="tf-stat-key">Тесты</span>
                    <span className="tf-stat-val">{tests.length}</span>
                  </div>
                  <div className="tf-action-strip">
                    <button className="tf-btn-teal" onClick={() => handleSave(true)} disabled={saving}>
                      <svg viewBox="0 0 24 24"><path d="M22 2L11 13"/><path d="M22 2L15 22 11 13 2 9l20-7z"/></svg>
                      Опубликовать
                    </button>
                    <button className="tf-btn-outline" onClick={() => handleSave(false)} disabled={saving}>
                      <svg viewBox="0 0 24 24"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
                      Сохранить черновик
                    </button>
                  </div>
                </div>
              </div>

              {/* Checklist card */}
              <div className="tf-sidebar-card sc2">
                <div className="tf-sc-header">
                  <div className="tf-sc-title">
                    <svg viewBox="0 0 24 24"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
                    Чеклист
                  </div>
                </div>
                <div className="tf-sc-body">
                  {checklistItems.map((item, index) => (
                    <div key={index} className="tf-check-item">
                      <div className={`tf-ci-icon ${item.type}`}>
                        {item.type === 'ok' ? (
                          <Check className="w-2.5 h-2.5" />
                        ) : (
                          <AlertCircle className="w-2.5 h-2.5" />
                        )}
                      </div>
                      <div className="tf-ci-text">
                        <strong>{item.label}</strong><br />
                        {item.status}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
