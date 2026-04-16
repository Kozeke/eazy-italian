/**
 * RoleSelection.tsx
 * Visual card picker: Teacher vs Student
 */

import { BookOpen, GraduationCap, CheckCircle2 } from 'lucide-react';

interface RoleSelectionProps {
  onSelect: (role: 'teacher' | 'student') => void;
  /** Optional: for use as a controlled picker inside a larger form */
  selected?: 'teacher' | 'student' | null;
  onChange?: (role: 'teacher' | 'student') => void;
}

const ROLES = [
  {
    id: 'teacher' as const,
    label: 'I am a Teacher',
    description: 'Create courses, manage classrooms, and track student progress.',
    icon: BookOpen,
    gradient: 'from-primary-500 to-primary-600',
    ring: 'ring-primary-400',
    bg: 'bg-primary-50',
    text: 'text-primary-700',
  },
  {
    id: 'student' as const,
    label: 'I am a Student',
    description: 'Join classrooms, complete lessons, and track your learning journey.',
    icon: GraduationCap,
    gradient: 'from-violet-500 to-violet-600',
    ring: 'ring-violet-400',
    bg: 'bg-violet-50',
    text: 'text-violet-700',
  },
];

export default function RoleSelection({ onSelect, selected, onChange }: RoleSelectionProps) {
  const isControlled = selected !== undefined;
  const current = isControlled ? selected : null;

  const handleClick = (id: 'teacher' | 'student') => {
    if (isControlled && onChange) onChange(id);
    else onSelect(id);
  };

  return (
    <div className="grid grid-cols-1 gap-3">
      {ROLES.map((role) => {
        const active = current === role.id;
        return (
          <button
            key={role.id}
            type="button"
            onClick={() => handleClick(role.id)}
            className={[
              'group relative flex items-center gap-4 rounded-2xl border-2 px-5 py-4 text-left transition-all duration-200',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
              active
                ? `border-primary-400 ${role.bg} shadow-sm ${role.ring} ring-1`
                : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm',
            ].join(' ')}
          >
            {/* Icon */}
            <div
              className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${role.gradient} text-white shadow-md transition-transform duration-200 group-hover:scale-105`}
            >
              <role.icon className="h-5 w-5" />
            </div>

            {/* Text */}
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-bold ${active ? role.text : 'text-slate-800'}`}>{role.label}</p>
              <p className="mt-0.5 text-xs text-slate-500 leading-relaxed">{role.description}</p>
            </div>

            {/* Check mark when selected */}
            {active && (
              <CheckCircle2 className="h-5 w-5 shrink-0 text-primary-500" />
            )}

            {/* Hover arrow when not selected */}
            {!active && (
              <span className="shrink-0 text-slate-300 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-slate-400">
                →
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
