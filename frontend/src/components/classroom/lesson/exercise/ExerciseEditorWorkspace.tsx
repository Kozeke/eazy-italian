/**
 * ExerciseEditorWorkspace.tsx — LinguAI v2 (Slide-mode refactor)
 *
 * NEW in this version:
 * ─────────────────────
 * • slideMode: when location.state.slideMode === true the workspace behaves
 *   like a "blank slide" canvas. The header placeholder changes to
 *   "Untitled slide…" and questions are optional.
 *
 * • onPickMedia: when a teacher picks Image / Video / Audio from the
 *   TypePickerPopover, a MediaBlock is added to the canvas above the
 *   question editor.
 *
 * • MediaBlockCard: inline card for entering URL / uploading file,
 *   with a live preview. Blocks are passed back to LessonWorkspace
 *   via exerciseImportForTest.mediaBlocks on save.
 *
 * Everything else (validation, save flow, Ctrl+S, error banner) is
 * unchanged from v2.
 *
 * mode="standalone"  → 100dvh, full-screen route (/admin/exercises/new)
 * mode="embedded"    → flex child inside parent
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import ExerciseHeader, { EXERCISE_HEADER_HEIGHT_PX } from './ExerciseHeader';
import ExerciseEditorPlayer from './ExerciseEditorPlayer';
import type { QuestionDraft } from '../editors/QuestionEditorRenderer';
import { Image, Video, Music, X, Upload } from 'lucide-react';

// ─── Media block types ────────────────────────────────────────────────────────

export type MediaBlockType = 'image' | 'video' | 'audio';

export interface MediaBlock {
  id: string;
  kind: 'media';
  mediaType: MediaBlockType;
  url: string;
  caption: string;
}

// ─── Payload helpers ──────────────────────────────────────────────────────────

function draftToApiPayload(draft: QuestionDraft): Record<string, unknown> {
  const { type, prompt, ...rest } = draft as QuestionDraft & Record<string, unknown>;
  return { type, prompt, ...rest };
}

function validateDraft(draft: QuestionDraft): string[] {
  const errors: string[] = [];
  if (!draft.prompt.trim()) errors.push('Question prompt is required.');
  if (draft.type === 'multiple_choice') {
    if (draft.options.length < 2) errors.push('At least 2 options required.');
    if (draft.correct_option_ids.length === 0) errors.push('Mark at least one correct answer.');
    if (draft.options.some(o => !o.text.trim())) errors.push('All options must have text.');
  }
  if (draft.type === 'true_false' && !draft.correct_option_id)
    errors.push('Select True or False as the correct answer.');
  if (draft.type === 'open_answer') {
    if (draft.expected_mode === 'keywords' && draft.keywords.every(k => !k.text.trim()))
      errors.push('Add at least one keyword for grading.');
    if (draft.expected_mode === 'regex' && !draft.pattern.trim())
      errors.push('Enter a regex pattern for grading.');
  }
  if (draft.type === 'cloze_input' || draft.type === 'cloze_drag') {
    if (draft.gaps.some(g => !g.answers.trim()))
      errors.push('All gaps must have at least one accepted answer.');
  }
  if (draft.type === 'matching_pairs') {
    if (draft.left_items.some(i => !i.text.trim()) || draft.right_items.some(i => !i.text.trim()))
      errors.push('All matching items must have text.');
    if (draft.pairs.length < draft.left_items.length)
      errors.push('Connect all left items to a right item.');
  }
  if (draft.type === 'ordering_words' || draft.type === 'ordering_sentences') {
    const items = draft.type === 'ordering_words' ? draft.tokens : draft.items;
    if (items.some(t => !t.text.trim())) errors.push('All items must have text.');
    if (draft.correct_order.length < items.length) errors.push('Set the correct order for all items.');
  }
  return errors;
}

// ─── Design tokens ─────────────────────────────────────────────────────────────

const T = {
  primary:    '#6C6FEF',
  primaryDk:  '#4F52C2',
  tint:       '#EEF0FE',
  tintDeep:   '#DDE1FC',
  bg:         '#F7F7FA',
  white:      '#FFFFFF',
  border:     '#E8EAFD',
  borderSoft: '#F1F2FA',
  text:       '#1C1F3A',
  sub:        '#6B6F8E',
  muted:      '#A8ABCA',
};

const MEDIA_META: Record<MediaBlockType, {
  label: string; color: string; bg: string; border: string;
  icon: React.ReactNode; placeholder: string;
}> = {
  image: {
    label: 'Image', color: '#0891b2', bg: '#ecfeff', border: '#a5f3fc',
    icon: <Image size={20} strokeWidth={1.7} />,
    placeholder: 'Paste an image URL or click upload →',
  },
  video: {
    label: 'Video', color: '#7c3aed', bg: '#f5f3ff', border: '#c4b5fd',
    icon: <Video size={20} strokeWidth={1.7} />,
    placeholder: 'Paste a YouTube or Vimeo URL',
  },
  audio: {
    label: 'Audio', color: '#0d9488', bg: '#f0fdfa', border: '#5eead4',
    icon: <Music size={20} strokeWidth={1.7} />,
    placeholder: 'Paste an audio file URL',
  },
};

// ─── Props ────────────────────────────────────────────────────────────────────

export interface ExerciseEditorWorkspaceProps {
  initialTitle?: string;
  /** Template label from the gallery — improves header help tooltip (“exercise type”). */
  headerLabel?: string;
  initialQuestions?: QuestionDraft[];
  initialMediaBlocks?: MediaBlock[];
  mode?: 'standalone' | 'embedded';
  onCancel?: () => void;
  /** Cog in header: return to ExerciseDraftsPage gallery when embedded there. */
  onSettingsClick?: () => void;
  onSave?: (
    title: string,
    payloads: Record<string, unknown>[],
    drafts: QuestionDraft[],
  ) => Promise<void> | void;
}

