# TravelTracker - Architecture Documentation

## Overview
TravelTracker is an application that allows users to import photos from iCloud, extract geotags, and visualize travel statistics.
The application provides maps and aggregations showing countries, cities visited with different time-based views (total, yearly, monthly).

## System Architecture

### Backend Components (C# .NET Core)
1. **TravelTracker.API** - REST API endpoints and controllers
2. **TravelTracker.Core** - Domain models and business logic
3. **TravelTracker.Infrastructure** - External services integration (iCloud, maps)
4. **TravelTracker.Application** - Application services and use cases

### Frontend Components (React/Next.js)
1. **Pages & Routes** - Application pages and navigation
2. **Components** - Reusable UI components
3. **State Management** - Global state using React Context or Zustand
4. **Services** - API clients and external service integration

## Data Flow
1. User authenticates and grants iCloud access
2. App imports photos from iCloud and processes geotags
3. Geotag data is stored in the database with photo references
4. Frontend requests aggregated data based on selected time filters
5. Maps and statistics are displayed based on the data

## Key Features

### Photo Import
- iCloud API integration
- Batch processing of photos
- Geotag extraction
- Country/city identification from coordinates

### Map Visualization
- Interactive world map showing visited locations
- Color coding for visit frequency
- Time-based filtering (all-time, yearly, monthly)
- Drill-down capabilities (continent → country → city)

### Statistics & Aggregations
- Countries visited count
- Cities visited count
- Visits per month/year
- Most frequently visited locations
- Travel timeline

### User Experience
- Dashboard with key statistics
- Interactive maps
- Photo galleries by location
- Timeline view of travels

## Technical Specifications

### Backend
- C# .NET 7+
- Entity Framework Core
- Amazon RDS (PostgreSQL or SQL Server)
- REST API with JWT authentication
- AWS Lambda for background photo processing

### Frontend
- React with Next.js
- TypeScript
- Tailwind CSS for styling
- Mapbox or Leaflet for maps
- Chart.js for statistics visualization

## Deployment
- Backend: AWS Elastic Beanstalk or ECS with Fargate
- Frontend: AWS Amplify or S3 with CloudFront
- Database: Amazon RDS
- Storage: Amazon S3
- Authentication: Amazon Cognito
- API Gateway for REST endpoints
- CloudWatch for monitoring

## Security Considerations
- OAuth2 for authentication with Cognito
- AWS Secrets Manager for storing API keys
- HTTPS for all communications
- S3 server-side encryption for data at rest
- API Gateway rate limiting
- CSRF protection 