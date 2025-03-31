# TravelTracker - iCloud Integration

## Overview

The TravelTracker application integrates with Apple's iCloud services to import photos with geolocation data. This integration allows users to seamlessly import their existing photo library for travel tracking and visualization.

## Integration Approach

Since Apple doesn't provide an official public API for iCloud Photos, we'll implement a solution that combines several approaches:

1. **Apple Photos API** (macOS/iOS): For users on Apple devices, we can use the native Photos framework
2. **iCloud Web Service Interaction**: For browser-based import using web service communication
3. **Manual Upload Fallback**: As a fallback for users who can't use the above methods

## Authentication Flow

### iCloud Web Authentication

1. User initiates iCloud connection from TravelTracker UI
2. Application redirects to Apple ID login (or uses Sign in with Apple)
3. User grants permission to access photos
4. Application receives authentication token
5. Token is securely stored for future API requests

```csharp
// TravelTracker.Infrastructure/ExternalServices/iCloud/iCloudAuthenticationService.cs
public class iCloudAuthenticationService : IiCloudAuthenticationService
{
    private readonly HttpClient _httpClient;
    private readonly IOptions<iCloudOptions> _options;
    private readonly ILogger<iCloudAuthenticationService> _logger;

    public iCloudAuthenticationService(
        HttpClient httpClient,
        IOptions<iCloudOptions> options,
        ILogger<iCloudAuthenticationService> logger)
    {
        _httpClient = httpClient;
        _options = options;
        _logger = logger;
    }

    public async Task<iCloudAuthResult> AuthenticateAsync(
        string username,
        string password,
        string twoFactorCode = null,
        CancellationToken cancellationToken = default)
    {
        try
        {
            // Step 1: Initial authentication
            var authResponse = await PerformInitialAuthenticationAsync(username, password, cancellationToken);

            // Step 2: Handle 2FA if required
            if (authResponse.Requires2FA)
            {
                if (string.IsNullOrEmpty(twoFactorCode))
                {
                    return new iCloudAuthResult
                    {
                        Success = false,
                        Requires2FA = true,
                        Message = "Two-factor authentication code required"
                    };
                }

                authResponse = await Complete2FAAuthenticationAsync(
                    authResponse.SessionId,
                    twoFactorCode,
                    cancellationToken);
            }

            // Step 3: Validate and return auth token
            if (authResponse.Success)
            {
                return new iCloudAuthResult
                {
                    Success = true,
                    AuthToken = authResponse.AuthToken,
                    SessionId = authResponse.SessionId,
                    ExpiresAt = DateTime.UtcNow.AddDays(30) // Token typically valid for 30 days
                };
            }
            else
            {
                return new iCloudAuthResult
                {
                    Success = false,
                    Message = authResponse.ErrorMessage
                };
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "iCloud authentication failed: {ErrorMessage}", ex.Message);
            
            return new iCloudAuthResult
            {
                Success = false,
                Message = "Authentication failed. Please try again."
            };
        }
    }

    private async Task<iCloudAuthResponse> PerformInitialAuthenticationAsync(
        string username,
        string password,
        CancellationToken cancellationToken)
    {
        // Implementation details for initial authentication request
        // This makes a POST request to Apple's authentication endpoint
        
        // Note: This is a simplified version of the actual implementation
        // The real implementation would handle cookies, headers, and response parsing
        
        // In a real implementation, this would make a request to:
        // https://idmsa.apple.com/appleauth/auth/signin
    }

    private async Task<iCloudAuthResponse> Complete2FAAuthenticationAsync(
        string sessionId,
        string verificationCode,
        CancellationToken cancellationToken)
    {
        // Implementation for submitting 2FA code
        // This would make a POST request to Apple's 2FA verification endpoint
        
        // In a real implementation, this would make a request to:
        // https://idmsa.apple.com/appleauth/auth/verify/trusteddevice/securitycode
    }
}
```

## Photo Import Process

### 1. Metadata Retrieval

First, we retrieve metadata about available photos:

