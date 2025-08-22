#!/usr/bin/env python3
"""
Script to create database tables
"""

from app.core.database import engine, Base
from app.models.user import User
from app.models.unit import Unit
from app.models.video import Video
from app.models.task import Task
from app.models.test import Test
from app.models.progress import Progress
from app.models.email import EmailCampaign

def create_tables():
    """Create all database tables"""
    Base.metadata.create_all(bind=engine)
    print("All tables created successfully!")

if __name__ == "__main__":
    create_tables()
