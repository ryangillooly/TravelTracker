import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { 
  ComposableMap, 
  Geographies, 
  Geography, 
  ZoomableGroup, 
  Sphere,
  Graticule
} from "react-simple-maps";

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
  'Myanmar': ['Burma'],
  'Bosnia and Herzegovina': ['Bosnia'],
  'Côte d\'Ivoire': ['Ivory Coast'],
  'Democratic Republic of the Congo': ['Congo, Democratic Republic of the', 'DR Congo', 'DRC'],
  'Republic of the Congo': ['Congo'],
  'Eswatini': ['Swaziland'],
  'East Timor': ['Timor-Leste'],
  // Add more mappings as needed
};

// Countries that should never be considered matches for any country
// This is to prevent false positives in the matching algorithm
const nonMatchingCountries = [
  'Canada',
  'Brazil',
  'Alaska', // Not a country but might be in some GeoJSON
  'Mexico',
  'Russia',
  'China',
  'India',
  'Japan',
  'Australia',
  'Argentina',
  'Chile',
  'Peru',
  'Colombia',
  'Venezuela',
  'South Africa',
  'Egypt',
  'Nigeria',
  'Kenya',
  'Saudi Arabia',
  'Iran',
  'Pakistan',
  'Afghanistan',
  'Kazakhstan',
  'Mongolia'
];

// Expand the mapping to make it searchable in both directions
const expandedMapping = {};
Object.entries(countryNameMapping).forEach(([key, values]) => {
  expandedMapping[key.toLowerCase()] = [key.toLowerCase(), ...values.map(v => v.toLowerCase())];
  values.forEach(value => {
    expandedMapping[value.toLowerCase()] = [key.toLowerCase(), ...values.map(v => v.toLowerCase())];
  });
});

// GeoJSON map data source with better country borders
const WORLD_TOPO_JSON = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";

