import os
import json
from datetime import datetime
from contextlib import contextmanager
from dotenv import load_dotenv
from sqlalchemy import (
    create_engine,
    Column,
    Integer,
    Float,
    String,
    Text,
    DateTime,
    ForeignKey,
)
from sqlalchemy.orm import sessionmaker, declarative_base, relationship

# Load environment variables
load_dotenv()

# Select DB URL: Supabase/PostgreSQL (from DATABASE_URL) or default to SQLite
DATABASE_URL = os.getenv("DATABASE_URL") or os.getenv("SUPABASE_DB_URL")
if not DATABASE_URL:
    backend_dir = os.path.dirname(os.path.abspath(__file__))
    DB_PATH = os.path.join(backend_dir, "navniti.db")
    DATABASE_URL = f"sqlite:///{DB_PATH}"

# Configure create_engine with sqlite compatibility options
if DATABASE_URL.startswith("sqlite"):
    engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
else:
    # Postgres specific optimization (e.g. pool recycle)
    engine = create_engine(DATABASE_URL, pool_pre_ping=True)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# Seed Ward Data (10 wards representing Nagpur, India area for a tight coordinate cluster)
SEED_WARDS = [
    {"id": 1, "name": "Civil Lines", "latitude": 21.150, "longitude": 79.080, "population": 120000, "baseline_pulse_score": 95.0},
    {"id": 2, "name": "Sadar", "latitude": 21.160, "longitude": 79.090, "population": 95000, "baseline_pulse_score": 92.0},
    {"id": 3, "name": "Dharampeth", "latitude": 21.140, "longitude": 79.070, "population": 110000, "baseline_pulse_score": 94.0},
    {"id": 4, "name": "Sitabuldi", "latitude": 21.145, "longitude": 79.085, "population": 85000, "baseline_pulse_score": 90.0},
    {"id": 5, "name": "Ramdaspeth", "latitude": 21.135, "longitude": 79.080, "population": 70000, "baseline_pulse_score": 93.0},
    {"id": 6, "name": "Wardhaman Nagar", "latitude": 21.155, "longitude": 79.120, "population": 130000, "baseline_pulse_score": 88.0},
    {"id": 7, "name": "Trimurti Nagar", "latitude": 21.120, "longitude": 79.050, "population": 105000, "baseline_pulse_score": 91.0},
    {"id": 8, "name": "Manish Nagar", "latitude": 21.090, "longitude": 79.090, "population": 90000, "baseline_pulse_score": 89.0},
    {"id": 9, "name": "Nandanvan", "latitude": 21.138, "longitude": 79.115, "population": 115000, "baseline_pulse_score": 90.0},
    {"id": 10, "name": "Gandhibagh", "latitude": 21.150, "longitude": 79.100, "population": 140000, "baseline_pulse_score": 86.0},
]


# SQLAlchemy Database Models
class Ward(Base):
    __tablename__ = "wards"

    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False)
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    population = Column(Integer, nullable=False)
    baseline_pulse_score = Column(Float, nullable=False, default=100.0)

    # Relationships
    traffic_readings = relationship("TrafficReading", back_populates="ward", cascade="all, delete-orphan")
    water_readings = relationship("WaterReading", back_populates="ward", cascade="all, delete-orphan")
    air_quality_readings = relationship("AirQualityReading", back_populates="ward", cascade="all, delete-orphan")
    sanitation_readings = relationship("SanitationReading", back_populates="ward", cascade="all, delete-orphan")
    complaints = relationship("CitizenComplaint", back_populates="ward", cascade="all, delete-orphan")
    alerts = relationship("Alert", back_populates="ward", cascade="all, delete-orphan")


class TrafficReading(Base):
    __tablename__ = "traffic_readings"

    id = Column(Integer, primary_key=True, index=True)
    ward_id = Column(Integer, ForeignKey("wards.id"), nullable=False)
    timestamp = Column(DateTime, nullable=False, default=datetime.utcnow)
    vehicle_count = Column(Integer, nullable=False)
    congestion_percentage = Column(Float, nullable=False)
    average_speed = Column(Float, nullable=False)

    ward = relationship("Ward", back_populates="traffic_readings")


