from flask_sqlalchemy import SQLAlchemy
from werkzeug.security import generate_password_hash, check_password_hash
from datetime import datetime
from sqlalchemy import func

db = SQLAlchemy()

class User(db.Model):
    __tablename__ = 'users'
    
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False, index=True)
    email = db.Column(db.String(120), unique=True, nullable=True, index=True)
    password_hash = db.Column(db.String(256), nullable=False)
    is_admin = db.Column(db.Boolean, default=False, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    devices = db.relationship('Device', backref='owner', lazy=True, cascade='all, delete-orphan')

    def __init__(self, username, email=None, password=None, is_admin=False):
        self.username = username
        self.email = email
        self.is_admin = is_admin
        if password:
            self.set_password(password)

    def set_password(self, password):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)
    
    @staticmethod
    def find_by_username(username):
        return User.query.filter_by(username=username).first()
    
    @staticmethod
    def find_by_email(email):
        if not email: return None
        return User.query.filter_by(email=email).first()
    
    @staticmethod
    def find_by_id(user_id):
        return User.query.get(user_id)
    
    def save(self):
        try:
            db.session.add(self)
            db.session.commit()
            return True
        except Exception as e:
            db.session.rollback()
            print(f"Error saving user: {e}")
            return False
    
    def delete(self):
        try:
            db.session.delete(self)
            db.session.commit()
            return True
        except Exception as e:
            db.session.rollback()
            print(f"Error deleting user: {e}")
            return False
    
    def to_dict(self):
        return {
            'id': self.id, 'username': self.username, 'email': self.email, 'is_admin': self.is_admin,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }

    def __repr__(self):
        return f'<User {self.username}>'

class Device(db.Model):
    __tablename__ = 'devices'
    
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    description = db.Column(db.String(200))
    category = db.Column(db.String(100))
    location = db.Column(db.String(200))
    status = db.Column(db.String(50))
    latitude = db.Column(db.Float)
    longitude = db.Column(db.Float)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    
    __table_args__ = (
        db.Index('ix_devices_user_id', 'user_id'),
        db.Index('ix_devices_status', 'status'),
        db.Index('ix_devices_created_at', 'created_at'),
    )

    def __init__(self, name, user_id, description='', category='', status='lost', 
                 location='', latitude=None, longitude=None):
        self.name = name
        self.user_id = user_id
        self.description = description
        self.category = category
        self.status = status
        self.location = location
        self.latitude = float(latitude) if latitude is not None else None
        self.longitude = float(longitude) if longitude is not None else None
    
    @staticmethod
    def find_by_user_id(user_id):
        return Device.query.filter_by(user_id=user_id).order_by(Device.created_at.desc()).all()
    
    @staticmethod
    def find_by_id(device_id):
        return Device.query.get(device_id)
    
    @staticmethod
    def find_all():
        """Find all devices using SQLAlchemy"""
        return Device.query.order_by(Device.created_at.desc()).all()
    
    @staticmethod
    def get_user_stats(user_id):
        try:
            stats = db.session.query(
                func.count(Device.id).label('total'),
                func.sum(db.case((Device.status == 'lost', 1), else_=0)).label('lost'),
                func.sum(db.case((Device.status == 'found', 1), else_=0)).label('found')
            ).filter(Device.user_id == user_id).first()
            
            return {
                'total': int(stats.total or 0),
                'lost': int(stats.lost or 0),
                'found': int(stats.found or 0)
            }
        except Exception as e:
            print(f"Error getting user stats: {e}")
            return {'total': 0, 'lost': 0, 'found': 0}
    
    @staticmethod
    def search_devices(query, user_id=None):
        """Search devices by name, description, or location using SQLAlchemy"""
        search = f"%{query}%"
        devices_query = Device.query.filter(
            db.or_(
                Device.name.like(search),
                Device.description.like(search),
                Device.location.like(search),
                Device.category.like(search)
            )
        )
        
        if user_id:
            devices_query = devices_query.filter(Device.user_id == user_id)
        
        return devices_query.order_by(Device.created_at.desc()).all()
    
    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'description': self.description or '',
            'category': self.category or '',
            'status': self.status or 'lost',
            'location': self.location or '',
            'latitude': float(self.latitude) if self.latitude is not None else None,
            'longitude': float(self.longitude) if self.longitude is not None else None,
            'user_id': self.user_id,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
            'owner_username': self.owner.username if self.owner else None
        }

    def __repr__(self):
        return f'<Device {self.name} ({self.status})>'