function WorldMapView() {
  const [visitedCountries, setVisitedCountries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [year, setYear] = useState(null);
  const [countryCities, setCountryCities] = useState({});
  const [tooltipContent, setTooltipContent] = useState("");
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 });
  const [showTooltip, setShowTooltip] = useState(false);

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

  // Function to check if a country name matches any variant in our mapping
  const matchesCountryName = (featureName, visitedName) => {
    // Early return for non-matching countries
    if (nonMatchingCountries.some(country => 
          country.toLowerCase() === featureName.toLowerCase() ||
          featureName.toLowerCase().includes(country.toLowerCase())
       )) {
      return false;
    }
    
    const featureNameLower = featureName.toLowerCase().trim();
    const visitedNameLower = visitedName.toLowerCase().trim();
    
    // Direct match
    if (featureNameLower === visitedNameLower) {
      return true;
    }
    
    // Check using expanded mapping
    const featureVariants = expandedMapping[featureNameLower] || [featureNameLower];
    const visitedVariants = expandedMapping[visitedNameLower] || [visitedNameLower];
    
    // More strict matching - require exact match or full word match
    return featureVariants.some(fv => 
      visitedVariants.some(vv => 
        fv === vv || 
        // Only match if it's a full word match, not partial
        (fv.includes(vv) && (
          fv === vv || 
          fv.startsWith(vv + ' ') || 
          fv.endsWith(' ' + vv) || 
          fv.includes(' ' + vv + ' ')
        )) ||
        (vv.includes(fv) && (
          vv === fv || 
          vv.startsWith(fv + ' ') || 
          vv.endsWith(' ' + fv) || 
          vv.includes(' ' + fv + ' ')
        ))
      )
    );
  };

  // Check if a country is visited
  const isCountryVisited = (featureName) => {
    // Early return for non-matching countries
    if (nonMatchingCountries.some(country => 
          country.toLowerCase() === featureName.toLowerCase() ||
          featureName.toLowerCase().includes(country.toLowerCase())
       )) {
      return false;
    }
    
    return visitedCountries.some(country => matchesCountryName(featureName, country));
  };

  // Get database country name from feature name for city lookup
  const getDbCountryName = (featureName) => {
    for (const country of visitedCountries) {
      if (matchesCountryName(featureName, country)) {
        return country;
      }
    }
    return featureName;
  };

  // Handle year change
  const handleYearChange = (e) => {
    setYear(e.target.value === 'all' ? null : parseInt(e.target.value));
  };
  
  // Count visited countries and calculate percentage
  const countVisitedCountries = () => {
    return visitedCountries.length;
  };
  
  // Total number of countries in the world (approximate)
  const totalCountries = 195;
  
  // Calculate percentage of countries visited
  const calculatePercentageVisited = () => {
    return ((countVisitedCountries() / totalCountries) * 100).toFixed(1);
  };

  // Handle tooltip display
  const handleMouseMove = (e) => {
    setTooltipPosition({ x: e.clientX, y: e.clientY });
  };
  
  // Handle mouse enter on country
  const handleMouseEnter = (geo) => {
    const countryName = geo.properties.name;
    const isVisited = isCountryVisited(countryName);
    const dbCountryName = getDbCountryName(countryName);
    const cities = countryCities[dbCountryName] || [];
    
    let content = `<div class="country-tooltip">
      <h3>${countryName}</h3>`;
      
    if (isVisited) {
      content += `<p>You've visited this country!</p>`;
      
      if (cities.length > 0) {
        content += `<p>Cities visited:</p><ul>`;
        cities.slice(0, 5).forEach(city => {
          content += `<li>${city}</li>`;
        });
        
        if (cities.length > 5) {
          content += `<li>...and ${cities.length - 5} more</li>`;
        }
        
        content += `</ul>`;
      }
    } else {
      content += `<p>You haven't visited this country yet.</p>`;
    }
    
    content += `</div>`;
    
    setTooltipContent(content);
    setShowTooltip(true);
  };
  
  // Handle mouse leave on country
  const handleMouseLeave = () => {
    setTooltipContent("");
    setShowTooltip(false);
  };

  return (
    <div className="world-map-container" onMouseMove={handleMouseMove}>
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
        <ComposableMap
          projection="geoEqualEarth"
          projectionConfig={{
            scale: 200,
          }}
          width={800}
          height={400}
          style={{ width: "100%", height: "100%" }}
        >
          <ZoomableGroup center={[0, 0]} zoom={1}>
            <Sphere stroke="#E4E5E6" strokeWidth={0.5} fill="#f9f9f9" />
            <Graticule stroke="#E4E5E6" strokeWidth={0.5} />
            <Geographies geography={WORLD_TOPO_JSON}>
              {({ geographies }) =>
                geographies.map(geo => {
                  const countryName = geo.properties.name;
                  const visited = isCountryVisited(countryName);
                  
                  return (
                    <Geography
                      key={geo.rsmKey}
                      geography={geo}
                      onMouseEnter={() => handleMouseEnter(geo)}
                      onMouseLeave={handleMouseLeave}
                      style={{
                        default: {
                          fill: visited ? "#ff9933" : "#ffffff",
                          stroke: visited ? "#e67300" : "#cccccc",
                          strokeWidth: visited ? 0.75 : 0.5,
                          outline: "none"
                        },
                        hover: {
                          fill: visited ? "#ffb366" : "#f0f0f0",
                          stroke: visited ? "#e67300" : "#999999",
                          strokeWidth: 1,
                          outline: "none"
                        },
                        pressed: {
                          fill: visited ? "#ff9933" : "#ffffff",
                          stroke: visited ? "#e67300" : "#cccccc",
                          strokeWidth: 0.75,
                          outline: "none"
                        }
                      }}
                    />
                  );
                })
              }
            </Geographies>
          </ZoomableGroup>
        </ComposableMap>
        
        {showTooltip && (
          <div
            className="tooltip-container"
            style={{
              position: "fixed",
              left: tooltipPosition.x + 10,
              top: tooltipPosition.y + 10,
              zIndex: 1000,
              pointerEvents: "none"
            }}
            dangerouslySetInnerHTML={{ __html: tooltipContent }}
          />
        )}
      </div>
      
      {!loading && (
        <div className="stats-summary">
          <p>You've visited <strong>{countVisitedCountries()}</strong> countries {year ? `in ${year}` : 'so far'} 
          (<strong>{calculatePercentageVisited()}%</strong> of countries worldwide).</p>
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