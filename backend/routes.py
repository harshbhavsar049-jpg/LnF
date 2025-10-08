'''from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from models import db, Device, User
from datetime import datetime
import math

api = Blueprint('api', __name__)

# -------------------------------------------------
# Utility Function: Distance Calculation
# -------------------------------------------------
def calculate_distance(lat1, lon1, lat2, lon2):
    """Calculate distance between two points using Haversine formula"""
    if not all([lat1, lon1, lat2, lon2]):
        return float('inf')

    lat1, lon1, lat2, lon2 = map(math.radians, [lat1, lon1, lat2, lon2])
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    a = math.sin(dlat/2)**2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon/2)**2
    c = 2 * math.asin(math.sqrt(a))
    r = 6371  # Radius of Earth in kilometers
    return c * r


# -------------------------------------------------
# Health Check Endpoint
# -------------------------------------------------
@api.route("/health", methods=["GET"])
def health():
    """Health check endpoint"""
    try:
        user_count = User.query.count()
        device_count = Device.query.count()
        return jsonify({
            "status": "healthy",
            "database": "connected",
            "stats": {"users": user_count, "devices": device_count},
            "timestamp": datetime.utcnow().isoformat()
        }), 200
    except Exception as e:
        return jsonify({
            "status": "unhealthy",
            "error": str(e),
            "timestamp": datetime.utcnow().isoformat()
        }), 500


# -------------------------------------------------
# DEVICE ROUTES (Authenticated)
# -------------------------------------------------
@api.route("/devices", methods=["GET"])
@jwt_required()
def get_devices():
    """Get all devices for current user"""
    try:
        current_user = User.find_by_username(get_jwt_identity())
        if not current_user:
            return jsonify({"message": "User not found"}), 404

        devices = Device.find_by_user_id(current_user.id)
        return jsonify([device.to_dict() for device in devices]), 200

    except Exception as e:
        print(f"Get devices error: {e}")
        return jsonify({"error": "Failed to fetch devices"}), 500


# In backend/routes.py

@api.route("/devices", methods=["POST"])
@jwt_required()
def add_device():
    """Add a new device"""
    try:
        current_user = User.find_by_username(get_jwt_identity())
        if not current_user:
            return jsonify({"message": "User not found"}), 404

        data = request.get_json()
        if not data or not data.get('name'):
            return jsonify({"message": "Device name is required"}), 400

        name = data.get('name', '').strip()
        description = data.get('description', '').strip()
        category = data.get('category', '').strip()
        location = data.get('location', '').strip()
        status = data.get('status', 'lost')

        latitude = data.get('latitude')
        longitude = data.get('longitude')

        # --- FIX STARTS HERE ---
        # Convert to float only if the value is not empty, otherwise treat as None
        latitude = float(latitude) if latitude not in [None, ''] else None
        longitude = float(longitude) if longitude not in [None, ''] else None
        # --- FIX ENDS HERE ---

        if status not in ['lost', 'found']:
            return jsonify({"message": "Status must be 'lost' or 'found'"}), 400

        device = Device(
            name=name,
            user_id=current_user.id,
            description=description,
            category=category,
            status=status,
            location=location,
            latitude=latitude,
            longitude=longitude
        )

        db.session.add(device)
        db.session.commit()
        return jsonify(device.to_dict()), 201

    except Exception as e:
        print(f"Add device error: {e}")
        db.session.rollback()  # Make sure to rollback session on error
        return jsonify({"error": "Failed to create device"}), 500

@api.route("/devices/<int:device_id>", methods=["DELETE"])
@jwt_required()
def delete_device(device_id):
    """Delete a device"""
    try:
        current_user = User.find_by_username(get_jwt_identity())
        if not current_user:
            return jsonify({"message": "User not found"}), 404

        device = Device.find_by_id(device_id)
        if not device:
            return jsonify({"message": "Device not found"}), 404
        if device.user_id != current_user.id:
            return jsonify({"message": "Unauthorized"}), 403

        db.session.delete(device)
        db.session.commit()
        return jsonify({"message": "Device deleted successfully"}), 200

    except Exception as e:
        print(f"Delete device error: {e}")
        return jsonify({"error": "Failed to delete device"}), 500


# -------------------------------------------------
# Additional endpoints (stats, search, nearby, admin)
# -------------------------------------------------
# You can keep your other routes (stats, search, nearby, admin) as they are.
# Just make sure each function name is unique (no duplicates).
# Add these to the end of routes.py

# Add this new route to your backend/routes.py file

@api.route("/devices/stats", methods=["GET"])
@jwt_required()
def get_device_stats():
    """Get device statistics for the current user"""
    try:
        current_user = User.find_by_username(get_jwt_identity())
        if not current_user:
            return jsonify({"message": "User not found"}), 404

        stats = Device.get_user_stats(current_user.id)
        return jsonify(stats), 200

    except Exception as e:
        print(f"Get device stats error: {e}")
        return jsonify({"error": "Failed to fetch stats"}), 500
    

@api.route("/devices/search", methods=["GET"])
@jwt_required()
def search_devices():
    """Search devices"""
    try:
        query = request.args.get('q', '')
        if not query:
            return jsonify([]), 200

        current_user = User.find_by_username(get_jwt_identity())
        if not current_user:
            return jsonify({"message": "User not found"}), 404

        devices = Device.search_devices(query, current_user.id)
        return jsonify([device.to_dict() for device in devices]), 200

    except Exception as e:
        print(f"Search devices error: {e}")
        return jsonify({"error": "Failed to search devices"}), 500


@api.route("/devices/<int:device_id>/status", methods=["PATCH"])
@jwt_required()
def update_device_status(device_id):
    """Update device status"""
    try:
        current_user = User.find_by_username(get_jwt_identity())
        if not current_user:
            return jsonify({"message": "User not found"}), 404

        device = Device.find_by_id(device_id)
        if not device:
            return jsonify({"message": "Device not found"}), 404
        if device.user_id != current_user.id:
            return jsonify({"message": "Unauthorized"}), 403

        data = request.get_json()
        new_status = data.get('status')
        
        if device.update_status(new_status):
            return jsonify(device.to_dict()), 200
        else:
            return jsonify({"message": "Invalid status"}), 400

    except Exception as e:
        print(f"Update status error: {e}")
        return jsonify({"error": "Failed to update status"}), 500

@api.route("/devices/<int:device_id>", methods=["PUT"])
@jwt_required()
def update_device(device_id):
    """Update a device"""
    try:
        current_user = User.find_by_username(get_jwt_identity())
        if not current_user:
            return jsonify({"message": "User not found"}), 404

        device = Device.find_by_id(device_id)
        if not device:
            return jsonify({"message": "Device not found"}), 404
        if device.user_id != current_user.id:
            return jsonify({"message": "Unauthorized"}), 403

        data = request.get_json()
        if 'name' in data:
            device.name = data['name'].strip()
        if 'description' in data:
            device.description = data['description'].strip()
        if 'category' in data:
            device.category = data['category'].strip()
        if 'location' in data:
            device.location = data['location'].strip()
        if 'status' in data and data['status'] in ['lost', 'found']:
            device.status = data['status']

        if 'latitude' in data:
            device.latitude = float(data['latitude']) if data['latitude'] else None
        if 'longitude' in data:
            device.longitude = float(data['longitude']) if data['longitude'] else None

        device.updated_at = datetime.utcnow()
        db.session.commit()
        return jsonify(device.to_dict()), 200

    except Exception as e:
        db.session.rollback()
        print(f"Update device error: {e}")
        return jsonify({"error": "Failed to update device"}), 500
'''
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from models import db, Device, User
from datetime import datetime
import math