```csharp
// TravelTracker.Infrastructure/ExternalServices/iCloud/iCloudPhotoService.cs
public class iCloudPhotoService : IiCloudPhotoService
{
    private readonly HttpClient _httpClient;
    private readonly IS3StorageService _storageService;
    private readonly IPhotoProcessor _photoProcessor;
    private readonly ILogger<iCloudPhotoService> _logger;

    public iCloudPhotoService(
        HttpClient httpClient,
        IS3StorageService storageService,
        IPhotoProcessor photoProcessor,
        ILogger<iCloudPhotoService> logger)
    {
        _httpClient = httpClient;
        _storageService = storageService;
        _photoProcessor = photoProcessor;
        _logger = logger;
    }

    public async Task<PhotoImportJob> StartPhotoImportAsync(
        iCloudCredentials credentials,
        PhotoImportOptions options,
        CancellationToken cancellationToken)
    {
        // Create a new import job
        var importJob = new PhotoImportJob
        {
            Id = Guid.NewGuid(),
            UserId = credentials.UserId,
            StartedAt = DateTime.UtcNow,
            Status = "Pending",
            TotalPhotos = 0,
            ProcessedPhotos = 0,
            SuccessfulPhotos = 0,
            FailedPhotos = 0
        };

        // Start the import process in the background
        _ = ProcessPhotoImportAsync(importJob, credentials, options);

        return importJob;
    }

    private async Task ProcessPhotoImportAsync(
        PhotoImportJob job,
        iCloudCredentials credentials,
        PhotoImportOptions options)
    {
        job.Status = "Processing";
        
        try
        {
            // 1. Set up authenticated HTTP client with iCloud credentials
            _httpClient.DefaultRequestHeaders.Authorization = 
                new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", credentials.AuthToken);

            // 2. Retrieve list of photos from iCloud
            var photos = await GetPhotosMetadataAsync(credentials, options);
            
            job.TotalPhotos = photos.Count;

            // 3. Download and process each photo
            foreach (var photo in photos)
            {
                try
                {
                    // Only process photos with location data if filterNonGeotagged is true
                    if (options.FilterNonGeotagged && 
                        (!photo.Latitude.HasValue || !photo.Longitude.HasValue))
                    {
                        continue;
                    }

                    // Download the photo from iCloud
                    using var photoStream = await DownloadPhotoAsync(photo.DownloadUrl, credentials);
                    
                    // Upload to S3
                    var fileKey = await _storageService.UploadFileAsync(
                        photoStream, 
                        photo.Filename,
                        photo.ContentType,
                        CancellationToken.None);

                    // Process the photo (extract metadata, generate thumbnail)
                    var processingResult = await _photoProcessor.ProcessPhotoAsync(
                        fileKey,
                        new ProcessingOptions 
                        { 
                            ExtractMetadata = true, 
                            GenerateThumbnail = true 
                        },
                        CancellationToken.None);

                    // Create thumbnail URL
                    var thumbnailUrl = _storageService.GetFileUrl(
                        processingResult.ThumbnailKey, 
                        TimeSpan.FromHours(1));

                    // Create a new Photo entity
                    var newPhoto = new Photo(
                        photo.Filename,
                        _storageService.GetFileUrl(fileKey, TimeSpan.FromHours(1)),
                        thumbnailUrl,
                        photo.CaptureDate,
                        credentials.UserId);

                    // Set coordinates if available
                    if (photo.Latitude.HasValue && photo.Longitude.HasValue)
                    {
                        newPhoto.SetCoordinates(photo.Latitude.Value, photo.Longitude.Value);
                    }
                    
                    // Save the photo entity through repository
                    // (Implementation details omitted)

                    job.SuccessfulPhotos++;
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Failed to process photo: {Filename}", photo.Filename);
                    job.FailedPhotos++;
                }
                finally
                {
                    job.ProcessedPhotos++;
                }
            }

            job.CompletedAt = DateTime.UtcNow;
            job.Status = "Completed";
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Photo import job failed: {ErrorMessage}", ex.Message);
            job.Status = "Failed";
            job.ErrorDetails = ex.Message;
        }

        // Update job status in database
        // (Implementation details omitted)
    }

    private async Task<List<iCloudPhotoMetadata>> GetPhotosMetadataAsync(
        iCloudCredentials credentials,
        PhotoImportOptions options)
    {
        // Implementation to retrieve photo metadata from iCloud
        // This would make a request to the iCloud Photos API to get a list of photos
        // with their metadata including geolocation, capture date, etc.
        
        // The real implementation would include:
        // - Pagination support
        // - Date range filtering
        // - Error handling
        // - Response parsing
    }

    private async Task<Stream> DownloadPhotoAsync(string url, iCloudCredentials credentials)
    {
        // Implementation to download photo content from iCloud
        // This makes a GET request to the specified URL with proper authentication
        
        // In a real implementation, this would:
        // - Set up proper authentication headers
        // - Handle redirects
        // - Stream the response to avoid memory issues with large photos
    }
}
```

