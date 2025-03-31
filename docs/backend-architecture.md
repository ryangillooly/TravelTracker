# TravelTracker - Backend Architecture

## Overview
The TravelTracker backend is built using C# .NET Core following a clean architecture approach. It provides RESTful API endpoints, business logic, and integration with external services such as iCloud for photo import and geolocation services.

## Architecture Layers

### 1. Domain Layer (TravelTracker.Core)
- Contains enterprise business rules and entities
- Domain models, interfaces, and value objects
- No dependencies on other project layers or external frameworks

### 2. Application Layer (TravelTracker.Application)
- Contains business rules specific to the application
- Implements use cases that orchestrate domain entities
- Uses CQRS pattern with MediatR for request/response operations
- Defines interfaces that are implemented by infrastructure

### 3. Infrastructure Layer (TravelTracker.Infrastructure)
- Contains implementations for interfaces defined in the application layer
- External service integrations (iCloud, geolocation APIs)
- Database context and migrations
- Repository implementations
- Authentication and authorization services

### 4. API Layer (TravelTracker.API)
- RESTful API controllers
- API models/DTOs
- Request validation
- Authentication middleware
- API documentation with Swagger

## Project Structure

```
backend/
  ├── src/
  │   ├── TravelTracker.Core/              # Domain Layer
  │   │   ├── Entities/                   # Core domain entities
  │   │   ├── Enums/                      # Enumeration types
  │   │   ├── Events/                     # Domain events
  │   │   ├── Exceptions/                 # Custom exceptions
  │   │   ├── Interfaces/                 # Core interfaces
  │   │   └── ValueObjects/               # Value objects
  │   │
  │   ├── TravelTracker.Application/      # Application Layer
  │   │   ├── Common/                     # Common application concerns
  │   │   │   ├── Behaviors/             # Pipeline behaviors
  │   │   │   ├── Exceptions/            # Application exceptions
  │   │   │   ├── Interfaces/            # Application interfaces
  │   │   │   └── Models/                # Shared application models
  │   │   ├── Features/                   # Application features
  │   │   │   ├── Auth/                  # Authentication features
  │   │   │   ├── Photos/                # Photo management features
  │   │   │   ├── Locations/             # Location management features
  │   │   │   ├── Stats/                 # Statistics features
  │   │   │   └── iCloud/                # iCloud integration features
  │   │   └── DependencyInjection.cs      # Application services registration
  │   │
  │   ├── TravelTracker.Infrastructure/   # Infrastructure Layer
  │   │   ├── Authentication/             # Authentication implementation
  │   │   ├── Data/                       # Database concerns
  │   │   │   ├── Configurations/        # Entity configurations
  │   │   │   ├── Migrations/            # EF Core migrations
  │   │   │   ├── Repositories/          # Repository implementations
  │   │   │   └── ApplicationDbContext.cs # EF Core context
  │   │   ├── ExternalServices/           # External service integrations
  │   │   │   ├── iCloud/                # iCloud integration
  │   │   │   ├── Geolocation/           # Geolocation services
  │   │   │   └── Storage/               # S3 storage service
  │   │   ├── Identity/                   # Identity implementation
  │   │   ├── BackgroundServices/         # Background processing services
  │   │   └── DependencyInjection.cs      # Infrastructure registration
  │   │
  │   └── TravelTracker.API/              # API Layer
  │       ├── Controllers/                # API Controllers
  │       ├── Filters/                    # Action filters
  │       ├── Models/                     # API request/response models
  │       ├── Extensions/                 # API specific extensions
  │       ├── Middleware/                 # Custom middleware
  │       ├── Program.cs                  # Application entry point
  │       └── appsettings.json            # Configuration
  │
  └── tests/                             # Test projects
      ├── TravelTracker.UnitTests/
      ├── TravelTracker.IntegrationTests/
      └── TravelTracker.FunctionalTests/
```

## Key Components

### Domain Entities

Core domain entities as defined in the domain models document, implemented with proper encapsulation:

```csharp
// TravelTracker.Core/Entities/Photo.cs
namespace TravelTracker.Core.Entities;

public class Photo : BaseEntity
{
    private Photo() { } // Required by EF Core

    public Photo(
        string fileName,
        string fileUrl,
        string thumbnailUrl,
        DateTime captureDate,
        Guid userId)
    {
        FileName = fileName;
        FileUrl = fileUrl;
        ThumbnailUrl = thumbnailUrl;
        CaptureDate = captureDate;
        UserId = userId;
        ImportedAt = DateTime.UtcNow;
        Metadata = new Dictionary<string, string>();
    }

    public string FileName { get; private set; }
    public string FileUrl { get; private set; }
    public string ThumbnailUrl { get; private set; }
    public DateTime CaptureDate { get; private set; }
    public Guid UserId { get; private set; }
    
    public double? Latitude { get; private set; }
    public double? Longitude { get; private set; }
    
    public Guid? LocationId { get; private set; }
    public Location Location { get; private set; }
    
    public Guid? TripId { get; private set; }
    public Trip Trip { get; private set; }
    
    public DateTime ImportedAt { get; private set; }
    public Dictionary<string, string> Metadata { get; private set; }

    public void SetCoordinates(double latitude, double longitude)
    {
        Latitude = latitude;
        Longitude = longitude;
    }

    public void SetLocation(Location location)
    {
        LocationId = location.Id;
        Location = location;
    }

    public void AssignToTrip(Trip trip)
    {
        TripId = trip.Id;
        Trip = trip;
    }

    public void UpdateMetadata(Dictionary<string, string> metadata)
    {
        foreach (var item in metadata)
        {
            Metadata[item.Key] = item.Value;
        }
    }
}
```

### Application Services

CQRS implementation using MediatR:

```csharp
// TravelTracker.Application/Features/Photos/Queries/GetPhotosWithPagination/GetPhotosWithPaginationQuery.cs
namespace TravelTracker.Application.Features.Photos.Queries.GetPhotosWithPagination;

public record GetPhotosWithPaginationQuery : IRequest<PaginatedList<PhotoDto>>
{
    public Guid UserId { get; init; }
    public int PageNumber { get; init; } = 1;
    public int PageSize { get; init; } = 10;
    public DateTime? StartDate { get; init; }
    public DateTime? EndDate { get; init; }
    public Guid? LocationId { get; init; }
    public Guid? TripId { get; init; }
}

public class GetPhotosWithPaginationQueryHandler : IRequestHandler<GetPhotosWithPaginationQuery, PaginatedList<PhotoDto>>
{
    private readonly IApplicationDbContext _context;
    private readonly IMapper _mapper;

    public GetPhotosWithPaginationQueryHandler(IApplicationDbContext context, IMapper mapper)
    {
        _context = context;
        _mapper = mapper;
    }

    public async Task<PaginatedList<PhotoDto>> Handle(
        GetPhotosWithPaginationQuery request,
        CancellationToken cancellationToken)
    {
        IQueryable<Photo> photosQuery = _context.Photos
            .AsNoTracking()
            .Where(p => p.UserId == request.UserId)
            .Include(p => p.Location)
            .OrderByDescending(p => p.CaptureDate);

        if (request.StartDate.HasValue)
        {
            photosQuery = photosQuery.Where(p => p.CaptureDate >= request.StartDate.Value);
        }

        if (request.EndDate.HasValue)
        {
            photosQuery = photosQuery.Where(p => p.CaptureDate <= request.EndDate.Value);
        }

        if (request.LocationId.HasValue)
        {
            photosQuery = photosQuery.Where(p => p.LocationId == request.LocationId.Value);
        }

        if (request.TripId.HasValue)
        {
            photosQuery = photosQuery.Where(p => p.TripId == request.TripId.Value);
        }

        var photos = await photosQuery
            .ProjectTo<PhotoDto>(_mapper.ConfigurationProvider)
            .PaginatedListAsync(request.PageNumber, request.PageSize, cancellationToken);

        return photos;
    }
}
```

