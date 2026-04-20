"""
Seed subscriptions table with default subscription plans.

This script is idempotent: it creates missing plans and updates existing prices.
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
        print("Seeding subscriptions table...")

        # Stores canonical subscription price list used by teacher/student billing features.
        default_prices = {
            SubscriptionName.FREE: 0.00,
            SubscriptionName.STANDARD: 14.90,
            SubscriptionName.PRO: 65.00,
        }

        # Stores existing rows by enum name for idempotent upsert behavior.
        existing_by_name = {
            sub.name: sub
            for sub in session.query(Subscription).all()
        }

        # Creates missing plans or updates prices/active flags for existing plans.
        for plan_name, plan_price in default_prices.items():
            existing = existing_by_name.get(plan_name)
            if existing is None:
                session.add(
                    Subscription(
                        name=plan_name,
                        price=plan_price,
                        is_active=True,
                    )
                )
                continue
            existing.price = plan_price
            existing.is_active = True

        # Keeps premium rows active for backward compatibility while migrating to standard.
        legacy_premium = existing_by_name.get(SubscriptionName.PREMIUM)
        if legacy_premium is not None:
            legacy_premium.is_active = True

        session.commit()

        print("✓ Subscriptions seeded/updated successfully")

        # Display created subscriptions
        created = session.query(Subscription).all()
        print("\nCreated subscriptions:")
        for sub in created:
            print(f"  - {sub.name.value}: ${sub.price}")

if __name__ == "__main__":
    seed_subscriptions()