### 2. Photo Download and Processing

For each photo with geolocation data:

1. Download high-resolution version
2. Extract EXIF metadata (including geolocation)
3. Generate thumbnails
4. Upload to S3 storage
5. Create database records
6. Match location data to geographic entities

### 3. Batch Processing and Job Status

Implement background processing for large imports:

```csharp
// TravelTracker.Application/Features/iCloud/Queries/GetImportJobStatus/GetImportJobStatusQuery.cs
public class GetImportJobStatusQuery : IRequest<ImportJobStatusDto>
{
    public Guid JobId { get; set; }
    public Guid UserId { get; set; }
}

public class GetImportJobStatusQueryHandler : IRequestHandler<GetImportJobStatusQuery, ImportJobStatusDto>
{
    private readonly IApplicationDbContext _context;
    private readonly IMapper _mapper;

    public GetImportJobStatusQueryHandler(IApplicationDbContext context, IMapper mapper)
    {
        _context = context;
        _mapper = mapper;
    }

    public async Task<ImportJobStatusDto> Handle(
        GetImportJobStatusQuery request,
        CancellationToken cancellationToken)
    {
        var job = await _context.PhotoImportJobs
            .Where(j => j.Id == request.JobId && j.UserId == request.UserId)
            .FirstOrDefaultAsync(cancellationToken);

        if (job == null)
        {
            throw new NotFoundException(nameof(PhotoImportJob), request.JobId);
        }

        var dto = _mapper.Map<ImportJobStatusDto>(job);
        
        // Calculate percentage completion
        if (job.TotalPhotos > 0)
        {
            dto.CompletionPercentage = (int)((job.ProcessedPhotos / (double)job.TotalPhotos) * 100);
        }
        
        return dto;
    }
}
```

## API Endpoints

### 1. Connect to iCloud

```http
POST /api/icloud/connect
Content-Type: application/json

{
  "username": "user@example.com",
  "password": "password123"
}
```

Response:

```json
{
  "success": true,
  "requires2FA": false,
  "authToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expiresAt": "2023-12-31T23:59:59Z"
}
```

### 2. Submit 2FA Code (if required)

```http
POST /api/icloud/connect/verify
Content-Type: application/json

{
  "sessionId": "abc123",
  "verificationCode": "123456"
}
```

### 3. Start Photo Import

```http
POST /api/icloud/import
Content-Type: application/json

{
  "startDate": "2020-01-01T00:00:00Z",
  "endDate": "2023-01-01T00:00:00Z",
  "filterNonGeotagged": true,
  "batchSize": 100
}
```

Response:

```json
{
  "jobId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "Pending",
  "startedAt": "2023-04-15T14:30:20Z",
  "totalPhotos": 0
}
```

### 4. Check Import Status

```http
GET /api/icloud/import/550e8400-e29b-41d4-a716-446655440000
```

Response:

```json
{
  "jobId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "Processing",
  "startedAt": "2023-04-15T14:30:20Z",
  "totalPhotos": 1452,
  "processedPhotos": 345,
  "successfulPhotos": 342,
  "failedPhotos": 3,
  "completionPercentage": 23
}
```