class WaterReading(Base):
    __tablename__ = "water_readings"

    id = Column(Integer, primary_key=True, index=True)
    ward_id = Column(Integer, ForeignKey("wards.id"), nullable=False)
    timestamp = Column(DateTime, nullable=False, default=datetime.utcnow)
    pressure = Column(Float, nullable=False)
    flow_rate = Column(Float, nullable=False)
    consumption = Column(Float, nullable=False)

    ward = relationship("Ward", back_populates="water_readings")


class AirQualityReading(Base):
    __tablename__ = "air_quality_readings"

    id = Column(Integer, primary_key=True, index=True)
    ward_id = Column(Integer, ForeignKey("wards.id"), nullable=False)
    timestamp = Column(DateTime, nullable=False, default=datetime.utcnow)
    aqi = Column(Float, nullable=False)
    pm25 = Column(Float, nullable=False)
    pm10 = Column(Float, nullable=False)

    ward = relationship("Ward", back_populates="air_quality_readings")


class SanitationReading(Base):
    __tablename__ = "sanitation_readings"

    id = Column(Integer, primary_key=True, index=True)
    ward_id = Column(Integer, ForeignKey("wards.id"), nullable=False)
    timestamp = Column(DateTime, nullable=False, default=datetime.utcnow)
    garbage_fill_percentage = Column(Float, nullable=False)
    collection_status = Column(String, nullable=False, default="pending")

    ward = relationship("Ward", back_populates="sanitation_readings")


class CitizenComplaint(Base):
    __tablename__ = "citizen_complaints"

    id = Column(Integer, primary_key=True, index=True)
    ward_id = Column(Integer, ForeignKey("wards.id"), nullable=False)
    timestamp = Column(DateTime, nullable=False, default=datetime.utcnow)
    raw_text = Column(Text, nullable=False)
    category = Column(String, nullable=False)  # TRAFFIC, WATER, AIR_QUALITY, etc.
    severity = Column(String, nullable=False)  # LOW, MEDIUM, HIGH, CRITICAL
    status = Column(String, nullable=False, default="open")  # open, duplicate, resolved
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    duplicate_group_id = Column(Integer, nullable=True)
    ai_summary = Column(Text, nullable=True)

    ward = relationship("Ward", back_populates="complaints")


class Alert(Base):
    __tablename__ = "alerts"

    id = Column(Integer, primary_key=True, index=True)
    ward_id = Column(Integer, ForeignKey("wards.id"), nullable=False)
    timestamp = Column(DateTime, nullable=False, default=datetime.utcnow)
    type = Column(String, nullable=False)  # ANOMALY, CORRELATION
    severity = Column(String, nullable=False)  # LOW, MEDIUM, HIGH, CRITICAL
    title = Column(String, nullable=False)
    description = Column(Text, nullable=False)
    confidence = Column(Float, nullable=False)  # Percentage confidence
    contributing_factors = Column(Text, nullable=False)  # JSON-serialized list of strings
    recommended_actions = Column(Text, nullable=False)   # JSON-serialized list of strings
    status = Column(String, nullable=False, default="active")  # active, acknowledged, resolved

    ward = relationship("Ward", back_populates="alerts")


# DB initialization function
def init_db(reset: bool = False):
    if reset:
        # For Postgres, dropping tables requires drop_all, for SQLite we can just delete file
        if DATABASE_URL.startswith("sqlite"):
            # Simple delete
            backend_dir = os.path.dirname(os.path.abspath(__file__))
            DB_PATH = os.path.join(backend_dir, "navniti.db")
            if os.path.exists(DB_PATH):
                try:
                    os.unlink(DB_PATH)
                except Exception:
                    pass
        Base.metadata.drop_all(bind=engine)

    Base.metadata.create_all(bind=engine)

    # Seed wards if they don't exist
    db = SessionLocal()
    try:
        if db.query(Ward).count() == 0:
            for w in SEED_WARDS:
                db.add(Ward(**w))
            db.commit()
            print("Wards seeded successfully!")
    except Exception as e:
        db.rollback()
        print(f"Error seeding wards: {e}")
    finally:
        db.close()


# Database Session dependency context manager
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


if __name__ == "__main__":
    init_db(reset=True)
    print(f"Initialized database using: {DATABASE_URL}")
