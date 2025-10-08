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

const createCustomIcon = (color) => new L.Icon({
    iconUrl: `https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-${color}.png`,
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
    iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41]
});
const lostIcon = createCustomIcon('red'), foundIcon = createCustomIcon('green'), userIcon = createCustomIcon('blue'), trackingIcon = createCustomIcon('orange');

const MapEvents = ({ onMapClick }) => {
  useMapEvents({ click: (e) => onMapClick(e.latlng) });
  return null;
};

const FitBounds = ({ bounds }) => {
  const map = useMap();
  useEffect(() => { if (bounds?.length) map.fitBounds(bounds, { padding: [50, 50] }) }, [bounds, map]);
  return null;
};

export default function DeviceManager({ onLogout }) {
  const [devices, setDevices] = useState([]);
  const [form, setForm] = useState({ name: '', description: '', category: '', location: '', status: 'lost', latitude: '', longitude: '' });
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
  const [userLocation, setUserLocation] = useState(null);
  const navigate = useNavigate();
  const defaultCenter = [23.0225, 72.5714]; // Ahmedabad

  useEffect(() => {
    const fetchDevices = async () => {
      try {
        const res = await API.get('/devices');
        setDevices(res.data);
      } catch (e) {
        console.error('Error fetching devices:', e);
      }
    };
    fetchDevices();
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => setUserLocation({ lat: position.coords.latitude, lng: position.coords.longitude }),
        (error) => console.log('Location access denied:', error)
      );
    }
  }, []);

  const fetchRoute = async (startLat, startLng, endLat, endLng) => {
    setIsLoadingRoute(true);
    try {
      const url = `https://router.project-osrm.org/route/v1/driving/${startLng},${startLat};${endLng},${endLat}?overview=full&geometries=geojson`;
      const response = await fetch(url);
      const data = await response.json();
      if (data.code === 'Ok' && data.routes?.length) {
        const route = data.routes[0];
        setRouteCoordinates(route.geometry.coordinates.map(coord => [coord[1], coord[0]]));
        setRouteDistance((route.distance / 1000).toFixed(2));
        setRouteDuration((route.duration / 60).toFixed(0));
      } else {
        throw new Error('Routing failed');
      }
    } catch (error) {
      console.warn('Routing failed, using straight line:', error);
      const straightLine = [[startLat, startLng], [endLat, endLng]];
      setRouteCoordinates(straightLine);
      setRouteDistance(null);
      setRouteDuration(null);
    } finally {
      setIsLoadingRoute(false);
    }
  };

  const searchLocation = async (query) => {
    if (query.length < 2) return setLocationSuggestions([]);
    setIsSearching(true);
    try {
      const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5`);
      const data = await response.json();
      setLocationSuggestions(data);
      setShowSuggestions(true);
    } catch (error) {
      console.error('Error searching location:', error);
    } finally {
      setIsSearching(false);
    }
  };

  const selectLocation = (location) => {
    setForm({ ...form, location: location.display_name, latitude: parseFloat(location.lat), longitude: parseFloat(location.lon) });
    setSearchQuery(location.display_name);
    setShowSuggestions(false);
  };

  const handleMapClick = (latlng) => {
    setForm({ ...form, latitude: latlng.lat, longitude: latlng.lng });
    fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latlng.lat}&lon=${latlng.lng}`)
      .then(res => res.json()).then(data => {
        const locationName = data.display_name || `${latlng.lat.toFixed(6)}, ${latlng.lng.toFixed(6)}`;
        setForm(prev => ({ ...prev, location: locationName }));
        setSearchQuery(locationName);
      }).catch(err => console.error('Reverse geocoding error:', err));
  };

  const startTracking = (device) => {
    if (!device.latitude || !device.longitude) return alert('Device location is required for tracking!');
    if (!navigator.geolocation) return alert('Geolocation is not supported by your browser.');
    setTrackingDevice(device);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const userLat = position.coords.latitude, userLng = position.coords.longitude;
        setUserLocation({ lat: userLat, lng: userLng });
        fetchRoute(userLat, userLng, parseFloat(device.latitude), parseFloat(device.longitude));
      },
      (error) => {
        alert('Could not get your location. Please enable location services.');
        console.error('Geolocation error:', error);
        stopTracking();
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
      setForm({ name: '', description: '', category: '', location: '', status: 'lost', latitude: '', longitude: '' });
      setSearchQuery('');
      alert('Device added successfully!');
    } catch (err) {
      alert('Failed to add device: ' + (err.response?.data?.error || err.message));
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
      // THIS BLOCK IS NOW FIXED
      const res = await API.put(`/devices/${id}`, { status: newStatus });
      setDevices(devices.map(d => d.id === id ? { ...d, status: res.data.status } : d));
      alert(`Device marked as ${newStatus}!`);
      if (newStatus === 'found' && trackingDevice?.id === id) stopTracking();
    } catch (err) {
      alert('Failed to update status');
    }
  };
  
  const useGPS = () => {
    if (!navigator.geolocation) return alert("Geolocation is not supported by this browser.");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude: lat, longitude: lng } = position.coords;
        handleMapClick({ lat, lng });
        alert('GPS coordinates and address added!');
      },
      () => alert("Unable to retrieve your location")
    );
  };

  const handleLogout = () => {
    onLogout();
    navigate('/login');
  };

  const getRouteBounds = () => {
    if (!trackingDevice || !userLocation) return null;
    return [[userLocation.lat, userLocation.lng], [trackingDevice.latitude, trackingDevice.longitude]];
  };

  return (
    <div className="device-manager">
      <header className="header">
        <div><h1>📱 Lost & Found Tracker</h1><p>Welcome, {localStorage.getItem('username')}</p></div>
        <div className="header-buttons">
          <button onClick={() => navigate('/dashboard')}>📊 Dashboard</button>
          <button onClick={handleLogout} className="logout-btn">🚪 Logout</button>
        </div>
      </header>
      <div className="content">
        <div className="form-section">
          <form onSubmit={handleSubmit} className="device-form">
            <h3>➕ Add New Device</h3>
            <input placeholder="Device name *" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            <input placeholder="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            <input placeholder="Category (phone, laptop, etc.)" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
            <div className="location-search-container">
              <div className="search-input-wrapper">
                <input placeholder="Search location..." value={searchQuery} onChange={(e) => { setSearchQuery(e.target.value); searchLocation(e.target.value); }} onBlur={() => setTimeout(() => setShowSuggestions(false), 200)} onFocus={() => locationSuggestions.length > 0 && setShowSuggestions(true)} />
                {isSearching && <div className="search-spinner"></div>}
              </div>
              {showSuggestions && locationSuggestions.length > 0 && (
                <div className="location-suggestions">{locationSuggestions.map((s) => <div key={s.place_id} className="location-suggestion" onClick={() => selectLocation(s)}><div className="suggestion-name">{s.display_name}</div></div>)}</div>
              )}
            </div>
            <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              <option value="lost">🔴 Lost</option><option value="found">🟢 Found</option>
            </select>
            <div className="coordinates-container">
              <div className="coordinates-inputs">
                <div className="coordinate-input-group"><label>Latitude</label><input type="number" step="any" placeholder="Latitude" value={form.latitude} onChange={(e) => setForm({ ...form, latitude: e.target.value })} /></div>
                <div className="coordinate-input-group"><label>Longitude</label><input type="number" step="any" placeholder="Longitude" value={form.longitude} onChange={(e) => setForm({ ...form, longitude: e.target.value })} /></div>
              </div>
            </div>
            <button type="button" className="location-button" onClick={useGPS}><span className="location-icon">📍</span> Use Current Location</button>
            <button type="submit" disabled={loading}>{loading ? 'Adding...' : '✅ Add Device'}</button>
          </form>
        </div>
        <div className="devices-section">
          <h3>📋 Your Devices ({devices.length})</h3>
          {devices.length === 0 ? <p>No devices added yet.</p> : (
            <div className="devices-list">{devices.map(device => (
              <div key={device.id} className={`device-card ${device.status}`}>
                <div className="device-info">
                  <h4>{device.name}</h4>
                  {device.description && <p>{device.description}</p>}{device.category && <small>Category: {device.category}</small>}{device.location && <small>📍 {device.location}</small>}
                  {device.latitude && device.longitude && <small>📌 {parseFloat(device.latitude).toFixed(4)}, {parseFloat(device.longitude).toFixed(4)}</small>}
                  <small>Added: {new Date(device.created_at).toLocaleDateString()}</small>
                </div>
                <div className="device-actions">
                  <span className={`status-badge ${device.status}`}>{device.status === 'lost' ? '🔴 Lost' : '🟢 Found'}</span>
                  <button onClick={() => handleStatusToggle(device.id, device.status)} className="status-btn">Mark as {device.status === 'lost' ? 'Found' : 'Lost'}</button>
                  {device.status === 'lost' && device.latitude && device.longitude && <button onClick={() => startTracking(device)} className="track-btn" disabled={!!trackingDevice}>🔍 Track</button>}
                  <button onClick={() => handleDelete(device.id)} className="delete-btn">🗑️ Delete</button>
                </div>
              </div>
            ))}</div>
          )}
        </div>
      </div>
      <div className="map-section">
        <h3>🗺️ Device Locations & Route Tracking</h3>
        <p className="map-instructions">💡 <strong>Tip:</strong> Click on the map to set coordinates! Click "Track" on a lost device to see the route.</p>
        <MapContainer center={userLocation || defaultCenter} zoom={12} style={{ height: '500px', width: '100%', borderRadius: '12px' }}>
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' />
          <MapEvents onMapClick={handleMapClick} />
          {getRouteBounds() && <FitBounds bounds={getRouteBounds()} />}
          {userLocation && <Marker position={[userLocation.lat, userLocation.lng]} icon={userIcon}><Popup><strong>📍 Your Location</strong></Popup></Marker>}
          {devices.map(d => d.latitude && d.longitude ? <Marker key={d.id} position={[parseFloat(d.latitude), parseFloat(d.longitude)]} icon={trackingDevice?.id === d.id ? trackingIcon : (d.status === 'lost' ? lostIcon : foundIcon)}>
            <Popup><div className="info-window"><h3>{d.name}</h3>{d.description && <p>{d.description}</p>}<p><strong>Status:</strong> {d.status === 'lost' ? '🔴 Lost' : '🟢 Found'}</p>{d.location && <p><strong>Location:</strong> {d.location}</p>}{d.status === 'lost' && <button onClick={() => startTracking(d)}>🔍 Track</button>}</div></Popup>
          </Marker> : null)}
          {routeCoordinates.length > 0 && <Polyline positions={routeCoordinates} color="#3b82f6" weight={5} opacity={0.8} />}
        </MapContainer>
      </div>
      {trackingDevice && <div className="tracking-panel">
        <div className="tracking-info">
          <h4>🔍 Tracking: {trackingDevice.name}</h4>
          {isLoadingRoute ? <p>🔄 Calculating route...</p> : <>
            {routeDistance && <p>📏 Distance: {routeDistance} km</p>}
            {routeDuration && <p>⏱️ Estimated time: {routeDuration} minutes</p>}
            <p style={{fontSize: '12px', color: '#666', marginTop: '10px'}}>{routeDuration ? '🚗 Route via roads' : '📐 Straight-line distance'}</p>
          </>}
        </div>
        <button onClick={stopTracking} className="stop-tracking-btn">⏹️ Stop Tracking</button>
      </div>}
    </div>
  );
}