### Infrastructure Implementations

Repository pattern implementation for data access:

```csharp
// TravelTracker.Infrastructure/Data/Repositories/PhotoRepository.cs
namespace TravelTracker.Infrastructure.Data.Repositories;

public class PhotoRepository : IPhotoRepository
{
    private readonly ApplicationDbContext _dbContext;

    public PhotoRepository(ApplicationDbContext dbContext)
    {
        _dbContext = dbContext;
    }

    public async Task<Photo> GetByIdAsync(Guid id, CancellationToken cancellationToken)
    {
        return await _dbContext.Photos
            .Include(p => p.Location)
            .FirstOrDefaultAsync(p => p.Id == id, cancellationToken);
    }

    public async Task<IReadOnlyList<Photo>> GetByUserIdAsync(
        Guid userId, 
        DateTime? startDate, 
        DateTime? endDate, 
        CancellationToken cancellationToken)
    {
        var query = _dbContext.Photos
            .Where(p => p.UserId == userId)
            .Include(p => p.Location)
            .OrderByDescending(p => p.CaptureDate)
            .AsQueryable();

        if (startDate.HasValue)
        {
            query = query.Where(p => p.CaptureDate >= startDate.Value);
        }

        if (endDate.HasValue)
        {
            query = query.Where(p => p.CaptureDate <= endDate.Value);
        }

        return await query.ToListAsync(cancellationToken);
    }

    public async Task AddAsync(Photo photo, CancellationToken cancellationToken)
    {
        await _dbContext.Photos.AddAsync(photo, cancellationToken);
    }

    public void Update(Photo photo)
    {
        _dbContext.Entry(photo).State = EntityState.Modified;
    }

    public void Delete(Photo photo)
    {
        _dbContext.Photos.Remove(photo);
    }
}
```

### API Controllers

RESTful API controllers with proper response codes:

```csharp
// TravelTracker.API/Controllers/PhotosController.cs
namespace TravelTracker.API.Controllers;

[Authorize]
[ApiController]
[Route("api/[controller]")]
public class PhotosController : ApiControllerBase
{
    private readonly IMediator _mediator;

    public PhotosController(IMediator mediator)
    {
        _mediator = mediator;
    }

    [HttpGet]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public async Task<ActionResult<PaginatedList<PhotoDto>>> GetPhotos(
        [FromQuery] GetPhotosWithPaginationQuery query,
        CancellationToken cancellationToken)
    {
        // Set the user ID from the authenticated user
        query = query with { UserId = UserId };
        
        return await _mediator.Send(query, cancellationToken);
    }

    [HttpGet("{id}")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<PhotoDto>> GetPhoto(Guid id, CancellationToken cancellationToken)
    {
        var query = new GetPhotoByIdQuery { Id = id, UserId = UserId };
        var photo = await _mediator.Send(query, cancellationToken);
        
        return photo;
    }

    [HttpPost]
    [ProducesResponseType(StatusCodes.Status201Created)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public async Task<ActionResult<Guid>> Create(
        CreatePhotoCommand command,
        CancellationToken cancellationToken)
    {
        // Set the user ID from the authenticated user
        command = command with { UserId = UserId };
        
        var id = await _mediator.Send(command, cancellationToken);
        
        return CreatedAtAction(nameof(GetPhoto), new { id }, id);
    }

    [HttpPut("{id}")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult> Update(
        Guid id,
        UpdatePhotoCommand command,
        CancellationToken cancellationToken)
    {
        if (id != command.Id)
        {
            return BadRequest();
        }

        // Set the user ID from the authenticated user
        command = command with { UserId = UserId };
        
        await _mediator.Send(command, cancellationToken);
        
        return NoContent();
    }

    [HttpDelete("{id}")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult> Delete(Guid id, CancellationToken cancellationToken)
    {
        var command = new DeletePhotoCommand { Id = id, UserId = UserId };
        
        await _mediator.Send(command, cancellationToken);
        
        return NoContent();
    }
}
```

