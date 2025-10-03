import React, { useState, useEffect, useCallback } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { 
  Save, 
  Eye, 
  Calendar, 
  Upload, 
  Plus, 
  Trash2, 
  Clock,
  Users,
  Mail,
  FileText,
  CheckCircle,
  AlertCircle
} from 'lucide-react';
import { Task, Unit } from '../../types';
import { tasksApi, unitsApi } from '../../services/api';
import RichTextEditor from '../RichTextEditor';

interface TaskFormProps {
  task?: Task;
  onSave: (task: Partial<Task>) => void;
  onCancel: () => void;
  isLoading?: boolean;
}

interface TaskFormData {
  title: string;
  description?: string;
  instructions?: string;
  unit_id?: number;
  type: 'manual' | 'auto';
  auto_task_type?: 'single_choice' | 'multiple_choice' | 'matching' | 'ordering' | 'gap_fill' | 'short_answer' | 'numeric';
  max_score: number;
  due_at?: string;
  allow_late_submissions: boolean;
  late_penalty_percent: number;
  max_attempts?: number;
  order_index: number;
  status: 'draft' | 'scheduled' | 'published' | 'archived';
  publish_at?: string;
  
  // Assignment
  assign_to_all: boolean;
  assigned_cohorts: number[];
  assigned_students: number[];
  
  // Notifications
  send_assignment_email: boolean;
  reminder_days_before?: number;
  send_results_email: boolean;
  send_teacher_copy: boolean;
  
  // Auto-check config
  auto_check_config: Record<string, any>;
  rubric: Record<string, any>;
  attachments: string[];
}

const AUTO_TASK_TYPES = [
  { value: 'single_choice', label: 'Один правильный ответ' },
  { value: 'multiple_choice', label: 'Несколько правильных ответов' },
  { value: 'matching', label: 'Сопоставление' },
  { value: 'ordering', label: 'Упорядочивание' },
  { value: 'gap_fill', label: 'Заполнение пропусков' },
  { value: 'short_answer', label: 'Краткий ответ' },
  { value: 'numeric', label: 'Числовой ответ' }
];

