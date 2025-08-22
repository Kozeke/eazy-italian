
import { useTranslation } from 'react-i18next';

export default function TasksPage() {
  const { t } = useTranslation();

  return (
    <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {t('tasks.title')}
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Выполняйте задания для закрепления материала
          </p>
        </div>

        <div className="space-y-4">
          <div className="card">
            <div className="card-content">
              <h3 className="text-lg font-medium text-gray-900">
                Практика приветствий
              </h3>
              <p className="text-sm text-gray-500 mt-1">
                Напишите 5 различных способов поздороваться на итальянском языке
              </p>
              <div className="mt-4 flex items-center justify-between">
                <span className="text-sm text-gray-600">Срок: 25 августа</span>
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                  В процессе
                </span>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-content">
              <h3 className="text-lg font-medium text-gray-900">
                Перевод чисел
              </h3>
              <p className="text-sm text-gray-500 mt-1">
                Переведите следующие числа на итальянский: 5, 12, 18, 25, 30
              </p>
              <div className="mt-4 flex items-center justify-between">
                <span className="text-sm text-gray-600">Срок: 23 августа</span>
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                  Просрочено
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
  );
}
