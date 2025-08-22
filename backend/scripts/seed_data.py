#!/usr/bin/env python3
"""
Seed data script for Eazy Italian platform
Creates demo users, units, videos, tasks, and tests
"""

import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy.orm import Session
from app.core.database import SessionLocal, engine
from app.models.user import User, UserRole
from app.models.unit import Unit, UnitLevel, UnitStatus
from app.models.video import Video, VideoSourceType, VideoStatus
from app.models.task import Task, TaskType, TaskStatus
from app.models.test import Test, TestStatus
from app.core.security import get_password_hash
from datetime import datetime, timedelta

def create_demo_data():
    db = SessionLocal()
    
    try:
        # Create demo teacher
        teacher = User(
            email="teacher@eazyitalian.com",
            first_name="Анна",
            last_name="Иванова",
            role=UserRole.TEACHER,
            password_hash=get_password_hash("password123"),
            email_verified_at=datetime.utcnow(),
            locale="ru",
            is_active=True
        )
        db.add(teacher)
        db.flush()  # Get the ID
        
        # Create demo student
        student = User(
            email="student@eazyitalian.com",
            first_name="Михаил",
            last_name="Петров",
            role=UserRole.STUDENT,
            password_hash=get_password_hash("password123"),
            email_verified_at=datetime.utcnow(),
            locale="ru",
            is_active=True
        )
        db.add(student)
        db.flush()
        
        # Create demo units
        units = [
            Unit(
                title="Приветствие и знакомство",
                level=UnitLevel.A1,
                description="Базовые фразы для знакомства и приветствия на итальянском языке",
                goals="Изучить основные приветствия, научиться представляться, освоить простые диалоги",
                tags=["приветствие", "знакомство", "базовые фразы"],
                status=UnitStatus.PUBLISHED,
                publish_at=datetime.utcnow() - timedelta(days=30),
                order_index=1,
                is_visible_to_students=True,
                slug="privetstvie-i-znakomstvo",
                meta_title="Приветствие на итальянском - Урок A1",
                meta_description="Изучите базовые фразы для знакомства и приветствия на итальянском языке",
                created_by=teacher.id
            ),
            Unit(
                title="Основы грамматики",
                level=UnitLevel.A1,
                description="Основные грамматические конструкции итальянского языка",
                goals="Понять базовую структуру предложений, изучить артикли и глаголы",
                tags=["грамматика", "артикли", "глаголы"],
                status=UnitStatus.DRAFT,
                order_index=2,
                is_visible_to_students=False,
                slug="osnovy-grammatiki",
                meta_title="Основы грамматики итальянского языка",
                meta_description="Изучите основные грамматические конструкции итальянского языка",
                created_by=teacher.id
            ),
            Unit(
                title="Повседневные фразы",
                level=UnitLevel.A2,
                description="Полезные фразы для повседневного общения",
                goals="Научиться использовать итальянский в повседневных ситуациях",
                tags=["повседневность", "общение", "фразы"],
                status=UnitStatus.SCHEDULED,
                publish_at=datetime.utcnow() + timedelta(days=7),
                order_index=3,
                is_visible_to_students=True,
                slug="povsednevnye-frazy",
                meta_title="Повседневные фразы на итальянском",
                meta_description="Полезные фразы для повседневного общения на итальянском языке",
                created_by=teacher.id
            )
        ]
        
        for unit in units:
            db.add(unit)
        db.flush()
        
        # Create demo videos
        videos = [
            Video(
                unit_id=units[0].id,
                title="Приветствие и знакомство",
                description="Видеоурок по базовым приветствиям на итальянском языке",
                source_type=VideoSourceType.URL,
                external_url="https://www.youtube.com/watch?v=dQw4w9WgXcQ",
                duration_sec=180,
                thumbnail_path="/thumbnails/video1.jpg",
                status=VideoStatus.PUBLISHED,
                publish_at=datetime.utcnow() - timedelta(days=30),
                order_index=0,
                is_visible_to_students=True,
                slug="privetstvie-video",
                created_by=teacher.id
            ),
            Video(
                unit_id=units[0].id,
                title="Базовые фразы",
                description="Основные фразы для знакомства и представления",
                source_type=VideoSourceType.URL,
                external_url="https://www.youtube.com/watch?v=dQw4w9WgXcQ",
                duration_sec=240,
                thumbnail_path="/thumbnails/video2.jpg",
                status=VideoStatus.PUBLISHED,
                publish_at=datetime.utcnow() - timedelta(days=30),
                order_index=1,
                is_visible_to_students=True,
                slug="bazovye-frazy",
                created_by=teacher.id
            ),
            Video(
                unit_id=units[2].id,
                title="Повседневные фразы",
                description="Видеоурок по повседневным фразам",
                source_type=VideoSourceType.FILE,
                file_path="/videos/everyday_phrases.mp4",
                duration_sec=300,
                thumbnail_path="/thumbnails/video3.jpg",
                status=VideoStatus.PUBLISHED,
                publish_at=datetime.utcnow() - timedelta(days=7),
                order_index=0,
                is_visible_to_students=True,
                slug="povsednevnye-frazy-video",
                created_by=teacher.id
            )
        ]
        
        for video in videos:
            db.add(video)
        db.flush()
        
        # Create demo tasks
        tasks = [
            Task(
                unit_id=units[0].id,
                title="Практика приветствий",
                description="Потренируйтесь в использовании различных приветствий",
                type=TaskType.PRACTICE,
                content="Составьте диалог приветствия между двумя людьми",
                max_score=10,
                status=TaskStatus.PUBLISHED,
                publish_at=datetime.utcnow() - timedelta(days=30),
                order_index=0,
                created_by=teacher.id
            ),
            Task(
                unit_id=units[0].id,
                title="Диалог знакомства",
                description="Создайте диалог знакомства на итальянском языке",
                type=TaskType.WRITING,
                content="Напишите диалог знакомства между двумя людьми",
                max_score=15,
                status=TaskStatus.PUBLISHED,
                publish_at=datetime.utcnow() - timedelta(days=30),
                order_index=1,
                created_by=teacher.id
            ),
            Task(
                unit_id=units[0].id,
                title="Письменное задание",
                description="Напишите короткое сочинение о себе",
                type=TaskType.WRITING,
                content="Напишите 5-7 предложений о себе на итальянском языке",
                max_score=20,
                status=TaskStatus.DRAFT,
                order_index=2,
                created_by=teacher.id
            ),
            Task(
                unit_id=units[2].id,
                title="Практика повседневных фраз",
                description="Примените изученные фразы в практических ситуациях",
                type=TaskType.PRACTICE,
                content="Создайте диалог в кафе, используя изученные фразы",
                max_score=12,
                status=TaskStatus.PUBLISHED,
                publish_at=datetime.utcnow() - timedelta(days=7),
                order_index=0,
                created_by=teacher.id
            )
        ]
        
        for task in tasks:
            db.add(task)
        db.flush()
        
        # Create demo tests
        tests = [
            Test(
                unit_id=units[0].id,
                title="Тест по приветствиям",
                description="Проверьте свои знания по теме приветствий",
                instructions="Выберите правильный вариант ответа",
                time_limit_minutes=15,
                passing_score=70,
                status=TestStatus.PUBLISHED,
                publish_at=datetime.utcnow() - timedelta(days=30),
                order_index=0,
                created_by=teacher.id
            ),
            Test(
                unit_id=units[2].id,
                title="Тест по повседневным фразам",
                description="Проверьте знание повседневных фраз",
                instructions="Выберите правильный перевод фразы",
                time_limit_minutes=20,
                passing_score=75,
                status=TestStatus.PUBLISHED,
                publish_at=datetime.utcnow() - timedelta(days=7),
                order_index=0,
                created_by=teacher.id
            )
        ]
        
        for test in tests:
            db.add(test)
        
        db.commit()
        print("Demo data created successfully!")
        print(f"Created {len(units)} units, {len(videos)} videos, {len(tasks)} tasks, {len(tests)} tests")
        print(f"Teacher: {teacher.email} / password123")
        print(f"Student: {student.email} / password123")
        
    except Exception as e:
        db.rollback()
        print(f"Error creating demo data: {e}")
        raise
    finally:
        db.close()

if __name__ == "__main__":
    create_demo_data()
