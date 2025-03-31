import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Circle, useMapEvents } from 'react-leaflet';
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

// Component to handle zoom changes
function ZoomHandler({ onZoomChange }) {
  const map = useMapEvents({
    zoomend: () => {
      const currentZoom = map.getZoom();
      onZoomChange(currentZoom);
    }
  });
  
  return null;
}

function MapView() {
  const [rawLocations, setRawLocations] = useState([]);
  const [year, setYear] = useState(null);
  const [loading, setLoading] = useState(true);
  const [zoomLevel, setZoomLevel] = useState(2);
  
  // Generate year options from 2000 to current year
  const currentYear = new Date().getFullYear();
  const years = Array.from(
    { length: currentYear - 2000 + 1 }, 
    (_, i) => currentYear - i
  );
  
  // Fetch all location data once (without clustering)
  const fetchLocations = useCallback(async () => {
    setLoading(true);
    try {
      const url = `http://localhost:5000/api/statistics/locations${year ? `?year=${year}` : ''}`;
      const response = await axios.get(url);
      setRawLocations(response.data);
    } catch (error) {
      console.error('Failed to fetch locations:', error);
    } finally {
      setLoading(false);
    }
  }, [year]);
  
  // Initial load and when year changes
  useEffect(() => {
    fetchLocations();
  }, [fetchLocations]);
  
  // Function to handle zoom level changes
  const handleZoomChange = useCallback((newZoom) => {
    setZoomLevel(newZoom);
  }, []);

  // Client-side clustering based on zoom level
  const locations = useMemo(() => {
    if (!rawLocations.length) return [];
    
    // Different clustering strategies based on zoom level
    if (zoomLevel <= 3) {
      // Country-level clustering
      const countryGroups = {};
      
      for (const location of rawLocations) {
        if (!location.country || location.country === 'Unknown') continue;
        
        const key = location.country;
        if (!countryGroups[key]) {
          countryGroups[key] = {
            id: `country-${key.toLowerCase().replace(/\s+/g, '-')}`,
            latitude: 0,
            longitude: 0,
            country: key,
            city: "",
            count: 0,
            points: [],
            detailLevel: 'country'
          };
        }
        
        countryGroups[key].points.push(location);
        countryGroups[key].count++;
      }
      
      // Calculate average coordinates and other stats
      const result = Object.values(countryGroups).map(group => {
        const avgLat = group.points.reduce((sum, loc) => sum + loc.latitude, 0) / group.points.length;
        const avgLng = group.points.reduce((sum, loc) => sum + loc.longitude, 0) / group.points.length;
        const uniqueCities = new Set(group.points.map(loc => loc.city).filter(c => c && c !== 'Unknown'));
        
        return {
          ...group,
          latitude: avgLat,
          longitude: avgLng,
          city: `${uniqueCities.size} cities`,
          captureDate: new Date(Math.max(...group.points.map(loc => new Date(loc.captureDate))))
        };
      });
      
      // Add unknown locations individually
      const unknownLocations = rawLocations
        .filter(loc => !loc.country || loc.country === 'Unknown')
        .map(loc => ({
          id: `location-${loc.id}`,
          latitude: loc.latitude,
          longitude: loc.longitude,
          country: 'Unknown',
          city: loc.city || 'Unknown location',
          count: 1,
          captureDate: new Date(loc.captureDate),
          detailLevel: 'point'
        }));
      
      return [...result, ...unknownLocations];
    } 
    else if (zoomLevel <= 6) {
      // City-level clustering
      const cityGroups = {};
      
      for (const location of rawLocations) {
        if (!location.city || location.city === 'Unknown') continue;
        
        const key = `${location.city}-${location.country || 'unknown'}`;
        if (!cityGroups[key]) {
          cityGroups[key] = {
            id: `city-${key.toLowerCase().replace(/\s+/g, '-')}`,
            latitude: 0,
            longitude: 0,
            country: location.country,
            city: location.city,
            count: 0,
            points: [],
            detailLevel: 'city'
          };
        }
        
        cityGroups[key].points.push(location);
        cityGroups[key].count++;
      }
      
      // Calculate average coordinates and other stats
      const result = Object.values(cityGroups).map(group => {
        const avgLat = group.points.reduce((sum, loc) => sum + loc.latitude, 0) / group.points.length;
        const avgLng = group.points.reduce((sum, loc) => sum + loc.longitude, 0) / group.points.length;
        
        return {
          ...group,
          latitude: avgLat,
          longitude: avgLng,
          captureDate: new Date(Math.max(...group.points.map(loc => new Date(loc.captureDate))))
        };
      });
      
      // Add unknown locations individually
      const unknownLocations = rawLocations
        .filter(loc => !loc.city || loc.city === 'Unknown')
        .map(loc => ({
          id: `location-${loc.id}`,
          latitude: loc.latitude,
          longitude: loc.longitude,
          country: loc.country || 'Unknown',
          city: 'Unknown location',
          count: 1,
          captureDate: new Date(loc.captureDate),
          detailLevel: 'point'
        }));
      
      return [...result, ...unknownLocations];
    }
    else if (zoomLevel <= 10) {
      // Area-level clustering (more precise)
      const precision = 0.05; // ~5km
      const areaGroups = {};
      
      for (const location of rawLocations) {
        // Round coordinates to group nearby locations
        const roundedLat = Math.round(location.latitude / precision) * precision;
        const roundedLng = Math.round(location.longitude / precision) * precision;
        const key = `${roundedLat}-${roundedLng}`;
        
        if (!areaGroups[key]) {
          areaGroups[key] = {
            id: `area-${roundedLat}-${roundedLng}`.replace(/\./g, 'p'),
            latitude: 0,
            longitude: 0,
            country: location.country,
            city: location.city,
            count: 0,
            points: [],
            detailLevel: 'area'
          };
        }
        
        areaGroups[key].points.push(location);
        areaGroups[key].count++;
      }
      
      // Calculate average coordinates and other stats
      return Object.values(areaGroups).map(group => {
        const avgLat = group.points.reduce((sum, loc) => sum + loc.latitude, 0) / group.points.length;
        const avgLng = group.points.reduce((sum, loc) => sum + loc.longitude, 0) / group.points.length;
        
        // For city and country, use the most common value
        const countryFreq = {};
        const cityFreq = {};
        
        group.points.forEach(loc => {
          if (loc.country) countryFreq[loc.country] = (countryFreq[loc.country] || 0) + 1;
          if (loc.city) cityFreq[loc.city] = (cityFreq[loc.city] || 0) + 1;
        });
        
        const country = Object.entries(countryFreq).sort((a, b) => b[1] - a[1])[0]?.[0] || 'Unknown';
        const city = Object.entries(cityFreq).sort((a, b) => b[1] - a[1])[0]?.[0] || 'Unknown';
        
        return {
          ...group,
          latitude: avgLat,
          longitude: avgLng,
          country,
          city,
          captureDate: new Date(Math.max(...group.points.map(loc => new Date(loc.captureDate))))
        };
      });
    }
    else {
      // High detail - use individual points or very small clusters
      const precision = 0.01; // ~1km
      const areaGroups = {};
      
      for (const location of rawLocations) {
        // Round coordinates to group very nearby locations
        const roundedLat = Math.round(location.latitude / precision) * precision;
        const roundedLng = Math.round(location.longitude / precision) * precision;
        const key = `${roundedLat}-${roundedLng}`;
        
        if (!areaGroups[key]) {
          areaGroups[key] = {
            id: `detail-${roundedLat}-${roundedLng}`.replace(/\./g, 'p'),
            latitude: 0,
            longitude: 0,
            country: location.country,
            city: location.city,
            count: 0,
            points: [],
            detailLevel: 'point'
          };
        }
        
        areaGroups[key].points.push(location);
        areaGroups[key].count++;
      }
      
      // Calculate average coordinates
      return Object.values(areaGroups).map(group => {
        const avgLat = group.points.reduce((sum, loc) => sum + loc.latitude, 0) / group.points.length;
        const avgLng = group.points.reduce((sum, loc) => sum + loc.longitude, 0) / group.points.length;
        
        return {
          ...group,
          latitude: avgLat,
          longitude: avgLng,
          captureDate: new Date(Math.max(...group.points.map(loc => new Date(loc.captureDate))))
        };
      });
    }
  }, [rawLocations, zoomLevel]);

  // Function to determine marker size based on count and detail level
  const getMarkerSize = (count, detailLevel) => {
    // Base size - minimum radius
    let baseSize = 500;
    
    // Adjust base size by detail level
    switch (detailLevel) {
      case 'country':
        baseSize = 700;
        break;
      case 'city':
        baseSize = 500;
        break;
      case 'area':
        baseSize = 300;
        break;
      case 'point':
        baseSize = 200;
        break;
      default:
        baseSize = 400;
    }
    
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
  
  // Get marker opacity based on detail level
  const getMarkerOpacity = (detailLevel) => {
    switch (detailLevel) {
      case 'country':
        return 0.6;
      case 'city':
        return 0.7;
      case 'area':
        return 0.8;
      case 'point':
        return 0.9;
      default:
        return 0.7;
    }
  };
  
  return (
    <div className="map-container">
      <h2>Your Travel Map</h2>
      
      <div className="map-controls" style={{ marginBottom: '10px', display: 'flex', alignItems: 'center' }}>
        <select 
          value={year || ''} 
          onChange={(e) => setYear(e.target.value ? Number(e.target.value) : null)}
          style={{ marginRight: '15px', padding: '5px 10px' }}
        >
          <option value="">All Years</option>
          {years.map(y => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
        <div className="zoom-info" style={{ 
          fontSize: '0.9rem', 
          backgroundColor: '#f5f5f5', 
          padding: '5px 10px', 
          borderRadius: '4px',
          border: '1px solid #ddd'
        }}>
          Zoom level: {zoomLevel} 
          <span className="zoom-hint" style={{ fontStyle: 'italic', marginLeft: '5px' }}>
            {zoomLevel <= 3 ? ' (Country view)' : 
             zoomLevel <= 6 ? ' (City view)' : 
             zoomLevel <= 10 ? ' (Area view)' : ' (Detail view)'}
          </span>
        </div>
      </div>
      
      {loading ? (
        <p>Loading map data...</p>
      ) : (
        <div className="map-view" style={{ position: 'relative', height: '70vh' }}>
          <MapContainer 
            center={[20, 0]} 
            zoom={2} 
            style={{ height: '100%', width: '100%' }}
            minZoom={2}
            maxZoom={18}
          >
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            />
            
            {/* Add zoom handler to detect zoom changes */}
            <ZoomHandler onZoomChange={handleZoomChange} />
            
            {locations.map(location => (
              <React.Fragment key={location.id}>
                <Circle
                  center={[location.latitude, location.longitude]}
                  radius={getMarkerSize(location.count, location.detailLevel)}
                  pathOptions={{
                    fillColor: getMarkerColor(location.count),
                    fillOpacity: getMarkerOpacity(location.detailLevel),
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
                      {location.detailLevel === 'country' && (
                        <p><em>Zoom in to see cities</em></p>
                      )}
                      {location.detailLevel === 'city' && (
                        <p><em>Zoom in to see more detail</em></p>
                      )}
                    </div>
                  </Popup>
                </Marker>
              </React.Fragment>
            ))}
          </MapContainer>
          
          <div className="map-legend" style={{
            position: 'absolute',
            right: '10px',
            bottom: '30px',
            backgroundColor: 'white',
            padding: '10px',
            borderRadius: '5px',
            boxShadow: '0 0 10px rgba(0,0,0,0.1)',
            zIndex: 1000,
            maxWidth: '200px',
            fontSize: '0.85rem'
          }}>
            <h4 style={{ marginTop: 0, marginBottom: '8px', borderBottom: '1px solid #eee', paddingBottom: '5px' }}>Location Sizes</h4>
            <div className="legend-item" style={{ display: 'flex', alignItems: 'center', marginBottom: '5px' }}>
              <span className="legend-color" style={{ 
                backgroundColor: '#d73027',
                display: 'inline-block',
                width: '16px',
                height: '16px',
                marginRight: '8px',
                borderRadius: '50%'
              }}></span>
              <span>10+ photos</span>
            </div>
            <div className="legend-item" style={{ display: 'flex', alignItems: 'center', marginBottom: '5px' }}>
              <span className="legend-color" style={{ 
                backgroundColor: '#fc8d59',
                display: 'inline-block',
                width: '16px',
                height: '16px',
                marginRight: '8px',
                borderRadius: '50%'
              }}></span>
              <span>5-9 photos</span>
            </div>
            <div className="legend-item" style={{ display: 'flex', alignItems: 'center', marginBottom: '5px' }}>
              <span className="legend-color" style={{ 
                backgroundColor: '#fee08b',
                display: 'inline-block',
                width: '16px',
                height: '16px',
                marginRight: '8px',
                borderRadius: '50%'
              }}></span>
              <span>3-4 photos</span>
            </div>
            <div className="legend-item" style={{ display: 'flex', alignItems: 'center', marginBottom: '5px' }}>
              <span className="legend-color" style={{ 
                backgroundColor: '#d9ef8b',
                display: 'inline-block',
                width: '16px',
                height: '16px',
                marginRight: '8px',
                borderRadius: '50%'
              }}></span>
              <span>2 photos</span>
            </div>
            <div className="legend-item" style={{ display: 'flex', alignItems: 'center', marginBottom: '10px' }}>
              <span className="legend-color" style={{ 
                backgroundColor: '#91cf60',
                display: 'inline-block',
                width: '16px',
                height: '16px',
                marginRight: '8px',
                borderRadius: '50%'
              }}></span>
              <span>1 photo</span>
            </div>
            <h4 style={{ marginBottom: '8px', borderBottom: '1px solid #eee', paddingBottom: '5px' }}>Zoom Levels</h4>
            <div className="legend-item" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
              <span style={{ fontWeight: 'bold' }}>0-3:</span> <span>Country view</span>
            </div>
            <div className="legend-item" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
              <span style={{ fontWeight: 'bold' }}>4-6:</span> <span>City view</span>
            </div>
            <div className="legend-item" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
              <span style={{ fontWeight: 'bold' }}>7-10:</span> <span>Area view</span>
            </div>
            <div className="legend-item" style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontWeight: 'bold' }}>11+:</span> <span>Detail view</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default MapView; 