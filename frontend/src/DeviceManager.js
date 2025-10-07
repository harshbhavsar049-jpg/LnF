import React, { useState, useEffect } from "react";
import API from "./api";
import { useNavigate } from "react-router-dom";
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMapEvents, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix for default markers in react-leaflet
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// Custom icons for different statuses
const createCustomIcon = (color) => {
  return new L.Icon({
    iconUrl: `https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-${color}.png`,
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41]
  });
};

const lostIcon = createCustomIcon('red');
const foundIcon = createCustomIcon('green');
const userIcon = createCustomIcon('blue');
const trackingIcon = createCustomIcon('orange');

const MapEvents = ({ onMapClick }) => {
  useMapEvents({
    click: (e) => {
      onMapClick(e.latlng);
    },
  });
  return null;
};

// Component to fit map bounds to show the route
const FitBounds = ({ bounds }) => {
  const map = useMap();
  
  useEffect(() => {
    if (bounds && bounds.length > 0) {
      map.fitBounds(bounds, { padding: [50, 50] });
    }
  }, [bounds, map]);
  
  return null;
};

export default function DeviceManager({ onLogout }) {
  const [devices, setDevices] = useState([]);
  const [form, setForm] = useState({
    name: '', 
    description: '', 
    category: '', 
    location: '', 
    status: 'lost', 
    latitude: '', 
    longitude: ''
  });
  const [loading, setLoading] = useState(false);
  const [locationSuggestions, setLocationSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [trackingDevice, setTrackingDevice] = useState(null);
  const [routeCoordinates, setRouteCoordinates] = useState([]);
  const [routeDistance, setRouteDistance] = useState(null);
  const [routeDuration, setRouteDuration] = useState(null);
  const [isLoadingRoute, setIsLoadingRoute] = useState(false);
  const [selectedMarker, setSelectedMarker] = useState(null);
  const [userLocation, setUserLocation] = useState(null);
  const navigate = useNavigate();

  // Default center (Ahmedabad)
  const defaultCenter = [23.0225, 72.5714];

  const fetchDevices = async () => {
    try {
      const res = await API.get('/devices');
      setDevices(res.data);
    } catch (e) {
      console.error('Error fetching devices:', e);
    }
  };

  useEffect(() => {
    fetchDevices();
    
    // Get user's current location
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setUserLocation({
            lat: position.coords.latitude,
            lng: position.coords.longitude
          });
        },
        (error) => console.log('Location access denied:', error)
      );
    }
  }, []);

  // Fetch route from OSRM (Open Source Routing Machine)
  const fetchRoute = async (startLat, startLng, endLat, endLng) => {
    setIsLoadingRoute(true);
    try {
      const url = `https://router.project-osrm.org/route/v1/driving/${startLng},${startLat};${endLng},${endLat}?overview=full&geometries=geojson`;
      
      const response = await fetch(url);
      const data = await response.json();
      
      if (data.code === 'Ok' && data.routes && data.routes.length > 0) {
        const route = data.routes[0];
        
        // Convert coordinates from [lng, lat] to [lat, lng] for Leaflet
        const coordinates = route.geometry.coordinates.map(coord => [coord[1], coord[0]]);
        
        setRouteCoordinates(coordinates);
        setRouteDistance((route.distance / 1000).toFixed(2)); // Convert to km
        setRouteDuration((route.duration / 60).toFixed(0)); // Convert to minutes
        
        return coordinates;
      } else {
        // Fallback to straight line if routing fails
        console.warn('Routing failed, using straight line');
        setRouteCoordinates([[startLat, startLng], [endLat, endLng]]);
        
        // Calculate straight-line distance
        const distance = calculateDistance(startLat, startLng, endLat, endLng);
        setRouteDistance(distance.toFixed(2));
        setRouteDuration(null);
        
        return [[startLat, startLng], [endLat, endLng]];
      }
    } catch (error) {
      console.error('Error fetching route:', error);
      // Fallback to straight line
      const straightLine = [[startLat, startLng], [endLat, endLng]];
      setRouteCoordinates(straightLine);
      
      const distance = calculateDistance(startLat, startLng, endLat, endLng);
      setRouteDistance(distance.toFixed(2));
      setRouteDuration(null);
      
      return straightLine;
    } finally {
      setIsLoadingRoute(false);
    }
  };

  // Calculate straight-line distance using Haversine formula
  const calculateDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371; // Earth's radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  };

  const searchLocation = async (query) => {
    if (query.length < 2) {
      setLocationSuggestions([]);
      return;
    }

    try {
      setIsSearching(true);
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5`
      );
      const data = await response.json();
      setLocationSuggestions(data);
      setShowSuggestions(true);
      setIsSearching(false);
    } catch (error) {
      console.error('Error searching location:', error);
      setIsSearching(false);
    }
  };

  const selectLocation = (location) => {
    setForm({
      ...form,
      location: location.display_name,
      latitude: parseFloat(location.lat),
      longitude: parseFloat(location.lon)
    });
    setSearchQuery(location.display_name);
    setLocationSuggestions([]);
    setShowSuggestions(false);
  };

  const handleMapClick = (latlng) => {
    setForm({
      ...form,
      latitude: latlng.lat,
      longitude: latlng.lng
    });
    
    // Reverse geocode to get address
    fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latlng.lat}&lon=${latlng.lng}`)
      .then(response => response.json())
      .then(data => {
        setForm(prev => ({
          ...prev,
          location: data.display_name || `${latlng.lat.toFixed(6)}, ${latlng.lng.toFixed(6)}`
        }));
        setSearchQuery(data.display_name || `${latlng.lat.toFixed(6)}, ${latlng.lng.toFixed(6)}`);
      })
      .catch(error => {
        console.error('Reverse geocoding error:', error);
        setForm(prev => ({
          ...prev,
          location: `${latlng.lat.toFixed(6)}, ${latlng.lng.toFixed(6)}`
        }));
        setSearchQuery(`${latlng.lat.toFixed(6)}, ${latlng.lng.toFixed(6)}`);
      });
  };

  const startTracking = async (device) => {
    if (device.status !== 'lost') {
      alert('Only lost devices can be tracked!');
      return;
    }

    if (!device.latitude || !device.longitude) {
      alert('Device location is required for tracking!');
      return;
    }

    if (!navigator.geolocation) {
      alert('Geolocation is not supported by your browser.');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const userLat = position.coords.latitude;
        const userLng = position.coords.longitude;
        
        setUserLocation({
          lat: userLat,
          lng: userLng
        });

        setTrackingDevice(device);
        
        // Fetch the route
        await fetchRoute(
          userLat,
          userLng,
          parseFloat(device.latitude),
          parseFloat(device.longitude)
        );
      },
      (error) => {
        alert('Could not get your location. Please enable location services.');
        console.error('Geolocation error:', error);
      }
    );
  };

  const stopTracking = () => {
    setTrackingDevice(null);
    setRouteCoordinates([]);
    setRouteDistance(null);
    setRouteDuration(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    
    try {
      const res = await API.post('/devices', form);
      setDevices([res.data, ...devices]);
      setForm({
        name: '', 
        description: '', 
        category: '', 
        location: '', 
        status: 'lost', 
        latitude: '', 
        longitude: ''
      });
      setSearchQuery('');
      alert('Device added successfully!');
    } catch (err) {
      alert('Failed to add device: ' + (err.response?.data?.message || err.message));
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this device?')) return;
    
    try {
      await API.delete(`/devices/${id}`);
      setDevices(devices.filter(d => d.id !== id));
      alert('Device deleted successfully!');
    } catch (err) {
      alert('Failed to delete device');
    }
  };

  const handleStatusToggle = async (id, currentStatus) => {
    const newStatus = currentStatus === 'lost' ? 'found' : 'lost';
    
    try {
      await API.patch(`/devices/${id}/status`, { status: newStatus });
      setDevices(devices.map(d => 
        d.id === id ? { ...d, status: newStatus } : d
      ));
      alert(`Device marked as ${newStatus}!`);
      
      if (newStatus === 'found' && trackingDevice?.id === id) {
        stopTracking();
      }
    } catch (err) {
      alert('Failed to update status');
    }
  };

  const useGPS = () => {
    if (!navigator.geolocation) {
      alert("Geolocation is not supported by this browser.");
      return;
    }
    
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        
        try {
          const response = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`
          );
          const data = await response.json();
          
          setForm({
            ...form,
            latitude: lat,
            longitude: lng,
            location: data.display_name || `${lat}, ${lng}`
          });
          setSearchQuery(data.display_name || `${lat}, ${lng}`);
          alert('GPS coordinates and address added!');
        } catch (error) {
          setForm({
            ...form,
            latitude: lat,
            longitude: lng,
            location: `${lat}, ${lng}`
          });
          setSearchQuery(`${lat}, ${lng}`);
          alert('GPS coordinates added!');
        }
      },
      () => alert("Unable to retrieve your location")
    );
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('isLoggedIn');
    localStorage.removeItem('username');
    onLogout();
  };

  // Calculate bounds for the map to show the entire route
  const getRouteBounds = () => {
    if (routeCoordinates.length > 0) {
      return routeCoordinates;
    }
    return null;
  };

  return (
    <div className="device-manager">
      <header className="header">
        <div>
          <h1>📱 Lost & Found Tracker</h1>
          <p>Welcome, {localStorage.getItem('username')}</p>
        </div>
        <div className="header-buttons">
          <button onClick={() => navigate('/dashboard')}>📊 Dashboard</button>
          <button onClick={handleLogout} className="logout-btn">🚪 Logout</button>
        </div>
      </header>

      <div className="content">
        <div className="form-section">
          <form onSubmit={handleSubmit} className="device-form">
            <h3>➕ Add New Device</h3>
            
            <input
              placeholder="Device name *"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
            
            <input
              placeholder="Description"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
            
            <input
              placeholder="Category (phone, laptop, etc.)"
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
            />
            
            <div className="location-search-container">
              <div className="search-input-wrapper">
                <input
                  placeholder="Search location..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    searchLocation(e.target.value);
                  }}
                  className="location-search-input"
                  onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                />
                {isSearching && <div className="search-spinner"></div>}
                <button 
                  type="button" 
                  className="search-button"
                  onClick={() => searchLocation(searchQuery)}
                >
                  🔍
                </button>
              </div>
              
              {showSuggestions && locationSuggestions.length > 0 && (
                <div className="location-suggestions">
                  {locationSuggestions.map((suggestion, index) => (
                    <div
                      key={index}
                      className="location-suggestion"
                      onClick={() => selectLocation(suggestion)}
                    >
                      <div className="suggestion-name">{suggestion.display_name}</div>
                      <div className="suggestion-coords">
                        {suggestion.lat}, {suggestion.lon}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            
            <select
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value })}
            >
              <option value="lost">🔴 Lost</option>
              <option value="found">🟢 Found</option>
            </select>

            <div className="coordinates-container">
              <div className="coordinates-inputs">
                <div className="coordinate-input-group">
                  <label>Latitude</label>
                  <input
                    type="number"
                    step="any"
                    placeholder="Latitude"
                    value={form.latitude}
                    onChange={(e) => setForm({ ...form, latitude: e.target.value })}
                    className="coordinate-input"
                  />
                </div>
                <div className="coordinate-input-group">
                  <label>Longitude</label>
                  <input
                    type="number"
                    step="any"
                    placeholder="Longitude"
                    value={form.longitude}
                    onChange={(e) => setForm({ ...form, longitude: e.target.value })}
                    className="coordinate-input"
                  />
                </div>
              </div>
            </div>
            
            <button type="button" className="location-button" onClick={useGPS}>
              <span className="location-icon">📍</span> Use Current Location
            </button>            
            
            <button type="submit" disabled={loading}>
              {loading ? 'Adding...' : '✅ Add Device'}
            </button>
          </form>
        </div>

        <div className="devices-section">
          <h3>📋 Your Devices ({devices.length})</h3>
          
          {devices.length === 0 ? (
            <p>No devices added yet. Add one using the form!</p>
          ) : (
            <div className="devices-list">
              {devices.map(device => (
                <div key={device.id} className={`device-card ${device.status}`}>
                  <div className="device-info">
                    <h4>{device.name}</h4>
                    {device.description && <p>{device.description}</p>}
                    {device.category && <small>Category: {device.category}</small>}
                    {device.location && <small>📍 {device.location}</small>}
                    {device.latitude && device.longitude && (
                      <small>📌 {device.latitude.toFixed(4)}, {device.longitude.toFixed(4)}</small>
                    )}
                    <small>Added: {new Date(device.created_at).toLocaleDateString()}</small>
                  </div>
                  
                  <div className="device-actions">
                    <span className={`status-badge ${device.status}`}>
                      {device.status === 'lost' ? '🔴 Lost' : '🟢 Found'}
                    </span>
                    <button 
                      onClick={() => handleStatusToggle(device.id, device.status)}
                      className="status-btn"
                    >
                      Mark as {device.status === 'lost' ? 'Found' : 'Lost'}
                    </button>
                    {device.status === 'lost' && device.latitude && device.longitude && (
                      <button
                        onClick={() => startTracking(device)}
                        className="track-btn"
                        disabled={trackingDevice !== null}
                      >
                        🔍 Track
                      </button>
                    )}
                    <button 
                      onClick={() => handleDelete(device.id)}
                      className="delete-btn"
                    >
                      🗑️ Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Leaflet Map Section */}
      <div className="map-section">
        <h3>🗺️ Device Locations & Route Tracking</h3>
        <p className="map-instructions">
          💡 <strong>Tip:</strong> Click anywhere on the map to set coordinates automatically! Click "Track" on a lost device to see the navigation route.
        </p>
        <MapContainer
          center={defaultCenter}
          zoom={12}
          style={{ height: '500px', width: '100%', borderRadius: '12px' }}
        >
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          />
          
          <MapEvents onMapClick={handleMapClick} />
          
          {/* Fit bounds to show the entire route */}
          {routeCoordinates.length > 0 && <FitBounds bounds={getRouteBounds()} />}
          
          {/* User Location Marker */}
          {userLocation && (
            <Marker position={[userLocation.lat, userLocation.lng]} icon={userIcon}>
              <Popup>
                <strong>📍 Your Current Location</strong>
                <br />
                {userLocation.lat.toFixed(6)}, {userLocation.lng.toFixed(6)}
              </Popup>
            </Marker>
          )}
          
          {/* Device Markers */}
          {devices.map(device => (
            device.latitude && device.longitude ? (
              <Marker
                key={device.id}
                position={[parseFloat(device.latitude), parseFloat(device.longitude)]}
                icon={device.status === 'lost' ? lostIcon : foundIcon}
                eventHandlers={{
                  click: () => setSelectedMarker(device)
                }}
              >
                <Popup>
                  <div className="info-window">
                    <h3>{device.name}</h3>
                    <p>{device.description}</p>
                    <p><strong>Status:</strong> {device.status === 'lost' ? '❌ Lost' : '✅ Found'}</p>
                    <p><strong>Location:</strong> {device.location}</p>
                    <p><strong>Coordinates:</strong> {parseFloat(device.latitude).toFixed(6)}, {parseFloat(device.longitude).toFixed(6)}</p>
                    {device.status === 'lost' && (
                      <button 
                        onClick={() => startTracking(device)}
                        style={{
                          padding: '8px 16px',
                          background: '#f59e0b',
                          color: 'white',
                          border: 'none',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          marginTop: '10px'
                        }}
                      >
                        🔍 Track This Device
                      </button>
                    )}
                  </div>
                </Popup>
              </Marker>
            ) : null
          ))}
          
          {/* Route Polyline */}
          {routeCoordinates.length > 0 && (
            <Polyline
              positions={routeCoordinates}
              color="#3b82f6"
              weight={5}
              opacity={0.8}
              lineJoin="round"
            />
          )}
          
          {/* Tracking Device Marker */}
          {trackingDevice && (
            <Marker
              position={[parseFloat(trackingDevice.latitude), parseFloat(trackingDevice.longitude)]}
              icon={trackingIcon}
            >
              <Popup>
                <strong>🎯 Target: {trackingDevice.name}</strong>
                <br />
                📍 {parseFloat(trackingDevice.latitude).toFixed(6)}, {parseFloat(trackingDevice.longitude).toFixed(6)}
              </Popup>
            </Marker>
          )}
        </MapContainer>
      </div>

      {/* Tracking Control Panel */}
      {trackingDevice && (
        <div className="tracking-panel">
          <div className="tracking-info">
            <h4>🔍 Tracking: {trackingDevice.name}</h4>
            {isLoadingRoute ? (
              <p>🔄 Calculating route...</p>
            ) : (
              <>
                {userLocation && (
                  <>
                    <p>📍 Your location: {userLocation.lat.toFixed(6)}, {userLocation.lng.toFixed(6)}</p>
                    <p>🎯 Device: {parseFloat(trackingDevice.latitude).toFixed(6)}, {parseFloat(trackingDevice.longitude).toFixed(6)}</p>
                  </>
                )}
                {routeDistance && (
                  <p>📏 Distance: {routeDistance} km</p>
                )}
                {routeDuration && (
                  <p>⏱️ Estimated time: {routeDuration} minutes</p>
                )}
                <p style={{fontSize: '12px', color: '#666', marginTop: '10px'}}>
                  {routeDuration ? '🚗 Route via roads shown on map' : '📐 Straight-line distance shown'}
                </p>
              </>
            )}
          </div>
          <div className="tracking-controls">
            <button onClick={stopTracking} className="stop-tracking-btn">
              ⏹️ Stop Tracking
            </button>
          </div>
        </div>
      )}
    </div>
  );
}