function makeId() {
  return Math.random().toString(36).slice(2, 10);
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ExerciseEditorWorkspace({
  initialTitle = '',
  headerLabel,
  initialQuestions,
  initialMediaBlocks,
  mode = 'standalone',
  onCancel,
  onSettingsClick,
  onSave,
}: ExerciseEditorWorkspaceProps) {
  const navigate = useNavigate();
  const location = useLocation();

  const routeState  = location.state as { returnTo?: string; slideMode?: boolean } | null;
  const isSlideMode = routeState?.slideMode === true;

  const [title, setTitle]         = useState(initialTitle);
  const [questions, setQuestions] = useState<QuestionDraft[]>(
    initialQuestions && initialQuestions.length > 0 ? initialQuestions : [],
  );
  const [mediaBlocks, setMediaBlocks] = useState<MediaBlock[]>(initialMediaBlocks ?? []);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isSaving, setIsSaving]       = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError]     = useState<string | null>(null);
  const [isDirty, setIsDirty]         = useState(false);
  const successTimer                  = useRef<ReturnType<typeof setTimeout>>();

  const handleQuestionsChange = useCallback((q: QuestionDraft[]) => {
    setQuestions(q);
    setIsDirty(true);
    setSaveSuccess(false);
  }, []);

  const handleTitleChange = useCallback((t: string) => {
    setTitle(t);
    setIsDirty(true);
    setSaveSuccess(false);
  }, []);

  const handleCancel = useCallback(() => {
    if (onCancel) onCancel();
    else navigate(-1);
  }, [onCancel, navigate]);

  const handlePickMedia = useCallback((type: MediaBlockType) => {
    setMediaBlocks(prev => [...prev, {
      id: makeId(), kind: 'media', mediaType: type, url: '', caption: '',
    }]);
    setIsDirty(true);
    setSaveSuccess(false);
  }, []);

  const handleMediaBlockChange = useCallback((id: string, patch: Partial<MediaBlock>) => {
    setMediaBlocks(prev => prev.map(b => b.id === id ? { ...b, ...patch } : b));
    setIsDirty(true);
  }, []);

  const handleRemoveMediaBlock = useCallback((id: string) => {
    setMediaBlocks(prev => prev.filter(b => b.id !== id));
    setIsDirty(true);
  }, []);

  const handleSave = useCallback(async () => {
    if (isSaving) return;

    // In slide mode, questions are optional — skip validation if none added
    const allErrors = (isSlideMode && questions.length === 0) ? [] : questions.flatMap((q, i) =>
      validateDraft(q).map(e => `Q${i + 1}: ${e}`),
    );
    if (allErrors.length > 0) { setSaveError(allErrors[0]); return; }

    setSaveError(null);
    const payloads = questions.map(draftToApiPayload);
    setIsSaving(true);

    try {
      if (onSave) {
        await onSave(title, payloads, questions);
        setIsDirty(false);
        setSaveSuccess(true);
        clearTimeout(successTimer.current);
        successTimer.current = setTimeout(() => setSaveSuccess(false), 2500);
      } else {
        const returnTo = routeState?.returnTo;
        setIsDirty(false);
        setSaveSuccess(true);
        await new Promise<void>(r => { setTimeout(r, 400); });
        if (returnTo) {
          navigate(returnTo, {
            state: {
              exerciseImportForTest: {
                title:  title.trim() || (isSlideMode ? 'Untitled slide' : 'Untitled exercise'),
                drafts: questions,
                mediaBlocks,
              },
            },
          });
        } else {
          navigate(-1);
        }
      }
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Save failed. Please try again.');
    } finally {
      setIsSaving(false);
    }
  }, [isSaving, isSlideMode, questions, title, mediaBlocks, onSave, routeState, navigate]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') { e.preventDefault(); handleSave(); }
    };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [handleSave]);

  useEffect(() => () => { clearTimeout(successTimer.current); }, []);

  // ── Shell ──────────────────────────────────────────────────────────────────

  const shell = (
    <div style={{ position: 'relative', flex: 1, background: T.bg }}>
      {/* Fixed header */}
      <ExerciseHeader
        title={title}
        headerLabel={headerLabel}
        isDirty={isDirty}
        isSaveSuccess={saveSuccess}
        onSettingsClick={onSettingsClick}
        onClose={handleCancel}
        onTitleChange={handleTitleChange}
      />

      {/* Error banner */}
      {saveError && (
        <div style={{
          position: 'fixed',
          top: EXERCISE_HEADER_HEIGHT_PX + 8,
          left: '50%', transform: 'translateX(-50%)',
          zIndex: 110,
          maxWidth: 560, width: 'calc(100% - 48px)',
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '10px 14px', borderRadius: 10,
          background: '#fff5f5', border: '1px solid #fecaca',
          color: '#c03030', fontSize: 13, fontWeight: 500,
          boxShadow: '0 4px 16px rgba(224,60,60,0.10)',
        }}>
          <svg width="14" height="14" viewBox="0 0 15 15" fill="none" style={{ flexShrink: 0 }}>
            <circle cx="7.5" cy="7.5" r="7" stroke="currentColor" strokeWidth="1.5"/>
            <path d="M7.5 4v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            <circle cx="7.5" cy="10.5" r="0.75" fill="currentColor"/>
          </svg>
          <span style={{ flex: 1 }}>{saveError}</span>
          <button onClick={() => setSaveError(null)} style={{
            background: 'none', border: 'none', color: '#c03030',
            cursor: 'pointer', fontSize: 17, lineHeight: 1,
            padding: '2px 4px', borderRadius: 4, fontFamily: 'inherit',
          }}>×</button>
        </div>
      )}

      {/* Slide mode: white-page header badge */}
      {isSlideMode && (
        <div style={{
          position: 'fixed',
          top: EXERCISE_HEADER_HEIGHT_PX,
          left: 0, right: 0,
          zIndex: 4,
          background: T.white,
          borderBottom: `1px solid ${T.borderSoft}`,
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '8px 24px',
          fontFamily: 'inherit',
        }}>
          <span style={{
            display: 'flex', alignItems: 'center', gap: 5,
            fontSize: 11, fontWeight: 700, letterSpacing: '0.07em',
            textTransform: 'uppercase', color: T.primary,
          }}>
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
              <rect x="2" y="1.5" width="12" height="13" rx="2" fill={T.tint} stroke={T.primary} strokeWidth="1.4"/>
              <path d="M5 6h6M5 8.5h6M5 11h4" stroke={T.primary} strokeWidth="1.1" strokeLinecap="round"/>
            </svg>
            Blank slide canvas
          </span>
          <span style={{ fontSize: 11, color: T.muted }}>
            — add media blocks and exercises below
          </span>
        </div>
      )}

      {/* Exercise player with media block support */}
      <ExerciseEditorPlayer
        questions={questions}
        activeIndex={activeIndex}
        isSaving={isSaving}
        onQuestionsChange={handleQuestionsChange}
        onActiveIndexChange={setActiveIndex}
        onSave={handleSave}
        onCancel={handleCancel}
        onPickMedia={handlePickMedia}
        isSlideMode={isSlideMode}
        slideBannerHeight={isSlideMode ? 37 : 0}
        mediaBlocks={mediaBlocks}
        onMediaBlockChange={handleMediaBlockChange}
        onRemoveMediaBlock={handleRemoveMediaBlock}
      />
    </div>
  );

  if (mode === 'standalone') {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column',
        height: '100dvh', overflow: 'hidden', background: T.bg,
      }}>
        {shell}
      </div>
    );
  }
  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      flex: 1, overflow: 'hidden', background: T.bg,
    }}>
      {shell}
    </div>
  );
}

