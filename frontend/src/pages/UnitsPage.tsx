
import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Play, Clock, CheckCircle } from 'lucide-react';
import { unitsApi } from '../services/api';
import toast from 'react-hot-toast';

export default function UnitsPage() {
  const { t } = useTranslation();
  const [units, setUnits] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchUnits = async () => {
      try {
        setLoading(true);
        const response = await unitsApi.getUnits();
        // The backend returns a direct array, not a paginated response
        setUnits(Array.isArray(response) ? response : []);
      } catch (error: any) {
        console.error('Error fetching units:', error);
        toast.error('Ошибка при загрузке юнитов');
      } finally {
        setLoading(false);
      }
    };

    fetchUnits();
  }, []);

  const getLevelBadge = (level: string) => {
    const levelColors = {
      A1: 'bg-purple-100 text-purple-800',
      A2: 'bg-blue-100 text-blue-800',
      B1: 'bg-green-100 text-green-800',
      B2: 'bg-yellow-100 text-yellow-800',
      C1: 'bg-orange-100 text-orange-800',
      C2: 'bg-red-100 text-red-800'
    };
    
    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${levelColors[level as keyof typeof levelColors]}`}>
        {level}
      </span>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {t('units.title')}
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Изучайте уроки итальянского языка
          </p>
        </div>

        {units.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {units.map((unit) => (
              <Link
                key={unit.id}
                to={`/units/${unit.id}`}
                className="card hover:shadow-lg transition-shadow duration-200"
              >
                <div className="card-content">
                  <div className="flex items-start justify-between mb-3">
                    <h3 className="text-lg font-medium text-gray-900">
                      {unit.title}
                    </h3>
                    {getLevelBadge(unit.level)}
                  </div>
                  
                  {unit.description && (
                    <p className="text-sm text-gray-500 mb-4">
                      {unit.description}
                    </p>
                  )}
                  
                  <div className="flex items-center justify-between text-sm text-gray-500">
                    <div className="flex items-center space-x-4">
                      <div className="flex items-center space-x-1">
                        <Play className="h-4 w-4" />
                        <span>{unit.content_count?.videos || 0} видео</span>
                      </div>
                      <div className="flex items-center space-x-1">
                        <Clock className="h-4 w-4" />
                        <span>~{Math.max(1, unit.content_count?.videos || 0) * 10} мин</span>
                      </div>
                    </div>
                    
                    <div className="flex items-center space-x-1">
                      <CheckCircle className="h-4 w-4" />
                      <span>0%</span>
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="text-center py-12">
            <div className="mx-auto h-12 w-12 text-gray-400">
              <Play className="h-12 w-12" />
            </div>
            <h3 className="mt-2 text-sm font-medium text-gray-900">Нет доступных юнитов</h3>
            <p className="mt-1 text-sm text-gray-500">
              Пока нет опубликованных учебных юнитов.
            </p>
          </div>
        )}
      </div>
  );
}
