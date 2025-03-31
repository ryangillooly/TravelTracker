import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Circle } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import axios from 'axios';
import L from 'leaflet';

// Fix marker icon issues in react-leaflet
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png',
});

function MapView() {
  const [locations, setLocations] = useState([]);
  const [year, setYear] = useState(null);
  const [loading, setLoading] = useState(true);
  
  // Generate year options from 2000 to current year
  const currentYear = new Date().getFullYear();
  const years = Array.from(
    { length: currentYear - 2000 + 1 }, 
    (_, i) => currentYear - i
  );
  
  useEffect(() => {
    const fetchLocations = async () => {
      setLoading(true);
      try {
        const url = `http://localhost:5000/api/statistics/locations?cluster=true${year ? `&year=${year}` : ''}`;
        const response = await axios.get(url);
        setLocations(response.data);
      } catch (error) {
        console.error('Failed to fetch locations:', error);
      } finally {
        setLoading(false);
      }
    };
    
    fetchLocations();
  }, [year]);

  // Function to determine marker size based on count
  const getMarkerSize = (count) => {
    // Base size - minimum radius
    const baseSize = 500;
    
    // Scale based on count - simple linear scaling
    return baseSize * Math.min(Math.sqrt(count), 5);
  };
  
  // Function to get color based on count
  const getMarkerColor = (count) => {
    if (count >= 10) return '#d73027'; // Red for 10+ photos
    if (count >= 5) return '#fc8d59';  // Orange for 5-9 photos
    if (count >= 3) return '#fee08b';  // Yellow for 3-4 photos
    if (count >= 2) return '#d9ef8b';  // Light green for 2 photos
    return '#91cf60';                  // Green for 1 photo
  };
  
  return (
    <div className="map-container">
      <h2>Your Travel Map</h2>
      
      <div className="map-controls">
        <select 
          value={year || ''} 
          onChange={(e) => setYear(e.target.value ? Number(e.target.value) : null)}
        >
          <option value="">All Years</option>
          {years.map(y => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
      </div>
      
      {loading ? (
        <p>Loading map data...</p>
      ) : (
        <div className="map-view">
          <MapContainer 
            center={[20, 0]} 
            zoom={2} 
            style={{ height: '100%', width: '100%' }}
          >
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            />
            
            {locations.map(location => (
              <React.Fragment key={location.id}>
                <Circle
                  center={[location.latitude, location.longitude]}
                  radius={getMarkerSize(location.count)}
                  pathOptions={{
                    fillColor: getMarkerColor(location.count),
                    fillOpacity: 0.6,
                    color: getMarkerColor(location.count),
                    weight: 1
                  }}
                />
                <Marker 
                  position={[location.latitude, location.longitude]}
                >
                  <Popup>
                    <div className="location-popup">
                      <h3>{location.city}, {location.country}</h3>
                      <p><strong>Photos:</strong> {location.count}</p>
                      <p><strong>Last visit:</strong> {new Date(location.captureDate).toLocaleDateString()}</p>
                      <p><strong>Coordinates:</strong> {location.latitude.toFixed(4)}, {location.longitude.toFixed(4)}</p>
                    </div>
                  </Popup>
                </Marker>
              </React.Fragment>
            ))}
          </MapContainer>
          
          <div className="map-legend">
            <h4>Location Sizes</h4>
            <div className="legend-item">
              <span className="legend-color" style={{ backgroundColor: '#d73027' }}></span>
              <span>10+ photos</span>
            </div>
            <div className="legend-item">
              <span className="legend-color" style={{ backgroundColor: '#fc8d59' }}></span>
              <span>5-9 photos</span>
            </div>
            <div className="legend-item">
              <span className="legend-color" style={{ backgroundColor: '#fee08b' }}></span>
              <span>3-4 photos</span>
            </div>
            <div className="legend-item">
              <span className="legend-color" style={{ backgroundColor: '#d9ef8b' }}></span>
              <span>2 photos</span>
            </div>
            <div className="legend-item">
              <span className="legend-color" style={{ backgroundColor: '#91cf60' }}></span>
              <span>1 photo</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default MapView; 