// ─── MediaBlockCard ───────────────────────────────────────────────────────────

export function MediaBlockCard({
  block, onChange, onRemove,
}: {
  block: MediaBlock;
  onChange: (patch: Partial<MediaBlock>) => void;
  onRemove: () => void;
}) {
  const meta = MEDIA_META[block.mediaType];
  const [urlFocused, setUrlFocused] = useState(false);

  return (
    <div style={{
      background: T.white, borderRadius: 14,
      border: `1.5px solid ${T.border}`,
      boxShadow: '0 2px 10px rgba(108,111,239,0.05)',
      overflow: 'hidden',
      animation: 'mbSlideIn 200ms cubic-bezier(0.22,1,0.36,1) both',
    }}>
      {/* Header strip */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '11px 16px',
        background: meta.bg, borderBottom: `1px solid ${meta.border}`,
      }}>
        <span style={{
          width: 30, height: 30, borderRadius: 8,
          background: T.white, border: `1.5px solid ${meta.border}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: meta.color, flexShrink: 0,
        }}>
          {meta.icon}
        </span>
        <span style={{ flex: 1, fontSize: 13, fontWeight: 700, color: meta.color, letterSpacing: '-0.01em' }}>
          {meta.label}
        </span>
        <button
          onClick={onRemove}
          title="Remove block"
          style={{
            background: 'none', border: 'none', color: meta.color,
            opacity: 0.55, cursor: 'pointer', padding: 4, borderRadius: 6,
            display: 'flex', alignItems: 'center',
            transition: 'opacity 120ms ease',
          }}
          onMouseEnter={e => ((e.currentTarget as HTMLButtonElement).style.opacity = '1')}
          onMouseLeave={e => ((e.currentTarget as HTMLButtonElement).style.opacity = '0.55')}
        >
          <X size={14} strokeWidth={2} />
        </button>
      </div>

      {/* Body */}
      <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {/* URL row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            type="url"
            value={block.url}
            onChange={e => onChange({ url: e.target.value })}
            onFocus={() => setUrlFocused(true)}
            onBlur={() => setUrlFocused(false)}
            placeholder={meta.placeholder}
            style={{
              flex: 1, height: 38, borderRadius: 9,
              border: `1.5px solid ${urlFocused ? meta.border : T.border}`,
              background: urlFocused ? meta.bg : T.bg,
              padding: '0 12px', fontSize: 13, color: T.text,
              outline: 'none', fontFamily: 'inherit',
              transition: 'border-color 120ms ease, background 120ms ease',
            }}
          />
          {block.mediaType === 'image' && (
            <UploadButton onUpload={url => onChange({ url })} />
          )}
        </div>

        {/* Preview */}
        {block.url.trim() && <MediaPreview block={block} />}

        {/* Caption */}
        <input
          type="text"
          value={block.caption}
          onChange={e => onChange({ caption: e.target.value })}
          placeholder="Caption (optional)"
          style={{
            height: 34, borderRadius: 9,
            border: `1.5px solid ${T.border}`, background: T.bg,
            padding: '0 12px', fontSize: 12, color: T.sub,
            outline: 'none', fontFamily: 'inherit',
          }}
        />
      </div>

      <style>{`
        @keyframes mbSlideIn {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

// ─── MediaPreview ─────────────────────────────────────────────────────────────

function MediaPreview({ block }: { block: MediaBlock }) {
  if (block.mediaType === 'image') {
    return (
      <div style={{
        borderRadius: 10, overflow: 'hidden',
        border: `1px solid ${T.border}`,
        maxHeight: 240,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: T.bg,
      }}>
        <img
          src={block.url}
          alt={block.caption || 'Image preview'}
          style={{ maxWidth: '100%', maxHeight: 240, objectFit: 'contain', display: 'block' }}
          onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
        />
      </div>
    );
  }
  if (block.mediaType === 'video') {
    const ytMatch = block.url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([a-zA-Z0-9_-]{11})/);
    if (ytMatch) {
      return (
        <div style={{ borderRadius: 10, overflow: 'hidden', aspectRatio: '16/9', background: '#000' }}>
          <iframe
            src={`https://www.youtube.com/embed/${ytMatch[1]}`}
            style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            title="Video preview"
          />
        </div>
      );
    }
    return (
      <div style={{
        borderRadius: 9, padding: '9px 13px',
        background: '#f5f3ff', border: '1px solid #c4b5fd',
        fontSize: 12, color: '#7c3aed',
      }}>
        Preview available after saving.
      </div>
    );
  }
  if (block.mediaType === 'audio') {
    return <audio src={block.url} controls style={{ width: '100%', borderRadius: 8 }} />;
  }
  return null;
}

// ─── UploadButton ─────────────────────────────────────────────────────────────

function UploadButton({ onUpload }: { onUpload: (url: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [hov, setHov] = useState(false);
  return (
    <>
      <input
        ref={inputRef} type="file" accept="image/*"
        onChange={e => {
          const f = e.target.files?.[0];
          if (f) onUpload(URL.createObjectURL(f));
        }}
        style={{ display: 'none' }}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onMouseEnter={() => setHov(true)}
        onMouseLeave={() => setHov(false)}
        title="Upload image"
        style={{
          height: 38, width: 38, borderRadius: 9, flexShrink: 0,
          border: `1.5px solid ${hov ? '#a5f3fc' : T.border}`,
          background: hov ? '#ecfeff' : T.bg,
          color: hov ? '#0891b2' : T.muted,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', transition: 'all 120ms ease',
        }}
      >
        <Upload size={15} strokeWidth={2} />
      </button>
    </>
  );
}