export default function TaskForm({ task, onSave, onCancel, isLoading = false }: TaskFormProps) {
  const { t } = useTranslation();
  const [units, setUnits] = useState<Unit[]>([]);
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const [autoSaveStatus, setAutoSaveStatus] = useState<'saved' | 'saving' | 'error'>('saved');
  const [lastSaved, setLastSaved] = useState<Date | null>(null);

  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
    formState: { errors, isDirty },
    reset
  } = useForm<TaskFormData>({
    defaultValues: {
      title: task?.title || '',
      description: task?.description || '',
      instructions: task?.instructions || '',
      unit_id: task?.unit_id,
      type: task?.type || 'manual',
      auto_task_type: task?.auto_task_type,
      max_score: task?.max_score || 100,
      due_at: task?.due_at ? new Date(task.due_at).toISOString().slice(0, 16) : '',
      allow_late_submissions: task?.allow_late_submissions || false,
      late_penalty_percent: task?.late_penalty_percent || 0,
      max_attempts: task?.max_attempts,
      order_index: task?.order_index || 0,
      status: task?.status || 'draft',
      publish_at: task?.publish_at ? new Date(task.publish_at).toISOString().slice(0, 16) : '',
      assign_to_all: task?.assign_to_all || false,
      assigned_cohorts: task?.assigned_cohorts || [],
      assigned_students: task?.assigned_students || [],
      send_assignment_email: task?.send_assignment_email || false,
      reminder_days_before: task?.reminder_days_before,
      send_results_email: task?.send_results_email || false,
      send_teacher_copy: task?.send_teacher_copy || false,
      auto_check_config: task?.auto_check_config || {},
      rubric: task?.rubric || {},
      attachments: task?.attachments || []
    }
  });

  const watchedType = watch('type');
  const watchedAutoTaskType = watch('auto_task_type');
  const watchedStatus = watch('status');
  const watchedAssignToAll = watch('assign_to_all');

  // Load units
  useEffect(() => {
    const loadUnits = async () => {
      try {
        const unitsData = await unitsApi.getAdminUnits();
        setUnits(unitsData);
      } catch (error) {
        console.error('Failed to load units:', error);
      }
    };
    loadUnits();
  }, []);

  // Auto-save functionality
  const autoSave = useCallback(async (data: TaskFormData) => {
    if (!isDirty) return;
    
    setAutoSaveStatus('saving');
    try {
      if (task?.id) {
        await tasksApi.updateTask(task.id, data);
      } else {
        // For new tasks, we'll save when user explicitly saves
        return;
      }
      setAutoSaveStatus('saved');
      setLastSaved(new Date());
    } catch (error) {
      setAutoSaveStatus('error');
      console.error('Auto-save failed:', error);
    }
  }, [task?.id, isDirty]);

  // Auto-save on blur and every 5 seconds
  useEffect(() => {
    const subscription = watch((data) => {
      const timeoutId = setTimeout(() => autoSave(data as TaskFormData), 5000);
      return () => clearTimeout(timeoutId);
    });
    return () => subscription.unsubscribe();
  }, [watch, autoSave]);

  const onSubmit = async (data: TaskFormData) => {
    try {
      setAutoSaveStatus('saving');
      await onSave(data);
      setAutoSaveStatus('saved');
      setLastSaved(new Date());
    } catch (error) {
      setAutoSaveStatus('error');
      console.error('Save failed:', error);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 's' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleSubmit(onSubmit)();
    }
    if (e.key === 'p' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      setValue('status', 'published');
      handleSubmit(onSubmit)();
    }
  };

  const renderAutoCheckConfig = () => {
    if (watchedType !== 'auto' || !watchedAutoTaskType) return null;

    switch (watchedAutoTaskType) {
      case 'single_choice':
        return (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Варианты ответов
              </label>
              <Controller
                name="auto_check_config.options"
                control={control}
                defaultValue={['', '']}
                render={({ field }) => (
                  <div className="space-y-2">
                    {field.value.map((option: string, index: number) => (
                      <div key={index} className="flex items-center space-x-2">
                        <input
                          type="text"
                          value={option}
                          onChange={(e) => {
                            const newOptions = [...field.value];
                            newOptions[index] = e.target.value;
                            field.onChange(newOptions);
                          }}
                          className="flex-1 border border-gray-300 rounded-md px-3 py-2"
                          placeholder={`Вариант ${index + 1}`}
                        />
                        <input
                          type="radio"
                          name="correct_answer"
                          checked={field.value[index] === field.value[watch('auto_check_config.correct_answer')]}
                          onChange={() => setValue('auto_check_config.correct_answer', index)}
                          className="text-primary-600"
                        />
                        {field.value.length > 2 && (
                          <button
                            type="button"
                            onClick={() => {
                              const newOptions = field.value.filter((_, i) => i !== index);
                              field.onChange(newOptions);
                            }}
                            className="text-red-600 hover:text-red-800"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => field.onChange([...field.value, ''])}
                      className="inline-flex items-center text-sm text-primary-600 hover:text-primary-800"
                    >
                      <Plus className="w-3 h-3 mr-1" />
                      Добавить вариант
                    </button>
                  </div>
                )}
              />
            </div>
          </div>
        );

      case 'multiple_choice':
        return (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Варианты ответов
              </label>
              <Controller
                name="auto_check_config.options"
                control={control}
                defaultValue={['', '']}
                render={({ field }) => (
                  <div className="space-y-2">
                    {field.value.map((option: string, index: number) => (
                      <div key={index} className="flex items-center space-x-2">
                        <input
                          type="text"
                          value={option}
                          onChange={(e) => {
                            const newOptions = [...field.value];
                            newOptions[index] = e.target.value;
                            field.onChange(newOptions);
                          }}
                          className="flex-1 border border-gray-300 rounded-md px-3 py-2"
                          placeholder={`Вариант ${index + 1}`}
                        />
                        <input
                          type="checkbox"
                          checked={watch('auto_check_config.correct_answers')?.includes(index)}
                          onChange={(e) => {
                            const currentAnswers = watch('auto_check_config.correct_answers') || [];
                            const newAnswers = e.target.checked
                              ? [...currentAnswers, index]
                              : currentAnswers.filter(i => i !== index);
                            setValue('auto_check_config.correct_answers', newAnswers);
                          }}
                          className="text-primary-600"
                        />
                        {field.value.length > 2 && (
                          <button
                            type="button"
                            onClick={() => {
                              const newOptions = field.value.filter((_, i) => i !== index);
                              field.onChange(newOptions);
                            }}
                            className="text-red-600 hover:text-red-800"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => field.onChange([...field.value, ''])}
                      className="inline-flex items-center text-sm text-primary-600 hover:text-primary-800"
                    >
                      <Plus className="w-3 h-3 mr-1" />
                      Добавить вариант
                    </button>
                  </div>
                )}
              />
            </div>
          </div>
        );

      case 'gap_fill':
        return (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Текст с пропусками
              </label>
              <Controller
                name="auto_check_config.text"
                control={control}
                defaultValue=""
                render={({ field }) => (
                  <textarea
                    {...field}
                    rows={4}
                    className="w-full border border-gray-300 rounded-md px-3 py-2"
                    placeholder="Введите текст с пропусками в формате [[gap_1]], [[gap_2]], etc."
                  />
                )}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Допустимые ответы для пропусков
              </label>
              <Controller
                name="auto_check_config.gaps"
                control={control}
                defaultValue={[]}
                render={({ field }) => (
                  <div className="space-y-2">
                    {field.value.map((gap: any, index: number) => (
                      <div key={index} className="border border-gray-200 rounded-md p-3">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-medium">Пропуск {index + 1}</span>
                          <button
                            type="button"
                            onClick={() => {
                              const newGaps = field.value.filter((_, i) => i !== index);
                              field.onChange(newGaps);
                            }}
                            className="text-red-600 hover:text-red-800"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                        <input
                          type="text"
                          value={gap.acceptable_answers?.join(', ') || ''}
                          onChange={(e) => {
                            const answers = e.target.value.split(',').map(a => a.trim()).filter(a => a);
                            const newGaps = [...field.value];
                            newGaps[index] = { ...gap, acceptable_answers: answers };
                            field.onChange(newGaps);
                          }}
                          className="w-full border border-gray-300 rounded-md px-3 py-2"
                          placeholder="Допустимые ответы через запятую"
                        />
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => field.onChange([...field.value, { acceptable_answers: [] }])}
                      className="inline-flex items-center text-sm text-primary-600 hover:text-primary-800"
                    >
                      <Plus className="w-3 h-3 mr-1" />
                      Добавить пропуск
                    </button>
                  </div>
                )}
              />
            </div>
          </div>
        );

      default:
        return (
          <div className="text-sm text-gray-500">
            Конфигурация для этого типа задания будет добавлена позже.
          </div>
        );
    }
  };

  return (
    <div className="max-w-4xl mx-auto" onKeyDown={handleKeyDown}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {task ? 'Редактировать задание' : 'Создать задание'}
          </h1>
          <p className="text-gray-600">
            {task ? 'Внесите изменения в задание' : 'Создайте новое задание для студентов'}
          </p>
        </div>
        <div className="flex items-center space-x-4">
          {/* Auto-save status */}
          <div className="flex items-center space-x-2 text-sm">
            {autoSaveStatus === 'saving' && (
              <>
                <Clock className="w-4 h-4 text-yellow-500 animate-spin" />
                <span className="text-yellow-600">Сохранение...</span>
              </>
            )}
            {autoSaveStatus === 'saved' && lastSaved && (
              <>
                <CheckCircle className="w-4 h-4 text-green-500" />
                <span className="text-green-600">
                  Сохранено {lastSaved.toLocaleTimeString()}
                </span>
              </>
            )}
            {autoSaveStatus === 'error' && (
              <>
                <AlertCircle className="w-4 h-4 text-red-500" />
                <span className="text-red-600">Ошибка сохранения</span>
              </>
            )}
          </div>
          
          {/* Preview button */}
          <button
            type="button"
            onClick={() => setIsPreviewMode(!isPreviewMode)}
            className="inline-flex items-center px-3 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
          >
            <Eye className="w-4 h-4 mr-2" />
            {isPreviewMode ? 'Редактировать' : 'Предварительный просмотр'}
          </button>
        </div>
      </div>

      {/* Keyboard shortcuts hint */}
      <div className="bg-blue-50 border border-blue-200 rounded-md p-3 mb-6">
        <div className="flex items-center text-sm text-blue-800">
          <FileText className="w-4 h-4 mr-2" />
          <span>
            <strong>Горячие клавиши:</strong> Ctrl+S (сохранить), Ctrl+P (опубликовать)
          </span>
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
        {/* Basic Information */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-medium text-gray-900 mb-4">Основная информация</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Название *
              </label>
              <input
                type="text"
                {...register('title', { required: 'Название обязательно' })}
                className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                placeholder="Введите название задания"
              />
              {errors.title && (
                <p className="mt-1 text-sm text-red-600">{errors.title.message}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Юнит
              </label>
              <select
                {...register('unit_id')}
                className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              >
                <option value="">Без юнита</option>
                {units.map(unit => (
                  <option key={unit.id} value={unit.id}>
                    {unit.title} ({unit.level})
                  </option>
                ))}
              </select>
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Описание
              </label>
              <textarea
                {...register('description')}
                rows={3}
                className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                placeholder="Краткое описание задания"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Инструкции (rich text)
              </label>
              <Controller
                name="instructions"
                control={control}
                render={({ field }) => (
                  <RichTextEditor
                    value={field.value || ''}
                    onChange={field.onChange}
                    placeholder="Подробные инструкции для студентов"
                  />
                )}
              />
            </div>
          </div>
        </div>

        {/* Task Type and Configuration */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-medium text-gray-900 mb-4">Тип задания и настройки</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Тип задания *
              </label>
              <select
                {...register('type', { required: 'Тип задания обязателен' })}
                className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              >
                <option value="manual">Ручная проверка</option>
                <option value="auto">Авто-проверка</option>
                <option value="practice">Практика</option>
                <option value="writing">Письменная работа</option>
              </select>
              {errors.type && (
                <p className="mt-1 text-sm text-red-600">{errors.type.message}</p>
              )}
            </div>

            {watchedType === 'auto' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Тип авто-проверки *
                </label>
                <select
                  {...register('auto_task_type', { 
                    required: watchedType === 'auto' ? 'Тип авто-проверки обязателен' : false 
                  })}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                >
                  <option value="">Выберите тип</option>
                  {AUTO_TASK_TYPES.map(type => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </select>
                {errors.auto_task_type && (
                  <p className="mt-1 text-sm text-red-600">{errors.auto_task_type.message}</p>
                )}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Макс. баллов
              </label>
              <input
                type="number"
                {...register('max_score', { 
                  required: 'Максимальный балл обязателен',
                  min: { value: 1, message: 'Минимум 1 балл' },
                  max: { value: 1000, message: 'Максимум 1000 баллов' }
                })}
                className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                placeholder="100"
              />
              {errors.max_score && (
                <p className="mt-1 text-sm text-red-600">{errors.max_score.message}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Порядок в юните
              </label>
              <input
                type="number"
                {...register('order_index', { 
                  min: { value: 0, message: 'Минимум 0' }
                })}
                className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                placeholder="0"
              />
              {errors.order_index && (
                <p className="mt-1 text-sm text-red-600">{errors.order_index.message}</p>
              )}
            </div>
          </div>

          {/* Auto-check configuration */}
          {watchedType === 'auto' && (
            <div className="mt-6 pt-6 border-t border-gray-200">
              <h3 className="text-md font-medium text-gray-900 mb-4">Конфигурация авто-проверки</h3>
              {renderAutoCheckConfig()}
            </div>
          )}
        </div>

        {/* Due Date and Attempts */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-medium text-gray-900 mb-4">Сроки и попытки</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Срок сдачи
              </label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="datetime-local"
                  {...register('due_at')}
                  className="w-full pl-10 border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Максимум попыток
              </label>
              <input
                type="number"
                {...register('max_attempts', { 
                  min: { value: 1, message: 'Минимум 1 попытка' }
                })}
                className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                placeholder="Неограниченно (оставьте пустым)"
              />
              {errors.max_attempts && (
                <p className="mt-1 text-sm text-red-600">{errors.max_attempts.message}</p>
              )}
            </div>

            <div className="flex items-center space-x-4">
              <label className="flex items-center">
                <input
                  type="checkbox"
                  {...register('allow_late_submissions')}
                  className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                />
                <span className="ml-2 text-sm text-gray-700">Разрешить опоздания</span>
              </label>
            </div>

            {watch('allow_late_submissions') && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Штраф за опоздание (%)
                </label>
                <input
                  type="number"
                  {...register('late_penalty_percent', { 
                    min: { value: 0, message: 'Минимум 0%' },
                    max: { value: 100, message: 'Максимум 100%' }
                  })}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  placeholder="0"
                />
                {errors.late_penalty_percent && (
                  <p className="mt-1 text-sm text-red-600">{errors.late_penalty_percent.message}</p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Assignment Settings */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-medium text-gray-900 mb-4">Назначение</h2>
          <div className="space-y-4">
            <div className="flex items-center space-x-4">
              <label className="flex items-center">
                <input
                  type="checkbox"
                  {...register('assign_to_all')}
                  className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                />
                <span className="ml-2 text-sm text-gray-700">Назначить всем студентам</span>
              </label>
            </div>

            {!watchedAssignToAll && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Выбранные когорты
                  </label>
                  <select
                    multiple
                    {...register('assigned_cohorts')}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  >
                    <option value="">Нет доступных когорт</option>
                  </select>
                  <p className="mt-1 text-sm text-gray-500">
                    Когорты будут добавлены позже
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Выбранные студенты
                  </label>
                  <select
                    multiple
                    {...register('assigned_students')}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  >
                    <option value="">Нет доступных студентов</option>
                  </select>
                  <p className="mt-1 text-sm text-gray-500">
                    Студенты будут добавлены позже
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Notification Settings */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-medium text-gray-900 mb-4">Уведомления</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="flex items-center space-x-4">
              <label className="flex items-center">
                <input
                  type="checkbox"
                  {...register('send_assignment_email')}
                  className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                />
                <span className="ml-2 text-sm text-gray-700">Отправить email при назначении</span>
              </label>
            </div>

            <div className="flex items-center space-x-4">
              <label className="flex items-center">
                <input
                  type="checkbox"
                  {...register('send_results_email')}
                  className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                />
                <span className="ml-2 text-sm text-gray-700">Отправить результаты студенту</span>
              </label>
            </div>

            <div className="flex items-center space-x-4">
              <label className="flex items-center">
                <input
                  type="checkbox"
                  {...register('send_teacher_copy')}
                  className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                />
                <span className="ml-2 text-sm text-gray-700">Отправить копию учителю при сдаче</span>
              </label>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Напоминание за X дней
              </label>
              <input
                type="number"
                {...register('reminder_days_before', { 
                  min: { value: 1, message: 'Минимум 1 день' },
                  max: { value: 30, message: 'Максимум 30 дней' }
                })}
                className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                placeholder="Не отправлять"
              />
              {errors.reminder_days_before && (
                <p className="mt-1 text-sm text-red-600">{errors.reminder_days_before.message}</p>
              )}
            </div>
          </div>
        </div>

        {/* Status and Publishing */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-medium text-gray-900 mb-4">Статус и публикация</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Статус
              </label>
              <select
                {...register('status')}
                className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              >
                <option value="draft">Черновик</option>
                <option value="scheduled">Запланировано</option>
                <option value="published">Опубликовано</option>
                <option value="archived">Архивировано</option>
              </select>
            </div>

            {watchedStatus === 'scheduled' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Дата/время публикации
                </label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="datetime-local"
                    {...register('publish_at', { 
                      required: watchedStatus === 'scheduled' ? 'Дата публикации обязательна' : false 
                    })}
                    className="w-full pl-10 border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  />
                </div>
                {errors.publish_at && (
                  <p className="mt-1 text-sm text-red-600">{errors.publish_at.message}</p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Form Actions */}
        <div className="flex items-center justify-between pt-6 border-t border-gray-200">
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
          >
            Отмена
          </button>
          
          <div className="flex items-center space-x-4">
            <button
              type="submit"
              disabled={isLoading}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-50"
            >
              <Save className="w-4 h-4 mr-2" />
              {isLoading ? 'Сохранение...' : 'Сохранить'}
            </button>
            
            <button
              type="button"
              onClick={() => {
                setValue('status', 'published');
                handleSubmit(onSubmit)();
              }}
              disabled={isLoading}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50"
            >
              <CheckCircle className="w-4 h-4 mr-2" />
              Опубликовать
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
