# Courses Feature - Database Migration Guide

## Overview

The courses feature adds a new top-level container for organizing units. Each course can contain multiple units, and each unit can belong to a course.

## Database Schema

### Courses Table

The `courses` table includes the following fields:

- **id** (SERIAL PRIMARY KEY) - Unique course identifier
- **title** (VARCHAR(255)) - Course title (required)
- **description** (TEXT) - Course description
- **level** (courselevel ENUM) - Difficulty level: A1, A2, B1, B2, C1, C2, mixed
- **status** (coursestatus ENUM) - Publication status: draft, scheduled, published, archived
- **publish_at** (TIMESTAMP WITH TIME ZONE) - Scheduled publication date
- **order_index** (INTEGER) - Display order (default: 0)
- **thumbnail_url** (VARCHAR(500)) - Course cover image URL
- **duration_hours** (INTEGER) - Estimated total duration in hours
- **tags** (JSONB) - Array of course tags
- **slug** (VARCHAR(255) UNIQUE) - URL-friendly identifier
- **meta_title** (VARCHAR(255)) - SEO meta title
- **meta_description** (TEXT) - SEO meta description
- **is_visible_to_students** (BOOLEAN) - Visibility flag (default: false)
- **settings** (JSONB) - Additional course settings (enrollment, certificates, etc.)
- **created_by** (INTEGER) - Foreign key to users.id (teacher who created the course)
- **updated_by** (INTEGER) - Foreign key to users.id (teacher who last updated)
- **created_at** (TIMESTAMP WITH TIME ZONE) - Creation timestamp
- **updated_at** (TIMESTAMP WITH TIME ZONE) - Last update timestamp

### Units Table Update

The `units` table now includes:
- **course_id** (INTEGER) - Foreign key to courses.id (nullable, ON DELETE SET NULL)

## Migration Methods

### Method 1: Automatic Migration (Recommended)

The migration runs automatically when the backend starts. Simply **restart your backend service** and the migration will execute.

**For Docker:**
```bash
docker-compose restart backend
```

**For Render:**
- The migration runs automatically on deployment
- Check logs for messages like:
  - `✅ Created courses table`
  - `✅ Added course_id column to units table`

### Method 2: Manual Python Script

Run the migration script directly:

```bash
cd backend
python migrate_courses_table.py
```

### Method 3: Direct SQL Migration

If you have direct database access, run the SQL file:

```bash
psql -U postgres -d eazy_italian -f backend/create_courses_table.sql
```

Or copy and paste the SQL from `backend/create_courses_table.sql` into your database client.

## Verification

After migration, verify the tables were created:

```sql
-- Check courses table exists
SELECT table_name FROM information_schema.tables WHERE table_name = 'courses';

-- Check courses table columns
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'courses'
ORDER BY ordinal_position;

-- Check course_id in units table
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'units' AND column_name = 'course_id';

-- Check indexes
SELECT indexname, indexdef 
FROM pg_indexes 
WHERE tablename IN ('courses', 'units') 
AND indexname LIKE '%course%';
```

## Database Relationships

```
users (teachers)
  └── created_by (FK)
      └── courses
          └── id (PK)
              └── course_id (FK in units)
                  └── units
                      └── (videos, tasks, tests)
```

## Important Notes

1. **Foreign Key**: `created_by` automatically links to the authenticated teacher's user ID
2. **Cascade**: When a course is deleted, units are NOT deleted (course_id is set to NULL)
3. **Indexes**: Indexes are created on:
   - `units.course_id` (for fast queries)
   - `courses.created_by` (for filtering by teacher)
   - `courses.status` (for filtering by status)
   - `courses.level` (for filtering by level)

4. **ENUM Types**: PostgreSQL ENUM types are created:
   - `courselevel` - for course difficulty levels
   - `coursestatus` - for course publication status

## Troubleshooting

### Error: "type courselevel does not exist"

The ENUM types need to be created first. The migration script handles this automatically. If running SQL manually, make sure to create the ENUM types before creating the table.

### Error: "column units.course_id does not exist"

Run the migration to add the `course_id` column to the units table. This is handled automatically in the startup migration.

### Error: "relation courses does not exist"

The courses table hasn't been created yet. Restart the backend or run the migration script.

## Next Steps

After migration:
1. ✅ Courses table created
2. ✅ Units table updated with course_id
3. ✅ Indexes created for performance
4. ✅ Backend API endpoints ready
5. ✅ Frontend admin panel ready
6. ⏭️  Create your first course via `/admin/courses/new`
