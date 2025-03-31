# TravelTracker - Frontend Architecture

## Overview
The TravelTracker frontend is built using React with Next.js, TypeScript, and Tailwind CSS. It provides an intuitive interface for users to visualize their travel history based on photo geotags.

## Directory Structure

```
frontend/
  ├── src/
  │   ├── app/                   # Next.js App Router
  │   │   ├── (auth)/            # Auth-related routes
  │   │   │   ├── login/
  │   │   │   ├── register/
  │   │   │   └── layout.tsx
  │   │   ├── dashboard/         # Main dashboard
  │   │   ├── photos/            # Photo management
  │   │   ├── map/               # Map visualization
  │   │   │   ├── [view]/        # View types (total, yearly, monthly)
  │   │   ├── trips/             # Trip management
  │   │   ├── settings/          # User settings
  │   │   ├── api/               # API routes
  │   │   └── layout.tsx         # Root layout
  │   ├── components/            # Reusable components
  │   │   ├── ui/                # UI components (shadcn)
  │   │   ├── map/               # Map-related components
  │   │   ├── stats/             # Statistics components
  │   │   ├── photos/            # Photo-related components
  │   │   └── layout/            # Layout components
  │   ├── lib/                   # Utility libraries
  │   │   ├── api/               # API client
  │   │   ├── hooks/             # Custom hooks
  │   │   ├── utils/             # Utility functions
  │   │   └── types/             # TypeScript types
  │   └── store/                 # State management
  └── public/                    # Static assets
```

## Key Components

### Core UI Components

1. **Dashboard**
   - `DashboardSummary`: Overview of travel statistics
   - `RecentPhotosGrid`: Grid of recently imported photos
   - `CountryList`: List of visited countries with counts
   - `MiniMap`: Small interactive map overview

2. **Map Visualization**
   - `WorldMap`: Primary map component using Mapbox/Leaflet
   - `MapControls`: Zoom, filter controls for map
   - `LocationPopup`: Popup showing location details
   - `TimePeriodSelector`: Controls for total/yearly/monthly views

3. **Photo Management**
   - `PhotoGallery`: Grid view of imported photos
   - `PhotoDetail`: Detailed view of individual photo
   - `ImportControls`: Controls for iCloud import
   - `BatchActions`: Batch operations for photos

4. **Statistics**
   - `StatsCard`: Reusable card component for statistics
   - `VisitChart`: Chart showing visits over time
   - `CountryComparisonChart`: Compare countries visited
   - `YearlyStatsComparison`: Year-to-year comparison

### Layout Components

1. **AppShell**: Main application shell with navigation
2. **Sidebar**: Navigation sidebar with collapsible sections
3. **TopNavigation**: Top navigation bar with user profile
4. **MobileNavigation**: Responsive mobile navigation menu

## State Management

Using Zustand for global state management:

```typescript
// src/store/useMapStore.ts
import { create } from 'zustand';

type MapView = 'total' | 'yearly' | 'monthly';

interface MapState {
  view: MapView;
  year: number | null;
  month: number | null;
  filters: {
    showCities: boolean;
    showPhotos: boolean;
    minDate: Date | null;
    maxDate: Date | null;
  };
  setView: (view: MapView) => void;
  setYear: (year: number | null) => void;
  setMonth: (month: number | null) => void;
  setFilters: (filters: Partial<MapState['filters']>) => void;
}

export const useMapStore = create<MapState>((set) => ({
  view: 'total',
  year: null,
  month: null,
  filters: {
    showCities: true,
    showPhotos: true,
    minDate: null,
    maxDate: null,
  },
  setView: (view) => set({ view }),
  setYear: (year) => set({ year }),
  setMonth: (month) => set({ month }),
  setFilters: (filters) => set((state) => ({
    filters: { ...state.filters, ...filters }
  })),
}));
```

## Data Fetching

Using React Query for API data fetching:

```typescript
// src/lib/hooks/useTravelStats.ts
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { TravelStatistics } from '@/lib/types';

export function useTravelStats(view: 'total' | 'yearly' | 'monthly', year?: number, month?: number) {
  return useQuery({
    queryKey: ['stats', view, year, month],
    queryFn: async () => {
      const params = new URLSearchParams();
      
      if (view !== 'total') {
        params.append('view', view);
        if (year) params.append('year', year.toString());
        if (month) params.append('month', month.toString());
      }
      
      return api.get<TravelStatistics>(`/stats?${params.toString()}`);
    },
  });
}
```

## Map Integration

Using Mapbox GL for interactive maps:

```typescript
// src/components/map/WorldMap.tsx
'use client';

import { useRef, useEffect } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { useMapStore } from '@/store/useMapStore';
import { useVisitedLocations } from '@/lib/hooks/useVisitedLocations';

export function WorldMap() {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const { view, year, month, filters } = useMapStore();
  const { data: locations, isLoading } = useVisitedLocations(view, year, month);

  useEffect(() => {
    if (mapContainer.current && !map.current) {
      map.current = new mapboxgl.Map({
        container: mapContainer.current,
        style: 'mapbox://styles/mapbox/light-v11',
        center: [0, 20],
        zoom: 1.5,
      });
    }
  }, []);

  useEffect(() => {
    if (!map.current || isLoading || !locations) return;
    
    // Add location markers to map...
    // Implementation details here
  }, [locations, isLoading, filters]);

  return <div ref={mapContainer} className="w-full h-[600px] rounded-lg" />;
}
```

## Authentication

Using NextAuth.js with AWS Cognito:

```typescript
// src/app/api/auth/[...nextauth]/route.ts
import NextAuth from 'next-auth';
import CognitoProvider from 'next-auth/providers/cognito';

export const authOptions = {
  providers: [
    CognitoProvider({
      clientId: process.env.COGNITO_CLIENT_ID!,
      clientSecret: process.env.COGNITO_CLIENT_SECRET!,
      issuer: process.env.COGNITO_ISSUER,
    }),
  ],
  callbacks: {
    async session({ session, token }) {
      if (token) {
        session.user.id = token.sub;
        session.accessToken = token.accessToken;
      }
      return session;
    },
    async jwt({ token, account }) {
      if (account) {
        token.accessToken = account.access_token;
      }
      return token;
    },
  },
};

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };
```

## Photo Import Flow

1. User initiates iCloud import from the UI
2. Frontend requests temporary credentials from backend
3. User authenticates with iCloud
4. Backend starts background import job
5. Frontend polls job status and updates UI
6. Once complete, photos are displayed with location data

## Responsive Design

Using Tailwind CSS for responsive design with defined breakpoints:

```typescript
// tailwind.config.js
module.exports = {
  theme: {
    extend: {
      screens: {
        xs: '480px',
        sm: '640px',
        md: '768px',
        lg: '1024px',
        xl: '1280px',
        '2xl': '1536px',
      },
    },
  },
};
```

## Performance Optimization

1. **Image Optimization**:
   - Next.js Image component for optimized loading
   - Progressive image loading for galleries
   - Thumbnail generation on backend

2. **Code Splitting**:
   - Route-based code splitting with Next.js
   - Dynamic imports for large components

3. **Virtualization**:
   - Virtual lists for large photo galleries
   - Data pagination for API requests

4. **Caching Strategy**:
   - React Query cache for API responses
   - LocalStorage for user preferences
   - Service Worker for offline capability 