import React, { useState } from 'react';
import axios from 'axios';

function UploadPage() {
  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [results, setResults] = useState(null);
  const [directoryPath, setDirectoryPath] = useState('');
  const [importStatus, setImportStatus] = useState('');
  const [isDirectoryImport, setIsDirectoryImport] = useState(true); // Default to directory import
  const [monthsToImport, setMonthsToImport] = useState(2);
  const [maxImages, setMaxImages] = useState('');
  const [limitEnabled, setLimitEnabled] = useState(false);
  
  const handleFileChange = (e) => {
    setFiles(Array.from(e.target.files));
  };
  
  const handleUpload = async () => {
    if (isDirectoryImport) {
      await handleDirectoryImport();
    } else {
      await handleFileUpload();
    }
  };

  const handleFileUpload = async () => {
    if (files.length === 0) return;
    
    setUploading(true);
    setImportStatus('Uploading and processing photos...');
    
    const formData = new FormData();
    files.forEach(file => {
      formData.append('files', file);
    });
    
    try {
      const response = await axios.post('http://localhost:5000/api/photos/process', formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });
      
      setResults(response.data);
      if (response.data.updated > 0) {
        setImportStatus(`Import completed successfully! Added ${response.data.new} new locations and updated ${response.data.updated} existing locations.`);
      } else {
        setImportStatus(`Import completed successfully! Added ${response.data.new} new locations.`);
      }
    } catch (error) {
      console.error('Upload failed:', error);
      setImportStatus('Failed to process photos. Please try again.');
      alert('Failed to process photos. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const handleDirectoryImport = async () => {
    if (!directoryPath) {
      alert('Please enter a directory path.');
      return;
    }
    
    setUploading(true);
    setImportStatus('Processing photos from directory...');
    
    try {
      const response = await axios.post('http://localhost:5000/api/photos/process-directory', {
        directoryPath: directoryPath,
        fromDate: new Date(Date.now() - (monthsToImport * 30 * 24 * 60 * 60 * 1000)).toISOString(),
        toDate: new Date().toISOString(),
        includeSubDirectories: true,
        maxImages: limitEnabled && maxImages ? parseInt(maxImages) : null
      });
      
      setResults(response.data);
      if (response.data.updated > 0) {
        setImportStatus(`Successfully processed photos from ${directoryPath}. Added ${response.data.new} new locations and updated ${response.data.updated} existing locations.`);
      } else {
        setImportStatus(`Successfully processed photos from ${directoryPath}. Added ${response.data.new} new locations.`);
      }
    } catch (error) {
      console.error('Directory import failed:', error);
      if (error.response) {
        setImportStatus(`Failed: ${error.response.data}`);
        alert(`Failed to process directory: ${error.response.data}`);
      } else {
        setImportStatus('Failed to process directory. Please check path and try again.');
        alert('Failed to process directory. Please try again.');
      }
    } finally {
      setUploading(false);
    }
  };

  const handleRecentPhotosImport = async () => {
    setUploading(true);
    setImportStatus(`Processing photos from the last ${monthsToImport} months...`);
    
    try {
      const response = await axios.post('http://localhost:5000/api/photos/recent-photos', {
        libraryPath: directoryPath.endsWith('.photoslibrary') ? directoryPath : '',
        months: monthsToImport,
        maxImages: limitEnabled && maxImages ? parseInt(maxImages) : null
      });
      
      setResults(response.data);
      
      let statusMessage = `Successfully processed recent photos from the last ${monthsToImport} months.`;
      if (limitEnabled && maxImages) {
        statusMessage += ` Limited to the ${maxImages} most recent images.`;
      }
      
      if (response.data.updated > 0) {
        statusMessage += ` Added ${response.data.new} new locations and updated ${response.data.updated} existing locations.`;
      } else {
        statusMessage += ` Added ${response.data.new} new locations.`;
      }
      
      setImportStatus(statusMessage);
    } catch (error) {
      console.error('Recent photos import failed:', error);
      if (error.response) {
        setImportStatus(`Failed: ${error.response.data}`);
        alert(`Failed to process recent photos: ${error.response.data}`);
      } else {
        setImportStatus('Failed to process recent photos. Please try again.');
        alert('Failed to process recent photos. Please try again.');
      }
    } finally {
      setUploading(false);
    }
  };

  const handleDirectoryPathChange = (e) => {
    setDirectoryPath(e.target.value);
  };

  const handleMonthsChange = (e) => {
    setMonthsToImport(parseInt(e.target.value) || 2);
  };
  
  const handleMaxImagesChange = (e) => {
    const value = e.target.value;
    // Only allow positive integers
    if (value === '' || /^\d+$/.test(value)) {
      setMaxImages(value);
    }
  };
  
  const toggleLimitEnabled = () => {
    setLimitEnabled(!limitEnabled);
    // If enabling the limit and no value set, default to 100
    if (!limitEnabled && !maxImages) {
      setMaxImages('100');
    }
  };

  const handleImportTypeChange = (e) => {
    setIsDirectoryImport(e.target.value === 'directory');
    setResults(null);
    setImportStatus('');
  };

  const getCommonPhotoPath = (path) => {
    const username = window.prompt('Please enter your macOS username:', '');
    if (!username) return;
    return path.replace('{username}', username);
  };

  const getICloudPhotoLibraryPath = () => {
    const path = getCommonPhotoPath('/Users/{username}/Pictures/Photos Library.photoslibrary');
    if (path) setDirectoryPath(path);
  };
  
  const getICloudPhotoPath = () => {
    const path = getCommonPhotoPath('/Users/{username}/Library/Mobile Documents/com~apple~CloudDocs/Photos');
    if (path) setDirectoryPath(path);
  };

  const getDownloadsPath = () => {
    const path = getCommonPhotoPath('/Users/{username}/Downloads');
    if (path) setDirectoryPath(path);
  };
  
  return (
    <div className="upload-container">
      <h2>Import Photos</h2>
      
      <div className="import-type-selector">
        <label>
          <input 
            type="radio" 
            name="importType" 
            value="directory" 
            checked={isDirectoryImport} 
            onChange={handleImportTypeChange}
          /> 
          Import from Photos Library or Directory
        </label>
        <label>
          <input 
            type="radio" 
            name="importType" 
            value="files" 
            checked={!isDirectoryImport} 
            onChange={handleImportTypeChange}
          /> 
          Upload Individual Files
        </label>
      </div>

      {isDirectoryImport ? (
        <div className="directory-import-section">
          <p>Select your Photos Library or another photo directory.</p>
          
          <div className="icloud-buttons">
            <button 
              onClick={getICloudPhotoLibraryPath}
              type="button"
              className="icloud-button"
            >
              Use Photos Library
            </button>
            <button 
              onClick={getICloudPhotoPath}
              type="button"
              className="icloud-button"
            >
              Use iCloud Drive Photos
            </button>
            <button 
              onClick={getDownloadsPath}
              type="button"
              className="icloud-button"
            >
              Use Downloads Folder
            </button>
          </div>
          
          <div className="directory-path-input">
            <input 
              type="text" 
              placeholder="/path/to/Photos Library.photoslibrary" 
              value={directoryPath}
              onChange={handleDirectoryPathChange}
              disabled={uploading}
              className="directory-input"
            />
          </div>
          
          <div className="filters-container">
            <div className="date-filter">
              <label htmlFor="months-filter">Import photos from the last:</label>
              <select 
                id="months-filter"
                value={monthsToImport}
                onChange={handleMonthsChange}
                disabled={uploading}
                className="months-select"
              >
                <option value="1">1 month</option>
                <option value="2">2 months</option>
                <option value="3">3 months</option>
                <option value="6">6 months</option>
                <option value="12">12 months (1 year)</option>
                <option value="24">24 months (2 years)</option>
                <option value="36">36 months (3 years)</option>
                <option value="48">48 months (4 years)</option>
                <option value="60">60 months (5 years)</option>
                <option value="72">72 months (6 years)</option>
                <option value="84">84 months (7 years)</option>
                <option value="96">96 months (8 years)</option>
                <option value="108">108 months (9 years)</option>
                <option value="120">120 months (10 years)</option>
                <option value="132">132 months (11 years)</option>
                <option value="144">144 months (12 years)</option>
                <option value="156">156 months (13 years)</option>
                <option value="168">168 months (14 years)</option>
                <option value="180">180 months (15 years)</option>
                <option value="192">192 months (16 years)</option>
                <option value="204">204 months (17 years)</option>
                <option value="216">216 months (18 years)</option>
                <option value="228">228 months (19 years)</option>
                <option value="240">240 months (20 years)</option>
              </select>
            </div>
            
            <div className="limit-filter">
              <label className="limit-checkbox-label">
                <input 
                  type="checkbox" 
                  checked={limitEnabled}
                  onChange={toggleLimitEnabled}
                  disabled={uploading}
                />
                Limit to most recent:
              </label>
              <input
                type="text"
                className="limit-input"
                value={maxImages}
                onChange={handleMaxImagesChange}
                disabled={!limitEnabled || uploading}
                placeholder="100"
              />
              <span className="limit-label">images</span>
            </div>
          </div>
          
          <div className="import-buttons">
            <button 
              onClick={handleUpload} 
              disabled={uploading || !directoryPath}
              className="process-btn"
            >
              {uploading ? 'Processing...' : 'Process Directory'}
            </button>
            
            <button 
              onClick={handleRecentPhotosImport}
              disabled={uploading}
              className="recent-photos-btn"
            >
              Import Recent Photos
            </button>
          </div>
          
          <div className="icloud-instructions">
            <h3>How to access your photos locally:</h3>
            <ol>
              <li><strong>From Photos Library (Recommended)</strong>: Uses your macOS Photos Library, which contains all photos including those from iCloud.</li>
              <li><strong>Location</strong>: <code>~/Pictures/Photos Library.photoslibrary</code></li>
              <li><strong>From iCloud Drive</strong>: If you've saved photos to a folder in iCloud Drive.</li>
              <li><strong>From Downloads</strong>: If you've exported photos from Photos app to your Downloads folder.</li>
              <li><strong>Manual export option</strong>: 
                <ul>
                  <li>Open Photos app</li>
                  <li>Select photos you want to track</li>
                  <li>File → Export → Export Unmodified Original</li>
                  <li>Save to Downloads or another folder</li>
                  <li>Enter that folder path here</li>
                </ul>
              </li>
            </ol>
            <div className="note">
              <strong>Note:</strong> The app needs file system access to read your photos. On newer macOS versions, you may need to grant permission when prompted.
            </div>
          </div>
        </div>
      ) : (
        <div className="file-upload-section">
          <p>Select photos with geolocation data to track your travels.</p>
          
          <input 
            type="file" 
            multiple 
            accept="image/*" 
            onChange={handleFileChange}
            disabled={uploading}
            className="file-input"
          />
          <div className="selected-files">
            {files.length > 0 && (
              <p>{files.length} file(s) selected</p>
            )}
          </div>
          
          <button 
            onClick={handleUpload} 
            disabled={uploading || files.length === 0}
            className="process-btn"
          >
            {uploading ? 'Processing...' : 'Process Photos'}
          </button>
        </div>
      )}
      
      {importStatus && (
        <div className={`import-status ${importStatus.includes('Failed') ? 'error' : ''}`}>
          {importStatus}
        </div>
      )}
      
      {results && (
        <div className="results">
          <h3>Import Results</h3>
          <div className="import-summary">
            <div className="summary-item">
              <span className="summary-label">Processed:</span>
              <span className="summary-value">{results.processed} photos</span>
            </div>
            <div className="summary-item">
              <span className="summary-label">Found:</span>
              <span className="summary-value">{results.locationsFound} locations</span>
            </div>
            {results.new !== undefined && (
              <div className="summary-item">
                <span className="summary-label">New:</span>
                <span className="summary-value">{results.new} locations</span>
              </div>
            )}
            {results.updated !== undefined && results.updated > 0 && (
              <div className="summary-item updated">
                <span className="summary-label">Updated:</span>
                <span className="summary-value">{results.updated} locations</span>
              </div>
            )}
            {results.skippedForDate !== undefined && (
              <div className="summary-item">
                <span className="summary-label">Skipped:</span>
                <span className="summary-value">{results.skippedForDate} photos (outside date range)</span>
              </div>
            )}
          </div>
          
          {results.dateRange && (
            <p>Date range: {new Date(results.dateRange.from).toLocaleDateString()} to {new Date(results.dateRange.to).toLocaleDateString()}</p>
          )}
          {isDirectoryImport && results.directoryPath && (
            <p>Source: {results.directoryPath}</p>
          )}
          {results.locationsFound > 0 ? (
            <div>
              <p>Locations found:</p>
              <ul className="locations-list">
                {results.locations.map((location, index) => (
                  <li key={index}>
                    {location.city && location.city !== 'Unknown' ? location.city : ''} 
                    {location.country && location.country !== 'Unknown' ? location.country : 'Unknown location'} 
                    ({location.latitude.toFixed(4)}, {location.longitude.toFixed(4)})
                    {location.captureDate && ` - ${new Date(location.captureDate).toLocaleDateString()}`}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="no-locations">
              <p>No locations with geotags were found. Make sure your photos have location data.</p>
              <p>Tips:</p>
              <ul>
                <li>Check that location services were enabled when taking photos</li>
                <li>Some older photos or screenshots may not have location data</li>
                <li>Try selecting a different folder with travel photos</li>
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default UploadPage; 