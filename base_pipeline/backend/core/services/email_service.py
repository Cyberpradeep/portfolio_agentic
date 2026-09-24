"""
Email Service: Asynchronous, non-blocking SMTP email and resume PDF dispatcher.
Executes synchronous smtplib operations inside worker threads via asyncio.to_thread,
preventing event loop freezes and maintaining audio streaming continuity.
"""

import asyncio
import os
import smtplib
from email.mime.application import MIMEApplication
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from pathlib import Path
from typing import Dict, Any

from config import SENDER_EMAIL, SENDER_PASSWORD, RESUME_PATH


def _sync_send_contact_email(user_email: str, user_message: str, email_subject: str) -> Dict[str, Any]:
    if not SENDER_EMAIL or not SENDER_PASSWORD:
        return {"success": False, "message": "SMTP credentials not configured on server"}

    msg = MIMEMultipart()
    msg['From'] = SENDER_EMAIL
    msg['Reply-To'] = user_email
    msg['To'] = SENDER_EMAIL
    msg['Subject'] = f"[Portfolio Contact] {email_subject}"

    body = f"From: {user_email}\nSubject: {email_subject}\n\n{user_message}"
    msg.attach(MIMEText(body, "plain"))

    try:
        with smtplib.SMTP('smtp.gmail.com', 587, timeout=15) as server:
            server.starttls()
            server.login(SENDER_EMAIL, SENDER_PASSWORD)
            server.send_message(msg)
        return {"success": True, "message": "Email sent successfully"}
    except Exception as exc:
        print(f"[EMAIL_ERR] Failed sending contact email: {exc}")
        return {"success": False, "error": str(exc)}


def _sync_send_resume(user_email: str) -> Dict[str, Any]:
    if not SENDER_EMAIL or not SENDER_PASSWORD:
        return {"success": False, "message": "SMTP credentials not configured on server"}

    if not RESUME_PATH.exists():
        return {"success": False, "message": "Resume PDF file not found on server"}

    msg = MIMEMultipart()
    msg["From"] = SENDER_EMAIL
    msg["To"] = user_email
    msg["Subject"] = "Pradeep Selladurai - Resume"

    body = (
        "Hello,\n\n"
        "Thank you for reaching out via my AI Digital Twin. "
        "Please find attached my resume for your review.\n\n"
        "Best regards,\n"
        "Pradeep Selladurai"
    )
    msg.attach(MIMEText(body, "plain"))

    try:
        with open(RESUME_PATH, "rb") as f:
            attachment = MIMEApplication(f.read(), _subtype="pdf")
        attachment.add_header("Content-Disposition", "attachment", filename=RESUME_PATH.name)
        msg.attach(attachment)

        with smtplib.SMTP("smtp.gmail.com", 587, timeout=15) as server:
            server.starttls()
            server.login(SENDER_EMAIL, SENDER_PASSWORD)
            server.send_message(msg)
        return {"success": True, "message": f"Resume dispatched successfully to {user_email}"}
    except Exception as exc:
        print(f"[RESUME_ERR] Failed sending resume to {user_email}: {exc}")
        return {"success": False, "error": str(exc)}


async def send_contact_email_async(user_email: str, user_message: str, email_subject: str) -> Dict[str, Any]:
    return await asyncio.to_thread(_sync_send_contact_email, user_email, user_message, email_subject)


async def send_resume_async(user_email: str) -> Dict[str, Any]:
    return await asyncio.to_thread(_sync_send_resume, user_email)