api = Blueprint('api', __name__)

# -------------------------------------------------
# Health Check Endpoint
# -------------------------------------------------
@api.route("/health", methods=["GET"])
def health():
    """Health check endpoint"""
    try:
        user_count = User.query.count()
        device_count = Device.query.count()
        return jsonify({
            "status": "healthy",
            "database": "connected",
            "stats": {"users": user_count, "devices": device_count},
            "timestamp": datetime.utcnow().isoformat()
        }), 200
    except Exception as e:
        return jsonify({
            "status": "unhealthy",
            "error": str(e),
            "timestamp": datetime.utcnow().isoformat()
        }), 500


# -------------------------------------------------
# DEVICE ROUTES (Authenticated)
# -------------------------------------------------
@api.route("/devices", methods=["GET"])
@jwt_required()
def get_devices():
    """Get all devices for current user"""
    try:
        current_user = User.find_by_username(get_jwt_identity())
        if not current_user:
            return jsonify({"message": "User not found"}), 404

        devices = Device.find_by_user_id(current_user.id)
        return jsonify([device.to_dict() for device in devices]), 200

    except Exception as e:
        print(f"Get devices error: {e}")
        return jsonify({"error": "Failed to fetch devices"}), 500


@api.route("/devices", methods=["POST"])
@jwt_required()
def add_device():
    """Add a new device"""
    try:
        current_user = User.find_by_username(get_jwt_identity())
        if not current_user:
            return jsonify({"message": "User not found"}), 404

        data = request.get_json()
        if not data or not data.get('name'):
            return jsonify({"message": "Device name is required"}), 400

        # THIS BLOCK IS NOW FIXED to prevent the 500 error
        name = data.get('name', '').strip()
        description = data.get('description', '').strip()
        category = data.get('category', '').strip()
        location = data.get('location', '').strip()
        status = data.get('status', 'lost')
        
        latitude = data.get('latitude')
        longitude = data.get('longitude')

        latitude = float(latitude) if latitude not in [None, ''] else None
        longitude = float(longitude) if longitude not in [None, ''] else None

        if status not in ['lost', 'found']:
            return jsonify({"message": "Status must be 'lost' or 'found'"}), 400

        device = Device(
            name=name,
            user_id=current_user.id,
            description=description,
            category=category,
            status=status,
            location=location,
            latitude=latitude,
            longitude=longitude
        )

        db.session.add(device)
        db.session.commit()
        return jsonify(device.to_dict()), 201

    except Exception as e:
        db.session.rollback()
        print(f"Add device error: {e}")
        return jsonify({"error": "Failed to create device due to an internal error."}), 500


