import { Search, Filter, ChevronDown, ChevronUp } from 'lucide-react';
import { ReactNode } from 'react';

interface AdminSearchFiltersProps {
  searchQuery: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string;
  showFilters: boolean;
  onToggleFilters: () => void;
  filters?: ReactNode;
}

export default function AdminSearchFilters({
  searchQuery,
  onSearchChange,
  searchPlaceholder = 'Поиск по названию или описанию',
  showFilters,
  onToggleFilters,
  filters,
}: AdminSearchFiltersProps) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-[rgba(14,14,14,0.12)] p-4 md:p-5">
      <div className="flex flex-col gap-4 md:flex-row md:items-center">
        {/* Search */}
        <div className="flex-1">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#6b6456]" />
            <input
              type="text"
              placeholder={searchPlaceholder}
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              className="block w-full rounded-lg border border-[rgba(14,14,14,0.12)] bg-white pl-10 pr-3 py-2 text-sm leading-5 placeholder-[#6b6456] shadow-sm focus:border-[#1a7070] focus:outline-none focus:ring-1 focus:ring-[#1a7070]"
            />
          </div>
        </div>

        {/* Filter toggle */}
        <button
          onClick={onToggleFilters}
          className="inline-flex items-center justify-center rounded-lg border border-[rgba(14,14,14,0.12)] bg-white px-3 py-2 text-sm font-medium text-[#0e0e0e] shadow-sm hover:bg-[#f5f0e8]"
        >
          <Filter className="h-4 w-4 mr-2" />
          Фильтры
          {showFilters ? (
            <ChevronUp className="h-4 w-4 ml-1" />
          ) : (
            <ChevronDown className="h-4 w-4 ml-1" />
          )}
        </button>
      </div>

      {/* Filters panel */}
      {showFilters && filters && (
        <div className="mt-4 pt-4 border-t border-[rgba(14,14,14,0.12)]">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {filters}
          </div>
        </div>
      )}
    </div>
  );
}
