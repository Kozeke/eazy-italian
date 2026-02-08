"""
Seed subscriptions table with default subscription plans
Run this script to populate the subscriptions table
"""
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from app.core.config import settings
from app.models.subscription import Subscription, SubscriptionName
from app.core.database import Base

def seed_subscriptions():
    engine = create_engine(str(settings.DATABASE_URL))
    
    # Create tables if they don't exist
    Base.metadata.create_all(bind=engine)
    
    with Session(engine) as session:
        # Check if subscriptions exist
        count = session.query(Subscription).count()
        
        if count > 0:
            print(f"✓ Subscriptions table already has {count} records")
            existing = session.query(Subscription).all()
            print("\nExisting subscriptions:")
            for sub in existing:
                print(f"  - {sub.name.value}: ${sub.price}")
            return
        
        print("Seeding subscriptions table...")
        
        # Create default subscriptions using the model
        subscriptions = [
            Subscription(name=SubscriptionName.FREE, price=0.00, is_active=True),
            Subscription(name=SubscriptionName.PREMIUM, price=9.99, is_active=True),
            Subscription(name=SubscriptionName.PRO, price=19.99, is_active=True),
        ]
        
        session.add_all(subscriptions)
        session.commit()
        
        print("✓ Subscriptions seeded successfully")
        
        # Display created subscriptions
        created = session.query(Subscription).all()
        print("\nCreated subscriptions:")
        for sub in created:
            print(f"  - {sub.name.value}: ${sub.price}")

if __name__ == "__main__":
    seed_subscriptions()
