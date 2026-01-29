import { Search, Filter, ChevronDown, ChevronUp } from 'lucide-react';
import { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

interface SearchFiltersProps {
  searchQuery: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string;
  showFilters: boolean;
  onToggleFilters: () => void;
  filters?: ReactNode;
  filterButtonText?: string;
}

export default function SearchFilters({
  searchQuery,
  onSearchChange,
  searchPlaceholder,
  showFilters,
  onToggleFilters,
  filters,
  filterButtonText,
}: SearchFiltersProps) {
  const { t } = useTranslation();
  
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 md:p-5">
      <div className="flex flex-col gap-4 md:flex-row md:items-center">
        {/* Search */}
        <div className="flex-1">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder={searchPlaceholder || t('common.search') || 'Поиск...'}
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              className="block w-full rounded-lg border border-gray-300 bg-white pl-10 pr-3 py-2 text-sm leading-5 placeholder-gray-500 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            />
          </div>
        </div>

        {/* Filter toggle */}
        {filters && (
          <button
            onClick={onToggleFilters}
            className="inline-flex items-center justify-center rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
          >
            <Filter className="h-4 w-4 mr-2" />
            {filterButtonText || t('common.filters') || 'Фильтры'}
            {showFilters ? (
              <ChevronUp className="h-4 w-4 ml-1" />
            ) : (
              <ChevronDown className="h-4 w-4 ml-1" />
            )}
          </button>
        )}
      </div>

      {/* Filters panel */}
      {showFilters && filters && (
        <div className="mt-4 pt-4 border-t border-gray-200">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {filters}
          </div>
        </div>
      )}
    </div>
  );
}