## AWS Integration

### S3 Storage Service

For storing photo files:

```csharp
// TravelTracker.Infrastructure/ExternalServices/Storage/S3StorageService.cs
namespace TravelTracker.Infrastructure.ExternalServices.Storage;

public class S3StorageService : IStorageService
{
    private readonly IAmazonS3 _s3Client;
    private readonly string _bucketName;
    private readonly ILogger<S3StorageService> _logger;

    public S3StorageService(
        IAmazonS3 s3Client,
        IOptions<S3StorageOptions> options,
        ILogger<S3StorageService> logger)
    {
        _s3Client = s3Client;
        _bucketName = options.Value.BucketName;
        _logger = logger;
    }

    public async Task<string> UploadFileAsync(
        Stream fileStream,
        string fileName,
        string contentType,
        CancellationToken cancellationToken)
    {
        try
        {
            var fileKey = $"{Guid.NewGuid()}-{fileName}";
            
            var request = new PutObjectRequest
            {
                BucketName = _bucketName,
                Key = fileKey,
                InputStream = fileStream,
                ContentType = contentType,
                CannedACL = S3CannedACL.Private
            };

            await _s3Client.PutObjectAsync(request, cancellationToken);
            
            return fileKey;
        }
        catch (AmazonS3Exception ex)
        {
            _logger.LogError(ex, "Error uploading file to S3: {ErrorMessage}", ex.Message);
            throw new StorageException("Error uploading file to storage", ex);
        }
    }

    public async Task<Stream> GetFileAsync(string fileKey, CancellationToken cancellationToken)
    {
        try
        {
            var request = new GetObjectRequest
            {
                BucketName = _bucketName,
                Key = fileKey
            };

            var response = await _s3Client.GetObjectAsync(request, cancellationToken);
            
            return response.ResponseStream;
        }
        catch (AmazonS3Exception ex) when (ex.StatusCode == System.Net.HttpStatusCode.NotFound)
        {
            throw new FileNotFoundException($"File not found: {fileKey}", ex);
        }
        catch (AmazonS3Exception ex)
        {
            _logger.LogError(ex, "Error retrieving file from S3: {ErrorMessage}", ex.Message);
            throw new StorageException("Error retrieving file from storage", ex);
        }
    }

    public async Task DeleteFileAsync(string fileKey, CancellationToken cancellationToken)
    {
        try
        {
            var request = new DeleteObjectRequest
            {
                BucketName = _bucketName,
                Key = fileKey
            };

            await _s3Client.DeleteObjectAsync(request, cancellationToken);
        }
        catch (AmazonS3Exception ex)
        {
            _logger.LogError(ex, "Error deleting file from S3: {ErrorMessage}", ex.Message);
            throw new StorageException("Error deleting file from storage", ex);
        }
    }

    public string GetFileUrl(string fileKey, TimeSpan expiration)
    {
        try
        {
            var request = new GetPreSignedUrlRequest
            {
                BucketName = _bucketName,
                Key = fileKey,
                Expires = DateTime.UtcNow.Add(expiration)
            };

            return _s3Client.GetPreSignedURL(request);
        }
        catch (AmazonS3Exception ex)
        {
            _logger.LogError(ex, "Error generating pre-signed URL: {ErrorMessage}", ex.Message);
            throw new StorageException("Error generating file access URL", ex);
        }
    }
}
```

### AWS Lambda Background Processing

For photo processing:

