# ✅ Test Question Management Added!

## New Feature: Add/Remove Questions in Test Edit Page

You can now add and remove questions directly from the test edit page at `/admin/tests/:id/edit`!

## How It Works

### Adding Questions

On the **"Вопросы теста"** (Questions) tab, you'll now see two buttons:

```
Вопросы теста (2)    [Выбор ответа +]  [Открытый ответ +]
```

**Option 1: Add Multiple Choice Question**
- Click **"Выбор ответа"** (Multiple Choice)
- A new MCQ question is instantly added with:
  - Default title: "Новый вопрос с выбором ответа"
  - 3 default options (A, B, C)
  - 1 point
  - Option A selected as correct

**Option 2: Add Open Answer Question**
- Click **"Открытый ответ"** (Open Answer)
- A new open-ended question is added with:
  - Default title: "Новый открытый вопрос"
  - Keyword-based auto-grading
  - 2 points
  - Manual review threshold: 60%

### Removing Questions

Each question now has a delete button:

```
Вопрос 1  [Выбор ответа]  1 баллов  [���️]
                                        ↑
                                   Click to delete
```

- Click the **trash icon** (���️) on any question
- Confirm deletion
- Question is removed from the test immediately

## Features

### ✅ Instant Add
- No need to reload page
- Questions appear immediately
- Pre-filled with sensible defaults

### ✅ Easy Delete
- One-click deletion (with confirmation)
- Updates question count automatically
- No page reload needed

### ✅ Visual Feedback
- Success toast messages
- Question count updates in real-time
- Drag handle icon shown for reordering (future feature)

### ✅ Only for Drafts
- Buttons only appear for tests in DRAFT status
- Published tests are read-only
- Prevents accidental changes to active tests

## User Interface

### Empty State
```
╔═══════════════════════════════════════╗
║  В этом тесте пока нет вопросов       ║
║                                        ║
║  [+ Выбор ответа]  [+ Открытый ответ]║
╚═══════════════════════════════════════╝
```

### With Questions
```
Вопросы теста (2)    [+ Выбор ответа]  [+ Открытый ответ]

┌──────────────────────────────────────────────┐
│ ��� Вопрос 1  [Выбор ответа]  1 баллов  [���️] │
│ Новый вопрос с выбором ответа                │
│   ○ A. Вариант A  ✓                          │
│   ○ B. Вариант B                             │
│   ○ C. Вариант C                             │
└──────────────────────────────────────────────┘

┌──────────────────────────────────────────────┐
│ ��� Вопрос 2  [Открытый ответ]  2 балла [���️] │
│ Новый открытый вопрос                        │
└──────────────────────────────────────────────┘
```

## Implementation Details

### API Calls

**Adding MCQ Question:**
```typescript
POST /api/v1/tests/{test_id}/questions
{
  type: 'multiple_choice',
  prompt: 'Новый вопрос с выбором ответа',
  score: 1,
  options: [{id: 'A', text: 'Вариант A'}, ...],
  correct_option_ids: ['A']
}
```

**Adding Open Answer Question:**
```typescript
POST /api/v1/tests/{test_id}/questions
{
  type: 'open_answer',
  prompt: 'Новый открытый вопрос',
  score: 2,
  expected: {
    mode: 'keywords',
    keywords: [{text: 'ключевое слово', weight: 1.0}]
  }
}
```

**Removing Question:**
```typescript
DELETE /api/v1/tests/{test_id}/questions/{question_id}
```

### Default Question Templates

**Multiple Choice (MCQ):**
- Type: multiple_choice
- Points: 1
- Options: A, B, C
- Correct: A
- Auto-grade: Yes
- Shuffle options: Yes

**Open Answer:**
- Type: open_answer
- Points: 2
- Mode: Keywords
- Default keyword: "ключевое слово"
- Auto-grade: Yes
- Manual review threshold: 60%

## Usage Guide

### Quick Start

