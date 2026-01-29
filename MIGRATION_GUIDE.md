# Database Migration Guide

## Issue: Missing `shuffle_options` Column

If you're seeing this error:
```
sqlalchemy.exc.ProgrammingError: column "shuffle_options" of relation "questions" does not exist
```

This means the database schema is missing some columns that the code expects. Follow the steps below to fix it.

## Solution: Run Migration Script

### Option 1: Automatic Migration (Recommended)

The application now automatically checks and adds missing columns on startup. Simply **redeploy your backend service on Render** and the migration will run automatically.

1. Go to [Render Dashboard](https://dashboard.render.com)
2. Select your **backend service** (eazy-italian)
3. Click **Manual Deploy** → **Deploy latest commit**
4. Wait for deployment to complete
5. Check the logs to see if migrations ran successfully

### Option 2: Manual Migration via Render Shell

If automatic migration doesn't work, you can run the migration script manually:

1. Go to your backend service on Render
2. Click on **Shell** tab (or use SSH if available)
3. Run the migration script:
   ```bash
   cd backend
   python migrate_questions_columns.py
   ```

### Option 3: Manual Migration via Local Script

If you have access to the database from your local machine:

1. Make sure `DATABASE_URL` environment variable is set to your Render database URL
2. Run the migration script:
   ```bash
   cd backend
   python migrate_questions_columns.py
   ```

### Option 4: Direct SQL Migration

If you have direct database access, you can run this SQL:

```sql
ALTER TABLE questions ADD COLUMN IF NOT EXISTS shuffle_options BOOLEAN DEFAULT FALSE;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS autograde BOOLEAN DEFAULT TRUE;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS manual_review_threshold DOUBLE PRECISION;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS expected_answer_config JSON DEFAULT '{}';
ALTER TABLE questions ADD COLUMN IF NOT EXISTS gaps_config JSON DEFAULT '[]';
ALTER TABLE questions ADD COLUMN IF NOT EXISTS question_metadata JSON DEFAULT '{}';
```

## Verification

After running the migration, verify it worked:

1. Check backend logs for messages like:
   ```
   ✅ Added missing column: questions.shuffle_options
   ```

2. Or test the API endpoint that was failing:
   ```
   POST https://eazy-italian.onrender.com/api/v1/tests/11/questions
   ```

3. The request should now succeed without the column error.

## Migration Scripts Available

- **`backend/migrate_questions_columns.py`** - Adds all missing question columns (recommended)
- **`backend/migrate_questions_shuffle_options.py`** - Adds only shuffle_options column

Both scripts are idempotent (safe to run multiple times) and will skip columns that already exist.

## Troubleshooting

### Migration script fails with "connection refused"

- Make sure `DATABASE_URL` environment variable is set correctly
- Verify the database is running and accessible
- Check that you're using the **Internal Database URL** (not External) on Render

### Migration runs but error persists

- Clear any cached database connections
- Restart the backend service
- Check that the migration actually added the columns by querying the database:
  ```sql
  SELECT column_name FROM information_schema.columns 
  WHERE table_name = 'questions' 
  AND column_name IN ('shuffle_options', 'autograde', 'manual_review_threshold');
  ```

### Need to rollback

If you need to remove a column (not recommended):
```sql
ALTER TABLE questions DROP COLUMN IF EXISTS shuffle_options;
```

## Columns Being Added

The migration adds these columns to the `questions` table:

1. **shuffle_options** (BOOLEAN) - Whether to shuffle answer options
2. **autograde** (BOOLEAN) - Whether to auto-grade the question
3. **manual_review_threshold** (DOUBLE PRECISION) - Score threshold for manual review
4. **expected_answer_config** (JSON) - Configuration for open-ended answers
5. **gaps_config** (JSON) - Configuration for cloze/fill-in-the-blank questions
6. **question_metadata** (JSON) - Additional metadata (difficulty, tags, etc.)

All columns have appropriate defaults and are nullable where appropriate.