```csharp
// TravelTracker.Infrastructure/ExternalServices/PhotoProcessing/LambdaPhotoProcessor.cs
namespace TravelTracker.Infrastructure.ExternalServices.PhotoProcessing;

public class LambdaPhotoProcessor : IPhotoProcessor
{
    private readonly IAmazonLambda _lambdaClient;
    private readonly string _functionName;
    private readonly ILogger<LambdaPhotoProcessor> _logger;

    public LambdaPhotoProcessor(
        IAmazonLambda lambdaClient,
        IOptions<LambdaOptions> options,
        ILogger<LambdaPhotoProcessor> logger)
    {
        _lambdaClient = lambdaClient;
        _functionName = options.Value.PhotoProcessorFunction;
        _logger = logger;
    }

    public async Task<PhotoProcessingResult> ProcessPhotoAsync(
        string photoKey,
        ProcessingOptions options,
        CancellationToken cancellationToken)
    {
        try
        {
            var request = new InvokeRequest
            {
                FunctionName = _functionName,
                InvocationType = InvocationType.RequestResponse,
                Payload = JsonSerializer.Serialize(new
                {
                    photoKey,
                    extractMetadata = options.ExtractMetadata,
                    generateThumbnail = options.GenerateThumbnail,
                    thumbnailSize = options.ThumbnailSize
                })
            };

            var response = await _lambdaClient.InvokeAsync(request, cancellationToken);

            if (response.StatusCode != 200)
            {
                _logger.LogError("Lambda function returned error: {StatusCode}", response.StatusCode);
                throw new PhotoProcessingException($"Photo processing failed with status code {response.StatusCode}");
            }

            using var reader = new StreamReader(response.Payload);
            var resultJson = await reader.ReadToEndAsync(cancellationToken);
            
            return JsonSerializer.Deserialize<PhotoProcessingResult>(resultJson);
        }
        catch (AmazonLambdaException ex)
        {
            _logger.LogError(ex, "Error invoking Lambda function: {ErrorMessage}", ex.Message);
            throw new PhotoProcessingException("Error during photo processing", ex);
        }
        catch (JsonException ex)
        {
            _logger.LogError(ex, "Error deserializing Lambda response: {ErrorMessage}", ex.Message);
            throw new PhotoProcessingException("Error parsing photo processing result", ex);
        }
    }
}
```

### AWS Cognito Authentication

For user authentication:

```csharp
// TravelTracker.Infrastructure/Authentication/CognitoAuthenticationService.cs
namespace TravelTracker.Infrastructure.Authentication;

public class CognitoAuthenticationService : IAuthenticationService
{
    private readonly IAmazonCognitoIdentityProvider _cognitoClient;
    private readonly string _clientId;
    private readonly string _userPoolId;
    private readonly ILogger<CognitoAuthenticationService> _logger;

    public CognitoAuthenticationService(
        IAmazonCognitoIdentityProvider cognitoClient,
        IOptions<CognitoOptions> options,
        ILogger<CognitoAuthenticationService> logger)
    {
        _cognitoClient = cognitoClient;
        _clientId = options.Value.ClientId;
        _userPoolId = options.Value.UserPoolId;
        _logger = logger;
    }

    public async Task<AuthenticationResult> AuthenticateAsync(
        string username,
        string password,
        CancellationToken cancellationToken)
    {
        try
        {
            var request = new AdminInitiateAuthRequest
            {
                UserPoolId = _userPoolId,
                ClientId = _clientId,
                AuthFlow = AuthFlowType.ADMIN_USER_PASSWORD_AUTH,
                AuthParameters = new Dictionary<string, string>
                {
                    { "USERNAME", username },
                    { "PASSWORD", password }
                }
            };

            var response = await _cognitoClient.AdminInitiateAuthAsync(request, cancellationToken);

            return new AuthenticationResult
            {
                AccessToken = response.AuthenticationResult.AccessToken,
                RefreshToken = response.AuthenticationResult.RefreshToken,
                ExpiresIn = response.AuthenticationResult.ExpiresIn,
                TokenType = response.AuthenticationResult.TokenType
            };
        }
        catch (NotAuthorizedException ex)
        {
            _logger.LogWarning(ex, "Authentication failed for user {Username}", username);
            throw new AuthenticationException("Invalid username or password", ex);
        }
        catch (AmazonCognitoIdentityProviderException ex)
        {
            _logger.LogError(ex, "Cognito error during authentication: {ErrorMessage}", ex.Message);
            throw new AuthenticationException("Authentication service error", ex);
        }
    }

    public async Task<string> RegisterUserAsync(
        UserRegistration registration,
        CancellationToken cancellationToken)
    {
        try
        {
            var request = new SignUpRequest
            {
                ClientId = _clientId,
                Username = registration.Email,
                Password = registration.Password,
                UserAttributes = new List<AttributeType>
                {
                    new AttributeType { Name = "email", Value = registration.Email },
                    new AttributeType { Name = "name", Value = registration.Username }
                }
            };

            var response = await _cognitoClient.SignUpAsync(request, cancellationToken);
            
            return response.UserSub;
        }
        catch (UsernameExistsException ex)
        {
            _logger.LogWarning(ex, "Registration failed - username exists: {Email}", registration.Email);
            throw new RegistrationException("Email already registered", ex);
        }
        catch (InvalidPasswordException ex)
        {
            _logger.LogWarning(ex, "Registration failed - invalid password");
            throw new RegistrationException("Password does not meet requirements", ex);
        }
        catch (AmazonCognitoIdentityProviderException ex)
        {
            _logger.LogError(ex, "Cognito error during registration: {ErrorMessage}", ex.Message);
            throw new RegistrationException("Registration service error", ex);
        }
    }
}
```

