/**
 * RoleSelection.tsx  (v2 — Student Design System)
 *
 * Visual card picker: Teacher vs Student.
 *
 * What changed from v1:
 * ─────────────────────
 * • Teal accent for the Student card (aligns with student identity vs teacher primary-blue).
 * • Selected state: richer shadow + teal/blue glow border.
 * • Icon floats with subtle scale on hover.
 * • Description text is a bit more encouraging / product-forward.
 * • Keyboard accessible: Enter/Space to select.
 * • Added role-specific feature chips below description.
 */

import React from 'react';
import { BookOpen, GraduationCap, CheckCircle2, ChevronRight } from 'lucide-react';

interface RoleSelectionProps {
  onSelect: (role: 'teacher' | 'student') => void;
  selected?: 'teacher' | 'student' | null;
  onChange?: (role: 'teacher' | 'student') => void;
}

const ROLES = [
  {
    id: 'teacher' as const,
    label: 'I am a Teacher',
    description: 'Build courses, run live sessions, and track your students.',
    icon: BookOpen,
    gradient: 'from-primary-500 to-primary-600',
    selectedBg: 'bg-primary-50',
    selectedBorder: 'border-primary-400',
    selectedText: 'text-primary-700',
    ring: 'focus-visible:ring-primary-400',
    check: 'text-primary-500',
    chips: ['Create courses', 'Live sessions', 'Grade students'],
  },
  {
    id: 'student' as const,
    label: 'I am a Student',
    description: 'Join classrooms, study at your pace, and track your progress.',
    icon: GraduationCap,
    gradient: 'from-teal-500 to-teal-600',
    selectedBg: 'bg-teal-50',
    selectedBorder: 'border-teal-400',
    selectedText: 'text-teal-700',
    ring: 'focus-visible:ring-teal-400',
    check: 'text-teal-500',
    chips: ['Interactive slides', 'Tasks & tests', 'Progress tracking'],
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
        const Icon = role.icon;
        return (
          <button
            key={role.id}
            type="button"
            onClick={() => handleClick(role.id)}
            className={[
              'group relative flex items-start gap-4 rounded-2xl border-2 px-5 py-4 text-left transition-all duration-200',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
              role.ring,
              active
                ? `${role.selectedBorder} ${role.selectedBg} shadow-md`
                : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm',
            ].join(' ')}
          >
            {/* Icon */}
            <div
              className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${role.gradient} text-white shadow-md transition-transform duration-200 group-hover:scale-105 ${active ? 'shadow-lg' : ''}`}
            >
              <Icon className="h-5 w-5" />
            </div>

            {/* Text */}
            <div className="flex-1 min-w-0 pt-0.5">
              <p className={`text-sm font-bold ${active ? role.selectedText : 'text-slate-800'}`}>
                {role.label}
              </p>
              <p className="mt-0.5 text-xs text-slate-500 leading-relaxed">{role.description}</p>

              {/* Feature chips */}
              <div className="mt-2 flex flex-wrap gap-1">
                {role.chips.map((chip) => (
                  <span
                    key={chip}
                    className={[
                      'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold transition-colors',
                      active
                        ? `${role.selectedBg} ${role.selectedText}`
                        : 'bg-slate-100 text-slate-500',
                    ].join(' ')}
                  >
                    {chip}
                  </span>
                ))}
              </div>
            </div>

            {/* Check / Arrow */}
            <div className="shrink-0 mt-1">
              {active ? (
                <CheckCircle2 className={`h-5 w-5 ${role.check}`} />
              ) : (
                <ChevronRight className="h-5 w-5 text-slate-300 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-slate-400" />
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}
