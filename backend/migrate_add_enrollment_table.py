"""
Migration script to add course_enrollments table and subscription_type to users table
Run this script to update the database schema
"""
import sys
import os

# Add parent directory to path to import app modules
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from sqlalchemy import text
from app.core.database import engine

def migrate():
    """Add enrollment table and subscription_type column"""
    with engine.connect() as conn:
        try:
            # Create course_enrollments table
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS course_enrollments (
                    id SERIAL PRIMARY KEY,
                    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
                    UNIQUE(user_id, course_id)
                );
            """))
            
            # Create indexes
            conn.execute(text("""
                CREATE INDEX IF NOT EXISTS idx_course_enrollments_user_id 
                ON course_enrollments(user_id);
            """))
            
            conn.execute(text("""
                CREATE INDEX IF NOT EXISTS idx_course_enrollments_course_id 
                ON course_enrollments(course_id);
            """))
            
            # Check if enum type exists and what values it has
            result = conn.execute(text("""
                SELECT EXISTS (
                    SELECT 1 FROM pg_type WHERE typname = 'subscriptiontype'
                );
            """))
            enum_exists = result.scalar()
            
            if enum_exists:
                # Check enum values
                enum_values = conn.execute(text("""
                    SELECT enumlabel FROM pg_enum 
                    WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = 'subscriptiontype')
                    ORDER BY enumsortorder;
                """)).fetchall()
                enum_labels = [row[0] for row in enum_values]
                print(f"Enum exists with values: {enum_labels}")
                
                # Check if we have uppercase or lowercase values
                has_lowercase = 'free' in enum_labels or 'premium' in enum_labels
                has_uppercase = 'FREE' in enum_labels or 'PREMIUM' in enum_labels
                
                if has_uppercase and not has_lowercase:
                    # Use uppercase values
                    enum_free = 'FREE'
                    enum_premium = 'PREMIUM'
                    print("Using uppercase enum values: FREE, PREMIUM")
                elif has_lowercase:
                    # Use lowercase values
                    enum_free = 'free'
                    enum_premium = 'premium'
                    print("Using lowercase enum values: free, premium")
                else:
                    # Create new enum with lowercase
                    print("Creating new enum with lowercase values")
                    conn.execute(text("""
                        DROP TYPE IF EXISTS subscriptiontype CASCADE;
                        CREATE TYPE subscriptiontype AS ENUM ('free', 'premium');
                    """))
                    conn.commit()
                    enum_free = 'free'
                    enum_premium = 'premium'
            else:
                # Create enum type
                conn.execute(text("""
                    CREATE TYPE subscriptiontype AS ENUM ('free', 'premium');
                """))
                conn.commit()
                enum_free = 'free'
                enum_premium = 'premium'
            
            # Add subscription_type column to users table if it doesn't exist
            conn.execute(text("""
                DO $$ 
                BEGIN
                    IF NOT EXISTS (
                        SELECT 1 FROM information_schema.columns 
                        WHERE table_name = 'users' AND column_name = 'subscription_type'
                    ) THEN
                        ALTER TABLE users 
                        ADD COLUMN subscription_type subscriptiontype;
                    END IF;
                END $$;
            """))
            conn.commit()
            
            # Set default values for existing NULL rows using the correct enum value
            conn.execute(text(f"""
                UPDATE users 
                SET subscription_type = CAST(:enum_free AS subscriptiontype)
                WHERE subscription_type IS NULL;
            """), {"enum_free": enum_free})
            
            # Set NOT NULL and DEFAULT constraints
            conn.execute(text(f"""
                ALTER TABLE users 
                ALTER COLUMN subscription_type SET NOT NULL,
                ALTER COLUMN subscription_type SET DEFAULT CAST(:enum_free AS subscriptiontype);
            """), {"enum_free": enum_free})
            
            # Migrate existing enrollments from progress/tasks/tests to enrollment table
            # This creates enrollment records for users who have interacted with courses
            conn.execute(text("""
                INSERT INTO course_enrollments (user_id, course_id, created_at)
                SELECT DISTINCT 
                    p.student_id as user_id,
                    u.course_id,
                    MIN(p.started_at) as created_at
                FROM progress p
                JOIN units u ON u.id = p.unit_id
                WHERE u.course_id IS NOT NULL
                AND NOT EXISTS (
                    SELECT 1 FROM course_enrollments ce 
                    WHERE ce.user_id = p.student_id 
                    AND ce.course_id = u.course_id
                )
                GROUP BY p.student_id, u.course_id;
            """))
            
            # Also migrate from task submissions
            conn.execute(text("""
                INSERT INTO course_enrollments (user_id, course_id, created_at)
                SELECT DISTINCT 
                    ts.student_id as user_id,
                    u.course_id,
                    MIN(ts.submitted_at) as created_at
                FROM task_submissions ts
                JOIN tasks t ON t.id = ts.task_id
                JOIN units u ON u.id = t.unit_id
                WHERE u.course_id IS NOT NULL
                AND NOT EXISTS (
                    SELECT 1 FROM course_enrollments ce 
                    WHERE ce.user_id = ts.student_id 
                    AND ce.course_id = u.course_id
                )
                GROUP BY ts.student_id, u.course_id;
            """))
            
            # Also migrate from test attempts
            conn.execute(text("""
                INSERT INTO course_enrollments (user_id, course_id, created_at)
                SELECT DISTINCT 
                    ta.student_id as user_id,
                    u.course_id,
                    MIN(ta.started_at) as created_at
                FROM test_attempts ta
                JOIN tests t ON t.id = ta.test_id
                JOIN units u ON u.id = t.unit_id
                WHERE u.course_id IS NOT NULL
                AND NOT EXISTS (
                    SELECT 1 FROM course_enrollments ce 
                    WHERE ce.user_id = ta.student_id 
                    AND ce.course_id = u.course_id
                )
                GROUP BY ta.student_id, u.course_id;
            """))
            
            # Migrate subscription_type from UserSubscription table
            # Check subscription name enum values
            sub_name_result = conn.execute(text("""
                SELECT enumlabel FROM pg_enum 
                WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = 'subscriptionname')
                ORDER BY enumsortorder;
            """))
            sub_name_labels = [row[0] for row in sub_name_result.fetchall()]
            print(f"Subscription name enum values: {sub_name_labels}")
            
            # Build CASE statement based on actual enum values
            # Check for uppercase or lowercase
            has_premium_upper = 'PREMIUM' in sub_name_labels
            has_premium_lower = 'premium' in sub_name_labels
            has_pro_upper = 'PRO' in sub_name_labels
            has_pro_lower = 'pro' in sub_name_labels
            
            premium_conditions = []
            if has_premium_upper:
                premium_conditions.append("s.name = 'PREMIUM'")
            if has_premium_lower:
                premium_conditions.append("s.name = 'premium'")
            if has_pro_upper:
                premium_conditions.append("s.name = 'PRO'")
            if has_pro_lower:
                premium_conditions.append("s.name = 'pro'")
            
            if premium_conditions:
                when_clause = " OR ".join(premium_conditions)
                conn.execute(text(f"""
                    UPDATE users u
                    SET subscription_type = CASE 
                        WHEN {when_clause} THEN CAST(:enum_premium AS subscriptiontype)
                        ELSE CAST(:enum_free AS subscriptiontype)
                    END
                    FROM user_subscriptions us
                    JOIN subscriptions s ON s.id = us.subscription_id
                    WHERE u.id = us.user_id
                    AND us.is_active = true
                    AND u.subscription_type = CAST(:enum_free AS subscriptiontype);
                """), {"enum_free": enum_free, "enum_premium": enum_premium})
            else:
                print("Warning: Could not find premium/pro subscription names. Skipping subscription migration.")
            
            conn.commit()
            print("Migration completed successfully!")
            print("  - Created course_enrollments table")
            print("  - Added subscription_type column to users")
            print("  - Migrated existing enrollments")
            print("  - Migrated subscription types")
            
        except Exception as e:
            conn.rollback()
            print(f"Migration failed: {e}")
            raise

if __name__ == "__main__":
    migrate()
