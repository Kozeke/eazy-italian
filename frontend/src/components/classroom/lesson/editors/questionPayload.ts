/**
 * questionPayload.ts  — Phase 4
 *
 * Converts a QuestionDraft (frontend editor state) into the exact JSON payload
 * shape expected by the backend POST /tests/:id/questions endpoint.
 *
 * Import and call `draftToApiPayload(draft)` before sending to the API.
 */

import type {
    QuestionDraft,
    MultipleChoiceDraft,
    TrueFalseDraft,
    OpenAnswerDraft,
    ClozeInputDraft,
    ClozeDragDraft,
    MatchingPairsDraft,
    OrderingWordsDraft,
    OrderingSentencesDraft,
    GapDraft,
  } from './QuestionEditorRenderer';
  
  // ─── Helpers ──────────────────────────────────────────────────────────────────
  
  function parseGap(g: GapDraft) {
    return {
      id: g.id,
      answers: g.answers.split(',').map((a) => a.trim()).filter(Boolean),
      case_sensitive: g.case_sensitive,
      score: g.score,
    };
  }
  
  // ─── Main serializer ──────────────────────────────────────────────────────────
  
  export function draftToApiPayload(draft: QuestionDraft): Record<string, unknown> {
    const metadata =
      'metadata' in draft &&
      draft.metadata &&
      typeof draft.metadata === 'object'
        ? draft.metadata
        : undefined;

    const base = {
      type:        draft.type,
      prompt_rich: draft.prompt,
      points:      draft.score,
      autograde:   true,
      ...(metadata ? { metadata } : {}),
    };
  
    switch (draft.type) {
  
      case 'multiple_choice': {
        const d = draft as MultipleChoiceDraft;
        return {
          ...base,
          options: d.options.map((o) => ({ id: o.id, text: o.text })),
          correct_option_ids: d.correct_option_ids,
          shuffle_options: true,
        };
      }
  
      case 'true_false': {
        const d = draft as TrueFalseDraft;
        return {
          ...base,
          correct_option_id: d.correct_option_id,
        };
      }
  
      case 'open_answer': {
        const d = draft as OpenAnswerDraft;
        const expected =
          d.expected_mode === 'keywords'
            ? {
                mode: 'keywords',
                keywords: d.keywords
                  .filter((k) => k.text.trim())
                  .map((k) => ({ text: k.text, weight: k.weight })),
                case_insensitive: d.case_insensitive,
              }
            : {
                mode: 'regex',
                pattern: d.pattern,
                case_insensitive: d.case_insensitive,
              };
        return { ...base, expected };
      }
  
      case 'cloze_input': {
        const d = draft as ClozeInputDraft;
        return {
          ...base,
          gaps: d.gaps.map(parseGap),
        };
      }
  
      case 'cloze_drag': {
        const d = draft as ClozeDragDraft;
        return {
          ...base,
          gaps: d.gaps.map(parseGap),
          word_bank: d.word_bank.split(',').map((w) => w.trim()).filter(Boolean),
          shuffle_word_bank: d.shuffle_word_bank,
        };
      }
  
      case 'matching_pairs': {
        const d = draft as MatchingPairsDraft;
        return {
          ...base,
          left_items:   d.left_items,
          right_items:  d.right_items,
          pairs:        d.pairs,
          shuffle_right: d.shuffle_right,
        };
      }
  
      case 'ordering_words': {
        const d = draft as OrderingWordsDraft;
        return {
          ...base,
          tokens:        d.tokens,
          correct_order: d.correct_order,
          punctuation_mode: 'tokenized',
        };
      }
  
      case 'ordering_sentences': {
        const d = draft as OrderingSentencesDraft;
        return {
          ...base,
          items:         d.items,
          correct_order: d.correct_order,
        };
      }
  
      default:
        return base;
    }
  }
  
  /**
   * Validate a draft before submit — returns a list of human-readable errors.
   * Returns [] if the draft is ready to save.
   */
  export function validateDraft(draft: QuestionDraft): string[] {
    const errors: string[] = [];
  
    if (!draft.prompt.trim()) errors.push('Question prompt is required.');
  
    switch (draft.type) {
  
      case 'multiple_choice': {
        const d = draft as MultipleChoiceDraft;
        if (d.options.length < 2) errors.push('At least 2 options are required.');
        if (d.options.some((o) => !o.text.trim())) errors.push('All options must have text.');
        if (d.correct_option_ids.length === 0) errors.push('Select at least one correct option.');
        break;
      }
  
      case 'true_false': {
        const d = draft as TrueFalseDraft;
        if (!d.correct_option_id) errors.push('Select the correct answer (True or False).');
        break;
      }
  
      case 'open_answer': {
        const d = draft as OpenAnswerDraft;
        if (d.expected_mode === 'keywords') {
          if (!d.keywords.some((k) => k.text.trim())) {
            errors.push('At least one keyword is required.');
          }
        } else {
          if (!d.pattern.trim()) errors.push('A regex pattern is required.');
        }
        break;
      }
  
      case 'cloze_input':
      case 'cloze_drag': {
        const d = draft as ClozeInputDraft | ClozeDragDraft;
        if (d.gaps.length === 0) errors.push('At least one gap is required.');
        if (d.gaps.some((g) => !g.answers.trim())) {
          errors.push('Every gap must have at least one accepted answer.');
        }
        break;
      }
  
      case 'matching_pairs': {
        const d = draft as MatchingPairsDraft;
        if (d.left_items.length === 0 || d.right_items.length === 0) {
          errors.push('Both left and right items are required.');
        }
        if (d.pairs.length < d.left_items.length) {
          errors.push('Every left item must be paired with a right item.');
        }
        break;
      }
  
      case 'ordering_words': {
        const d = draft as OrderingWordsDraft;
        if (d.tokens.length < 2) errors.push('At least 2 tokens are required.');
        if (d.tokens.some((token) => !token.text.trim())) {
          errors.push('All tokens must have text.');
        }
        if (d.correct_order.length !== d.tokens.length) {
          errors.push('All tokens must be placed in the correct order.');
        }
        break;
      }
  
      case 'ordering_sentences': {
        const d = draft as OrderingSentencesDraft;
        if (d.items.length < 2) errors.push('At least 2 sentences are required.');
        if (d.correct_order.length !== d.items.length) {
          errors.push('All sentences must be placed in the correct order.');
        }
        break;
      }
    }
  
    return errors;
  }