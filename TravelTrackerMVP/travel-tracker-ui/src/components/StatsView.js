import React, { useState, useEffect } from 'react';
import axios from 'axios';

function StatsView() {
  const [stats, setStats] = useState(null);
  const [year, setYear] = useState(null);
  const [loading, setLoading] = useState(true);
  const [clearing, setClearing] = useState(false);
  const [clearSuccess, setClearSuccess] = useState(false);
  
  // Generate year options from 2000 to current year
  const currentYear = new Date().getFullYear();
  const years = Array.from(
    { length: currentYear - 2000 + 1 }, 
    (_, i) => currentYear - i
  );
  
  useEffect(() => {
    const fetchStats = async () => {
      setLoading(true);
      try {
        const url = `http://localhost:5000/api/statistics${year ? `?year=${year}` : ''}`;
        const response = await axios.get(url);
        setStats(response.data);
      } catch (error) {
        console.error('Failed to fetch statistics:', error);
      } finally {
        setLoading(false);
      }
    };
    
    fetchStats();
    
    // Reset success message after 3 seconds
    if (clearSuccess) {
      const timer = setTimeout(() => {
        setClearSuccess(false);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [year, clearSuccess]);
  
  const handleClearData = async () => {
    // Show confirmation dialog
    const confirmed = window.confirm(
      "Are you sure you want to clear all data? This action cannot be undone."
    );
    
    if (confirmed) {
      setClearing(true);
      try {
        await axios.delete('http://localhost:5000/api/statistics/clear-all-data');
        setClearSuccess(true);
        setStats(null); // Clear stats locally
      } catch (error) {
        console.error('Failed to clear data:', error);
        alert('Failed to clear data. Please try again.');
      } finally {
        setClearing(false);
      }
    }
  };
  
  return (
    <div className="stats-container">
      <h2>Travel Statistics {year ? `for ${year}` : ''}</h2>
      
      <div className="stats-controls">
        <select 
          value={year || ''} 
          onChange={(e) => setYear(e.target.value ? Number(e.target.value) : null)}
        >
          <option value="">All Years</option>
          {years.map(y => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
        
        <button 
          className="clear-data-button" 
          onClick={handleClearData}
          disabled={clearing || !stats}
        >
          {clearing ? 'Clearing...' : 'Clear All Data'}
        </button>
        
        {clearSuccess && (
          <div className="success-message">All data cleared successfully!</div>
        )}
      </div>
      
      {loading ? (
        <p>Loading statistics...</p>
      ) : stats ? (
        <div className="stats-grid">
          <div className="stat-card">
            <h3>Countries Visited</h3>
            <div className="stat-value">{stats.countriesCount}</div>
            <div className="stat-list">
              {stats.countries.map((country, index) => (
                <div key={index} className="stat-item">{country}</div>
              ))}
            </div>
          </div>
          
          <div className="stat-card">
            <h3>Cities Visited</h3>
            <div className="stat-value">{stats.citiesCount}</div>
          </div>
          
          <div className="stat-card">
            <h3>Photos</h3>
            <div className="stat-value">{stats.photosCount}</div>
          </div>
        </div>
      ) : (
        <p>No data available. Upload some photos to see your statistics!</p>
      )}
    </div>
  );
}

export default StatsView; 