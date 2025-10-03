import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import TaskForm from '../../components/admin/TaskForm';
import { Task } from '../../types';
import { tasksApi } from '../../services/api';

export default function AdminTaskEditPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [task, setTask] = useState<Task | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingTask, setIsLoadingTask] = useState(true);

  useEffect(() => {
    const loadTask = async () => {
      if (!id) return;
      
      try {
        const taskData = await tasksApi.getAdminTask(parseInt(id));
        setTask(taskData);
      } catch (error) {
        console.error('Failed to load task:', error);
        toast.error('Ошибка при загрузке задания');
        navigate('/admin/tasks');
      } finally {
        setIsLoadingTask(false);
      }
    };

    loadTask();
  }, [id, navigate]);

  const handleSave = async (taskData: Partial<Task>) => {
    if (!id) return;
    
    setIsLoading(true);
    try {
      const updatedTask = await tasksApi.updateTask(parseInt(id), taskData);
      setTask(updatedTask);
      toast.success('Задание успешно обновлено');
    } catch (error) {
      console.error('Failed to update task:', error);
      toast.error('Ошибка при обновлении задания');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancel = () => {
    navigate('/admin/tasks');
  };

  if (isLoadingTask) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Загрузка задания...</p>
        </div>
      </div>
    );
  }

  if (!task) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Задание не найдено</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <TaskForm
        task={task}
        onSave={handleSave}
        onCancel={handleCancel}
        isLoading={isLoading}
      />
    </div>
  );
}
