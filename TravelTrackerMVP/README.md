# TravelTracker MVP

A minimalist application that allows you to import photos with geolocation data to track your travels. The app extracts geotags from your photos and displays your visited locations on a map with basic statistics.

## Project Structure

```
TravelTrackerMVP/
├── TravelTrackerApi/           # Backend (C# .NET Core)
│   ├── Controllers/            # API controllers
│   ├── Models/                 # Data models
│   └── Data/                   # Database context
└── travel-tracker-ui/          # Frontend (React)
    └── src/
        ├── components/         # React components
        └── ...                 # Other React files
```

## Features

- Photo upload and geotag extraction
- Interactive map visualization
- Basic travel statistics (countries, cities)
- Year-based filtering
- City clustering for map visualization
- Reverse geocoding via Google Maps API

## Getting Started

### Prerequisites

- .NET 8 SDK
- Node.js 16+
- NPM 8+
- Google Maps API Key (for reverse geocoding)

### API Configuration

To enable reverse geocoding (converting coordinates to city/country names), you need to:

1. Sign up for a Google Maps API key at [Google Cloud Console](https://console.cloud.google.com/)
2. Enable the Geocoding API in your Google Cloud project
3. Open `TravelTrackerApi/appsettings.json`
4. Replace "YOUR_API_KEY" with your actual API key:

```json
"GoogleMaps": {
  "ApiKey": "YOUR_ACTUAL_API_KEY"
}
```

If you don't add an API key, the application will still work but will use a simplified internal geocoding system for limited locations.

### Running the Backend

1. Navigate to the API project directory:

```
cd TravelTrackerApi
```

2. Run the API:

```
dotnet run
```

The API will start at https://localhost:5001 and http://localhost:5000.

### Running the Frontend

1. In a new terminal, navigate to the UI project directory:

```
cd travel-tracker-ui
```

2. Install dependencies:

```
npm install
```

3. Start the development server:

```
npm start
```

The React app will start at http://localhost:3000.

## Usage

1. Open the application in your browser at http://localhost:3000
2. Go to the "Upload Photos" page
3. Select and upload photos with geolocation data (like photos taken on smartphones)
4. View your visited locations on the map
5. See your travel statistics on the home page
6. Use the year filter to view data for specific years

## Testing the Geocoding API

After setting up your Google Maps API key, you can test it using the following endpoint:

```
GET http://localhost:5000/api/photos/test-geocoding
```

This will provide detailed information about the API connection, response, and fallback results.

## Technologies Used

- **Backend**: C# .NET Core, EF Core, SQLite
- **Frontend**: React, Leaflet for maps, Axios for API calls
- **Photo Processing**: MetadataExtractor library for EXIF data extraction
- **Geocoding**: Google Maps API for reverse geocoding 