@api.route("/devices/<int:device_id>", methods=["PUT"])
@jwt_required()
def update_device(device_id):
    """Update a device"""
    try:
        current_user = User.find_by_username(get_jwt_identity())
        if not current_user:
            return jsonify({"message": "User not found"}), 404

        device = Device.find_by_id(device_id)
        if not device:
            return jsonify({"message": "Device not found"}), 404
        if device.user_id != current_user.id:
            return jsonify({"message": "Unauthorized"}), 403

        data = request.get_json()
        if 'name' in data:
            device.name = data['name'].strip()
        if 'description' in data:
            device.description = data['description'].strip()
        if 'category' in data:
            device.category = data['category'].strip()
        if 'location' in data:
            device.location = data['location'].strip()
        if 'status' in data and data['status'] in ['lost', 'found']:
            device.status = data['status']

        if 'latitude' in data:
            device.latitude = float(data['latitude']) if data['latitude'] not in [None, ''] else None
        if 'longitude' in data:
            device.longitude = float(data['longitude']) if data['longitude'] not in [None, ''] else None

        device.updated_at = datetime.utcnow()
        db.session.commit()
        return jsonify(device.to_dict()), 200

    except Exception as e:
        db.session.rollback()
        print(f"Update device error: {e}")
        return jsonify({"error": "Failed to update device"}), 500


@api.route("/devices/<int:device_id>", methods=["DELETE"])
@jwt_required()
def delete_device(device_id):
    """Delete a device"""
    try:
        current_user = User.find_by_username(get_jwt_identity())
        if not current_user:
            return jsonify({"message": "User not found"}), 404

        device = Device.find_by_id(device_id)
        if not device:
            return jsonify({"message": "Device not found"}), 404
        if device.user_id != current_user.id:
            return jsonify({"message": "Unauthorized"}), 403

        db.session.delete(device)
        db.session.commit()
        return jsonify({"message": "Device deleted successfully"}), 200

    except Exception as e:
        db.session.rollback()
        print(f"Delete device error: {e}")
        return jsonify({"error": "Failed to delete device"}), 500


# This new function fixes the Dashboard page
@api.route("/devices/stats", methods=["GET"])
@jwt_required()
def get_device_stats():
    """Get device statistics for the current user"""
    try:
        current_user = User.find_by_username(get_jwt_identity())
        if not current_user:
            return jsonify({"message": "User not found"}), 404

        stats = Device.get_user_stats(current_user.id)
        return jsonify(stats), 200

    except Exception as e:
        print(f"Get device stats error: {e}")
        return jsonify({"error": "Failed to fetch stats"}), 500