1. **Go to test edit page**: http://localhost:3000/admin/tests/1/edit
2. **Click "Вопросы теста" tab**
3. **Click "Выбор ответа"** or **"Открытый ответ"**
4. **Question is added instantly!**
5. **Edit the question** text and options as needed
6. **Delete unwanted questions** with the trash icon
7. **Click "Сохранить"** to save the test

### Example Workflow

1. Create a test with basic info
2. Go to edit page
3. Add 5 MCQ questions
4. Add 2 open answer questions
5. Edit each question's text and options
6. Remove any mistakes
7. Save test
8. Publish when ready

## Next Steps: Editing Questions

Currently, questions are added with default values. To edit them:

**Option 1: Edit in Database (Admin)**
- Use the question bank page
- Find the question by ID
- Edit its content

**Option 2: Delete and Recreate**
- Delete the question
- Add a new one with correct content
- Quick and simple

**Future Enhancement:**
- [ ] Inline editing of questions
- [ ] Drag-and-drop reordering
- [ ] Duplicate question button
- [ ] Question templates
- [ ] Import questions from bank

## Benefits

✅ **Faster Test Creation**
- Add questions with one click
- Pre-filled defaults save time
- No need to navigate away

✅ **Easy Management**
- Delete unwanted questions easily
- See all questions at a glance
- Edit test without losing context

✅ **Better UX**
- Clear visual feedback
- Intuitive button labels
- Helpful info messages

✅ **Safe Editing**
- Only works on drafts
- Published tests are protected
- Confirmation before deletion

## Limitations

⚠️ **Current Limitations:**
1. Questions added with default text (need manual editing)
2. Can't edit question content inline (future feature)
3. Can't link existing questions from question bank (coming soon)
4. No drag-and-drop reordering yet

## Workarounds

**To create detailed questions:**
1. Use the test create page (`/admin/tests/new`) which has full question builder
2. Or use the question bank page
3. Then link them to the test

**For now, this feature is best for:**
- Quick placeholder questions
- Simple MCQ questions
- Basic test structure

## Future Enhancements

- [ ] Inline question editor (edit text, options, scores)
- [ ] Question bank integration (link existing questions)
- [ ] Drag-and-drop reordering
- [ ] Question templates library
- [ ] Bulk operations (delete multiple, duplicate)
- [ ] Question preview before adding
- [ ] Import from CSV/Excel
- [ ] Copy questions between tests

## Technical Details

### Files Changed
- `frontend/src/pages/admin/AdminTestEditPage.tsx`
  - Added `addMCQQuestion()` function
  - Added `addOpenAnswerQuestion()` function
  - Added `handleRemoveQuestion()` function
  - Updated UI with add/delete buttons
  - Added drag handle icons (for future)

### New Icons Used
- `Plus` - Add buttons
- `Trash2` - Delete buttons
- `GripVertical` - Drag handle (future use)
- `ExternalLink` - External navigation (removed)

## Testing

To test the new feature:

1. **Navigate to**: http://localhost:3000/admin/tests/1/edit
2. **Click "Вопросы теста" tab**
3. **Click "Выбор ответа"** → Question should appear instantly
4. **Click "Открытый ответ"** → Another question appears
5. **Click trash icon** on a question → Confirm → Question removed
6. **Verify** question count updates
7. **Click "Сохранить"** → Test saved successfully

## Success Indicators

You know it's working when:
- ✅ Buttons appear in Questions tab
- ✅ Clicking button adds question immediately
- ✅ Question count increases
- ✅ Delete button removes question
- ✅ No page reload needed
- ✅ Success toast messages appear

## Summary

The test edit page now supports:
- ✅ Adding MCQ questions with one click
- ✅ Adding open answer questions with one click
- ✅ Deleting questions with confirmation
- ✅ Real-time updates without page reload
- ✅ Visual feedback and helpful messages

This makes test management much faster and more intuitive! ���
