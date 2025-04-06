import React, { useState, useEffect } from 'react';
import axios from 'axios';
import L from 'leaflet';
import { MapContainer, TileLayer, GeoJSON, Tooltip } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

// Country name mapping to handle differences between database and GeoJSON
const countryNameMapping = {
  'United States': ['United States of America', 'USA', 'US'],
  'United Kingdom': ['UK', 'Great Britain', 'Britain'],
  'Russia': ['Russian Federation'],
  'South Korea': ['Korea, Republic of', 'Korea Republic', 'Republic of Korea'],
  'North Korea': ['Korea, Democratic People\'s Republic of', 'Democratic People\'s Republic of Korea'],
  'Vietnam': ['Viet Nam'],
  'Syria': ['Syrian Arab Republic'],
  'Venezuela': ['Venezuela, Bolivarian Republic of'],
  'Iran': ['Iran, Islamic Republic of'],
  'Taiwan': ['Taiwan, Province of China'],
  'Tanzania': ['Tanzania, United Republic of'],
  'Czech Republic': ['Czechia'],
  'Macedonia': ['North Macedonia'],
  'Bolivia': ['Bolivia, Plurinational State of'],
  'Laos': ['Lao People\'s Democratic Republic'],
  // Add more mappings as needed
};

// Expand the mapping to make it searchable in both directions
const expandedMapping = {};
Object.entries(countryNameMapping).forEach(([key, values]) => {
  expandedMapping[key.toLowerCase()] = [key.toLowerCase(), ...values.map(v => v.toLowerCase())];
  values.forEach(value => {
    expandedMapping[value.toLowerCase()] = [key.toLowerCase(), ...values.map(v => v.toLowerCase())];
  });
});

function WorldMapView() {
  const [visitedCountries, setVisitedCountries] = useState([]);
  const [countryGeoData, setCountryGeoData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [year, setYear] = useState(null);
  const [countryCities, setCountryCities] = useState({});

  // Generate year options from 2000 to current year
  const currentYear = new Date().getFullYear();
  const years = Array.from(
    { length: currentYear - 2000 + 1 }, 
    (_, i) => currentYear - i
  );

  // Fetch the list of countries the user has visited
  useEffect(() => {
    const fetchVisitedCountries = async () => {
      setLoading(true);
      try {
        const url = `http://localhost:5000/api/statistics${year ? `?year=${year}` : ''}`;
        const response = await axios.get(url);
        setVisitedCountries(response.data.countries || []);
        
        // Also get locations to build country-city relationship
        const locationsUrl = `http://localhost:5000/api/statistics/locations${year ? `?year=${year}` : ''}`;
        const locationsResponse = await axios.get(locationsUrl);
        
        // Build country to cities mapping
        const cityMap = {};
        locationsResponse.data.forEach(location => {
          if (location.country && location.city && location.city !== 'Unknown') {
            if (!cityMap[location.country]) {
              cityMap[location.country] = new Set();
            }
            cityMap[location.country].add(location.city);
          }
        });
        
        // Convert sets to arrays
        const result = {};
        Object.entries(cityMap).forEach(([country, cities]) => {
          result[country] = Array.from(cities);
        });
        
        setCountryCities(result);
      } catch (error) {
        console.error('Failed to fetch visited countries:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchVisitedCountries();
  }, [year]);

  // Fetch the GeoJSON data for all countries
  useEffect(() => {
    const fetchGeoData = async () => {
      try {
        // Fetch world country boundaries GeoJSON
        const response = await fetch('https://raw.githubusercontent.com/holtzy/D3-graph-gallery/master/DATA/world.geojson');
        const data = await response.json();
        setCountryGeoData(data);
      } catch (error) {
        console.error('Failed to fetch GeoJSON data:', error);
      }
    };

    fetchGeoData();
  }, []);

  // Function to check if a country name matches any variant in our mapping
  const matchesCountryName = (featureName, visitedName) => {
    const featureNameLower = featureName.toLowerCase();
    const visitedNameLower = visitedName.toLowerCase();
    
    // Direct match
    if (featureNameLower === visitedNameLower) {
      return true;
    }
    
    // Check using expanded mapping
    const featureVariants = expandedMapping[featureNameLower] || [featureNameLower];
    const visitedVariants = expandedMapping[visitedNameLower] || [visitedNameLower];
    
    // Check if any variant of featureName matches any variant of visitedName
    return featureVariants.some(fv => 
      visitedVariants.some(vv => 
        fv === vv || fv.includes(vv) || vv.includes(fv)
      )
    );
  };

  // Get database country name from feature name
  const getDbCountryName = (featureName) => {
    for (const country of visitedCountries) {
      if (matchesCountryName(featureName, country)) {
        return country;
      }
    }
    return featureName;
  };

  // Style function for the GeoJSON layer
  const countryStyle = (feature) => {
    // Check if this country is in the visited list
    const isVisited = visitedCountries.some(country => 
      matchesCountryName(feature.properties.name, country)
    );

    return {
      fillColor: isVisited ? '#ff9933' : '#ffffff', // Orange for visited, white for not visited
      weight: 1,
      opacity: 1,
      color: '#cccccc', // Border color
      fillOpacity: isVisited ? 0.7 : 0.1 // More opacity for visited countries
    };
  };

  // Handle year change
  const handleYearChange = (e) => {
    setYear(e.target.value === 'all' ? null : parseInt(e.target.value));
  };
  
  // Count actual visited countries based on GeoJSON data
  const countVisitedCountriesOnMap = () => {
    if (!countryGeoData || !visitedCountries.length) return 0;
    
    return countryGeoData.features.filter(feature => 
      visitedCountries.some(country => 
        matchesCountryName(feature.properties.name, country)
      )
    ).length;
  };
  
  // Event handlers for GeoJSON features
  const onEachCountry = (feature, layer) => {
    const isVisited = visitedCountries.some(country => 
      matchesCountryName(feature.properties.name, country)
    );
    
    // Country name as shown in our database
    const dbCountryName = getDbCountryName(feature.properties.name);
    
    // Get cities for this country
    const cities = countryCities[dbCountryName] || [];
    
    // Add tooltip
    layer.bindTooltip(`
      <div class="country-tooltip">
        <h3>${feature.properties.name}</h3>
        ${isVisited ? `
          <p>You've visited this country!</p>
          ${cities.length > 0 ? `
            <p>Cities visited:</p>
            <ul>
              ${cities.slice(0, 5).map(city => `<li>${city}</li>`).join('')}
              ${cities.length > 5 ? `<li>...and ${cities.length - 5} more</li>` : ''}
            </ul>
          ` : ''}
        ` : '<p>You haven\'t visited this country yet.</p>'}
      </div>
    `);
  };

  return (
    <div className="world-map-container">
      <h2>Countries You've Visited</h2>
      
      <div className="filter-controls">
        <label htmlFor="yearFilter">Filter by Year: </label>
        <select 
          id="yearFilter" 
          value={year || 'all'} 
          onChange={handleYearChange}
        >
          <option value="all">All Years</option>
          {years.map(y => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
      </div>
      
      {loading && <div className="loading">Loading data...</div>}
      
      <div className="map-wrapper" style={{ height: '500px', width: '100%' }}>
        {countryGeoData && (
          <MapContainer 
            center={[20, 0]} 
            zoom={2} 
            style={{ height: '100%', width: '100%' }}
            minZoom={2}
            maxZoom={5} // Limit zoom since this is meant to be a country-level view
            scrollWheelZoom={true}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              opacity={0.5} // Lighter map tiles to let the country colors stand out
            />
            <GeoJSON 
              data={countryGeoData} 
              style={countryStyle}
              onEachFeature={onEachCountry}
            />
          </MapContainer>
        )}
      </div>
      
      {!loading && (
        <div className="stats-summary">
          <p>You've visited <strong>{countVisitedCountriesOnMap()}</strong> countries {year ? `in ${year}` : 'so far'}.</p>
          <div className="country-list">
            {visitedCountries.sort().map(country => (
              <span key={country} className="country-tag">{country}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default WorldMapView; 