## API Endpoints

### Photo Endpoints

- `GET /api/photos` - Get photos with pagination and filtering
- `GET /api/photos/{id}` - Get a specific photo by ID
- `POST /api/photos` - Upload a new photo
- `PUT /api/photos/{id}` - Update photo metadata
- `DELETE /api/photos/{id}` - Delete a photo

### Location Endpoints

- `GET /api/locations` - Get all locations for a user
- `GET /api/locations/{id}` - Get a specific location details
- `GET /api/locations/stats` - Get location statistics

### Trip Endpoints

- `GET /api/trips` - Get all trips for a user
- `GET /api/trips/{id}` - Get a specific trip details
- `POST /api/trips` - Create a new trip
- `PUT /api/trips/{id}` - Update a trip
- `DELETE /api/trips/{id}` - Delete a trip

### Statistics Endpoints

- `GET /api/stats` - Get aggregated statistics
- `GET /api/stats/yearly/{year}` - Get statistics for a specific year
- `GET /api/stats/monthly/{year}/{month}` - Get statistics for a specific month

### iCloud Integration Endpoints

- `POST /api/icloud/connect` - Connect to iCloud account
- `POST /api/icloud/import` - Start photo import job
- `GET /api/icloud/import/{jobId}` - Get import job status

## Performance Considerations

1. **Database Optimization**:
   - Indexes on frequently queried fields
   - Appropriate foreign key relationships
   - Query optimization for large photo collections

2. **Caching**:
   - Response caching for statistics and locations
   - In-memory caching for common queries
   - Distributed caching with Redis

3. **Background Processing**:
   - AWS Lambda for photo processing
   - SQS queues for long-running tasks
   - Job status tracking for client feedback

4. **Scaling**:
   - Horizontal scaling of API instances
   - Auto-scaling based on load
   - Read-write splitting for database operations

## Security Implementation

1. **Authentication**:
   - JWT token validation
   - AWS Cognito integration
   - Refresh token rotation

2. **Authorization**:
   - Resource-based permissions
   - Owner validation for all operations
   - API rate limiting

3. **Data Protection**:
   - Encryption at rest for photo storage
   - HTTPS for all communication
   - PII protection measures

## Monitoring and Logging

1. **Application Logging**:
   - Structured logging with Serilog
   - Log shipping to CloudWatch
   - Correlation IDs for request tracking

2. **Performance Monitoring**:
   - API metrics collection
   - Database performance tracking
   - External service call monitoring

3. **Error Handling**:
   - Global exception middleware
   - Problem Details responses
   - Alert system for critical errors 