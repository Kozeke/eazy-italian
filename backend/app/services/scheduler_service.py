from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime, timedelta
from app.core.database import get_db
from app.models.email import EmailCampaign, EmailStatus, CampaignStatus
from app.models.task import Task, TaskStatus
from app.services.email_service import EmailService
import logging
import asyncio
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.date import DateTrigger

logger = logging.getLogger(__name__)

class SchedulerService:
    def __init__(self):
        self.scheduler = AsyncIOScheduler()
        self.scheduler.start()
    
    def schedule_email_campaign(self, campaign: EmailCampaign) -> bool:
        """Schedule an email campaign for future sending"""
        try:
            if not campaign.schedule_at:
                return False
            
            # Schedule the job
            job_id = f"email_campaign_{campaign.id}"
            self.scheduler.add_job(
                func=self._send_scheduled_campaign,
                trigger=DateTrigger(run_date=campaign.schedule_at),
                args=[campaign.id],
                id=job_id,
                replace_existing=True
            )
            
            logger.info(f"Scheduled email campaign {campaign.id} for {campaign.schedule_at}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to schedule email campaign {campaign.id}: {str(e)}")
            return False
    
    def schedule_task_reminder(self, task: Task, reminder_offset: str) -> bool:
        """Schedule a reminder for a task"""
        try:
            if not task.due_at:
                return False
            
            # Calculate reminder time
            if "days" in reminder_offset:
                days = int(reminder_offset.split()[0])
                reminder_time = task.due_at - timedelta(days=days)
            elif "hours" in reminder_offset:
                hours = int(reminder_offset.split()[0])
                reminder_time = task.due_at - timedelta(hours=hours)
            else:
                return False
            
            # Schedule the job
            job_id = f"task_reminder_{task.id}_{reminder_offset}"
            self.scheduler.add_job(
                func=self._send_task_reminder,
                trigger=DateTrigger(run_date=reminder_time),
                args=[task.id, reminder_offset],
                id=job_id,
                replace_existing=True
            )
            
            logger.info(f"Scheduled task reminder for task {task.id} at {reminder_time}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to schedule task reminder for task {task.id}: {str(e)}")
            return False
    
    def schedule_task_publication(self, task: Task, publish_at: datetime) -> bool:
        """Schedule a task for future publication"""
        try:
            job_id = f"task_publication_{task.id}"
            self.scheduler.add_job(
                func=self._publish_scheduled_task,
                trigger=DateTrigger(run_date=publish_at),
                args=[task.id],
                id=job_id,
                replace_existing=True
            )
            
            logger.info(f"Scheduled task publication for task {task.id} at {publish_at}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to schedule task publication for task {task.id}: {str(e)}")
            return False
    
    async def _send_scheduled_campaign(self, campaign_id: int):
        """Send a scheduled email campaign"""
        try:
            db = next(get_db())
            campaign = db.query(EmailCampaign).filter(EmailCampaign.id == campaign_id).first()
            
            if not campaign or campaign.status != CampaignStatus.SCHEDULED:
                return
            
            # Update campaign status
            campaign.status = CampaignStatus.SENT
            db.commit()
            
            # Send emails (this would be implemented based on your email service)
            logger.info(f"Sent scheduled email campaign {campaign_id}")
            
        except Exception as e:
            logger.error(f"Failed to send scheduled campaign {campaign_id}: {str(e)}")
        finally:
            db.close()
    
    async def _send_task_reminder(self, task_id: int, reminder_offset: str):
        """Send a scheduled task reminder"""
        try:
            db = next(get_db())
            task = db.query(Task).filter(Task.id == task_id).first()
            
            if not task or task.status != TaskStatus.PUBLISHED:
                return
            
            # Get assigned students
            student_ids = []
            if task.assign_to_all:
                from app.models.user import User
                students = db.query(User).filter(User.role == "student").all()
                student_ids = [s.id for s in students]
            else:
                student_ids = task.assigned_students or []
            
            if student_ids:
                email_service = EmailService(db)
                email_service.send_task_reminder(task, student_ids)
                logger.info(f"Sent task reminder for task {task_id} to {len(student_ids)} students")
            
        except Exception as e:
            logger.error(f"Failed to send task reminder for task {task_id}: {str(e)}")
        finally:
            db.close()
    
    async def _publish_scheduled_task(self, task_id: int):
        """Publish a scheduled task"""
        try:
            db = next(get_db())
            task = db.query(Task).filter(Task.id == task_id).first()
            
            if not task or task.status != TaskStatus.SCHEDULED:
                return
            
            # Publish the task
            task.status = TaskStatus.PUBLISHED
            task.publish_at = datetime.utcnow()
            db.commit()
            
            # Send notification if enabled
            if task.send_assignment_email:
                student_ids = task.assigned_students or []
                if task.assign_to_all:
                    from app.models.user import User
                    students = db.query(User).filter(User.role == "student").all()
                    student_ids = [s.id for s in students]
                
                if student_ids:
                    email_service = EmailService(db)
                    email_service.send_task_assignment_notification(task, student_ids)
            
            logger.info(f"Published scheduled task {task_id}")
            
        except Exception as e:
            logger.error(f"Failed to publish scheduled task {task_id}: {str(e)}")
        finally:
            db.close()
    
    def remove_job(self, job_id: str) -> bool:
        """Remove a scheduled job"""
        try:
            self.scheduler.remove_job(job_id)
            logger.info(f"Removed scheduled job {job_id}")
            return True
        except Exception as e:
            logger.error(f"Failed to remove job {job_id}: {str(e)}")
            return False
    
    def get_job(self, job_id: str):
        """Get a scheduled job"""
        try:
            return self.scheduler.get_job(job_id)
        except Exception as e:
            logger.error(f"Failed to get job {job_id}: {str(e)}")
            return None
    
    def get_all_jobs(self):
        """Get all scheduled jobs"""
        try:
            return self.scheduler.get_jobs()
        except Exception as e:
            logger.error(f"Failed to get all jobs: {str(e)}")
            return []
    
    def shutdown(self):
        """Shutdown the scheduler"""
        try:
            self.scheduler.shutdown()
            logger.info("Scheduler shutdown complete")
        except Exception as e:
            logger.error(f"Failed to shutdown scheduler: {str(e)}")

# Global scheduler instance
scheduler_service = SchedulerService()

