# TravelTracker

TravelTracker is an application that allows you to import photos from iCloud, extract geotags, and visualize your travel history. Track countries and cities visited with various time-based views (all-time, yearly, monthly).

## Features

- **iCloud Photo Import**: Import photos with geolocation data
- **Travel Mapping**: Interactive world map showing visited locations
- **Statistics**: Aggregated data about countries and cities visited
- **Time-based Views**: Filter your travel data by all-time, yearly, or monthly periods
- **Photo Galleries**: View your travel photos organized by location

## Technology Stack

### Backend
- C# .NET Core
- Entity Framework Core
- AWS Services:
  - RDS (PostgreSQL)
  - S3 (photo storage)
  - Lambda (photo processing)
  - Cognito (authentication)
  - API Gateway

### Frontend
- React with Next.js
- TypeScript
- Tailwind CSS
- Mapbox for interactive maps
- Chart.js for statistics

## Project Structure

```
TravelTracker/
├── backend/                        # C# .NET Core backend
│   ├── src/
│   │   ├── TravelTracker.API/      # API endpoints
│   │   ├── TravelTracker.Core/     # Domain models
│   │   ├── TravelTracker.Infrastructure/ # External integrations
│   │   └── TravelTracker.Application/ # Business logic
│   └── tests/                      # Test projects
├── frontend/                       # React frontend
│   ├── src/
│   │   ├── app/                    # Next.js pages
│   │   ├── components/             # Reusable components
│   │   ├── lib/                    # Utilities and hooks
│   │   └── store/                  # State management
│   └── public/                     # Static assets
└── docs/                           # Documentation
    ├── architecture.md             # System architecture
    ├── backend-architecture.md     # Backend design
    ├── frontend-architecture.md    # Frontend design
    ├── domain-models.md            # Core domain models
    └── icloud-integration.md       # iCloud integration details
```

## Getting Started

### Prerequisites

- .NET 7+ SDK
- Node.js 18+
- AWS Account with required services
- Docker (optional, for local development)

### Backend Setup

1. Clone the repository
2. Navigate to the backend directory
3. Update appsettings.json with your AWS credentials
4. Run the database migrations:
   ```
   dotnet ef database update
   ```
5. Start the API:
   ```
   dotnet run --project src/TravelTracker.API
   ```

### Frontend Setup

1. Navigate to the frontend directory
2. Install dependencies:
   ```
   npm install
   ```
3. Update environment variables in .env.local
4. Start the development server:
   ```
   npm run dev
   ```

## Architecture

TravelTracker follows a clean architecture approach:

- **Domain Layer**: Core business entities and logic
- **Application Layer**: Use cases and application services
- **Infrastructure Layer**: External service integrations
- **API Layer**: Controllers and endpoints
- **UI Layer**: React components and state management

For more details, see the architecture documentation in the `docs` directory.

## Key Components

- **Photo Import**: Integration with iCloud to extract photos with geolocation data
- **Geolocation Processing**: Matching coordinates to geographic entities
- **Visualization**: Interactive maps and statistical dashboards
- **User Management**: Authentication and personalized data

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- [Next.js](https://nextjs.org/) - React framework
- [Mapbox](https://www.mapbox.com/) - Maps and geocoding
- [Tailwind CSS](https://tailwindcss.com/) - Utility-first CSS framework
- [shadcn/ui](https://ui.shadcn.com/) - UI components 