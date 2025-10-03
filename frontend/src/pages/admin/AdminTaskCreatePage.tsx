import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import TaskForm from '../../components/admin/TaskForm';
import { Task } from '../../types';
import { tasksApi } from '../../services/api';

export default function AdminTaskCreatePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);

  const handleSave = async (taskData: Partial<Task>) => {
    setIsLoading(true);
    try {
      const newTask = await tasksApi.createTask(taskData);
      toast.success('Задание успешно создано');
      navigate(`/admin/tasks/${newTask.id}`);
    } catch (error) {
      console.error('Failed to create task:', error);
      toast.error('Ошибка при создании задания');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancel = () => {
    navigate('/admin/tasks');
  };

  return (
    <div className="space-y-6">
      <TaskForm
        onSave={handleSave}
        onCancel={handleCancel}
        isLoading={isLoading}
      />
    </div>
  );
}
