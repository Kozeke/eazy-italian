"""
Seed subscriptions table with default subscription plans
Run this script to populate the subscriptions table
"""
from sqlalchemy import create_engine, text
from app.core.config import settings

def seed_subscriptions():
    engine = create_engine(str(settings.DATABASE_URL))
    
    with engine.connect() as conn:
        # Check if subscriptions exist
        result = conn.execute(text("SELECT COUNT(*) FROM subscriptions"))
        count = result.scalar()
        
        if count > 0:
            print(f"✓ Subscriptions table already has {count} records")
            return
        
        print("Seeding subscriptions table...")
        
        # Insert default subscriptions (matching the Subscription model)
        conn.execute(text("""
            INSERT INTO subscriptions (name, price, is_active)
            VALUES 
                ('free', 0.00, true),
                ('premium', 9.99, true),
                ('pro', 19.99, true)
            ON CONFLICT (name) DO NOTHING
        """))
        conn.commit()
        
        print("✓ Subscriptions seeded successfully")
        
        # Display created subscriptions
        result = conn.execute(text("SELECT id, name, price FROM subscriptions ORDER BY id"))
        print("\nCreated subscriptions:")
        for row in result:
            print(f"  - {row[1]}: ${row[2]}")

if __name__ == "__main__":
    seed_subscriptions()
