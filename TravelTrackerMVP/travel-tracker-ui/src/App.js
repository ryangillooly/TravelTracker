import React from 'react';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import './App.css';

// Import our components
import UploadPage from './components/UploadPage';
import MapView from './components/MapView';
import StatsView from './components/StatsView';

function App() {
  return (
    <Router>
      <div className="App">
        <header className="App-header">
          <h1>TravelTracker</h1>
          <nav>
            <ul>
              <li><Link to="/">Home</Link></li>
              <li><Link to="/upload">Upload Photos</Link></li>
              <li><Link to="/map">View Map</Link></li>
            </ul>
          </nav>
        </header>
        
        <main>
          <Routes>
            <Route path="/" element={<StatsView />} />
            <Route path="/upload" element={<UploadPage />} />
            <Route path="/map" element={<MapView />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
}

export default App; 