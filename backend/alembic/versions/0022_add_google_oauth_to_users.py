"""
Add Google OAuth fields to users.

Revision: 0022_add_google_oauth_to_users
Down revision: 0021_fix_cache_content_type_enum

Allows password_hash to be null for Google-only accounts and stores google_id
for linking OAuth sign-in to user rows.
"""

from alembic import op
import sqlalchemy as sa

revision = "0022_add_google_oauth_to_users"
down_revision = "0021_fix_cache_content_type_enum"
branch_labels = None
depends_on = None


def upgrade() -> None:
  # Makes password optional so Google-only accounts do not need a local password hash.
  op.alter_column("users", "password_hash", existing_type=sa.String(), nullable=True)

  # Stores the Google subject id used to match returning OAuth sign-ins.
  op.add_column("users", sa.Column("google_id", sa.String(), nullable=True))
  op.create_index("ix_users_google_id", "users", ["google_id"], unique=True)


def downgrade() -> None:
  op.drop_index("ix_users_google_id", table_name="users")
  op.drop_column("users", "google_id")
  op.alter_column("users", "password_hash", existing_type=sa.String(), nullable=False)
