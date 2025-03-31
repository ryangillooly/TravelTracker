# TravelTracker - Domain Models

## User
Represents a user of the application.

```csharp
public class User
{
    public Guid Id { get; set; }
    public string Email { get; set; }
    public string Username { get; set; }
    public string PasswordHash { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime? LastLoginAt { get; set; }
    public ICollection<Photo> Photos { get; set; }
    public ICollection<Trip> Trips { get; set; }
}
```

## Photo
Represents a photo with geolocation data.

```csharp
public class Photo
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public User User { get; set; }
    public string FileName { get; set; }
    public string FileUrl { get; set; }
    public string ThumbnailUrl { get; set; }
    public DateTime CaptureDate { get; set; }
    
    // Geolocation data
    public double? Latitude { get; set; }
    public double? Longitude { get; set; }
    
    // Reference to location (if matched)
    public Guid? LocationId { get; set; }
    public Location Location { get; set; }
    
    // Trip association (optional)
    public Guid? TripId { get; set; }
    public Trip Trip { get; set; }
    
    public DateTime ImportedAt { get; set; }
    public Dictionary<string, string> Metadata { get; set; }
}
```

## Location
Represents a geographic location hierarchy.

```csharp
public class Location
{
    public Guid Id { get; set; }
    
    // Geographic hierarchy
    public string City { get; set; }
    public string Region { get; set; }
    public string Country { get; set; }
    public string CountryCode { get; set; }
    public string Continent { get; set; }
    
    // Coordinates (center point)
    public double Latitude { get; set; }
    public double Longitude { get; set; }
    
    // Metadata
    public Dictionary<string, string> AdditionalData { get; set; }
    
    // Navigation properties
    public ICollection<Photo> Photos { get; set; }
    public ICollection<Visit> Visits { get; set; }
}
```

## Visit
Represents a user's visit to a location.

```csharp
public class Visit
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public User User { get; set; }
    
    public Guid LocationId { get; set; }
    public Location Location { get; set; }
    
    public DateTime StartDate { get; set; }
    public DateTime EndDate { get; set; }
    
    // Optional trip association
    public Guid? TripId { get; set; }
    public Trip Trip { get; set; }
    
    public ICollection<Photo> Photos { get; set; }
}
```

## Trip
Represents a collection of visits that form a single trip.

```csharp
public class Trip
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public User User { get; set; }
    
    public string Name { get; set; }
    public string Description { get; set; }
    
    public DateTime StartDate { get; set; }
    public DateTime EndDate { get; set; }
    
    public ICollection<Visit> Visits { get; set; }
    public ICollection<Photo> Photos { get; set; }
}
```

## Statistics
Value objects for aggregated statistics.

```csharp
public class TravelStatistics
{
    public int CountriesVisited { get; set; }
    public int CitiesVisited { get; set; }
    public int TotalTrips { get; set; }
    public int TotalPhotos { get; set; }
    public DateTime FirstPhotoDate { get; set; }
    public DateTime LastPhotoDate { get; set; }
    public Dictionary<string, int> VisitsByCountry { get; set; }
    public Dictionary<string, int> VisitsByContinent { get; set; }
    public Dictionary<int, int> VisitsByYear { get; set; }
    public Dictionary<int, int> VisitsByMonth { get; set; }
}
```

## iCloud Integration
Classes for handling iCloud integration.

```csharp
public class iCloudCredentials
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public User User { get; set; }
    
    public string AppleId { get; set; }
    public string AuthToken { get; set; }
    public DateTime TokenExpiry { get; set; }
    public DateTime LastSyncDate { get; set; }
}

public class PhotoImportJob
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public User User { get; set; }
    
    public DateTime StartedAt { get; set; }
    public DateTime? CompletedAt { get; set; }
    public string Status { get; set; } // Pending, Processing, Completed, Failed
    public int TotalPhotos { get; set; }
    public int ProcessedPhotos { get; set; }
    public int SuccessfulPhotos { get; set; }
    public int FailedPhotos { get; set; }
    public string ErrorDetails { get; set; }
}
``` 