## Challenges and Solutions

### Challenge 1: Handling 2FA Authentication

**Solution:** Implement a multi-step authentication process with session persistence.

### Challenge 2: Rate Limiting and Throttling

**Solution:** Implement exponential backoff and batch processing.

```csharp
private async Task<T> ExecuteWithRetryAsync<T>(
    Func<Task<T>> operation,
    int maxRetries = 3,
    int initialDelayMs = 1000)
{
    int retryCount = 0;
    int delay = initialDelayMs;

    while (true)
    {
        try
        {
            return await operation();
        }
        catch (HttpRequestException ex) when 
            (ex.StatusCode == System.Net.HttpStatusCode.TooManyRequests && retryCount < maxRetries)
        {
            retryCount++;
            _logger.LogWarning("Rate limited by iCloud API. Retrying in {DelayMs}ms (Attempt {RetryCount}/{MaxRetries})",
                delay, retryCount, maxRetries);
                
            await Task.Delay(delay);
            
            // Exponential backoff
            delay *= 2;
        }
    }
}
```

### Challenge 3: Large Photo Files

**Solution:** Stream processing and chunked uploads.

```csharp
private async Task<string> UploadLargePhotoAsync(
    Stream photoStream,
    string fileName,
    string contentType,
    CancellationToken cancellationToken)
{
    // Use S3 multipart upload for large files
    var uploadId = await _s3Client.InitiateMultipartUploadAsync(
        new InitiateMultipartUploadRequest
        {
            BucketName = _bucketName,
            Key = fileName,
            ContentType = contentType
        }, 
        cancellationToken);

    var partSize = 5 * 1024 * 1024; // 5MB chunk size
    var buffer = new byte[partSize];
    var partNumber = 1;
    var completedParts = new List<PartETag>();

    int bytesRead;
    while ((bytesRead = await photoStream.ReadAsync(buffer, 0, buffer.Length, cancellationToken)) > 0)
    {
        using var partStream = new MemoryStream(buffer, 0, bytesRead);
        
        var uploadPartResponse = await _s3Client.UploadPartAsync(
            new UploadPartRequest
            {
                BucketName = _bucketName,
                Key = fileName,
                UploadId = uploadId.UploadId,
                PartNumber = partNumber,
                PartSize = bytesRead,
                InputStream = partStream
            }, 
            cancellationToken);

        completedParts.Add(new PartETag
        {
            PartNumber = partNumber,
            ETag = uploadPartResponse.ETag
        });

        partNumber++;
    }

    // Complete the multipart upload
    await _s3Client.CompleteMultipartUploadAsync(
        new CompleteMultipartUploadRequest
        {
            BucketName = _bucketName,
            Key = fileName,
            UploadId = uploadId.UploadId,
            PartETags = completedParts
        },
        cancellationToken);

    return fileName;
}
```

### Challenge 4: Missing or Inaccurate Geolocation Data

**Solution:** Implement fallback strategies:

1. Extract EXIF data directly from image files
2. Allow manual location tagging
3. Use time-based clustering to infer locations

## Security Considerations

### Credential Storage

iCloud credentials must be securely handled:

1. **Never store iCloud passwords** - Use short-lived authentication tokens only
2. **Encrypt tokens** at rest using AWS KMS
3. **Set appropriate token expiry**
4. **Implement secure token refresh** mechanisms

### Data Privacy

1. Process photos server-side without storing original content long-term
2. Allow users to selectively import photos
3. Implement data deletion capabilities
4. Clear import job history after completion

## Alternative Approaches

### 1. Local Import from iOS/macOS Devices

For users with Apple devices, implement a native app extension that can:
- Access photos directly via Photos framework
- Extract metadata locally
- Upload only necessary data (not full photos)

### 2. Manual Upload

Provide a fallback option allowing users to:
- Manually upload photos
- Batch import from photo archive exports
- Import from other cloud storage services 