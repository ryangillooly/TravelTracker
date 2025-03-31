using MetadataExtractor;
using MetadataExtractor.Formats.Exif;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using TravelTrackerApi.Data;
using TravelTrackerApi.Models;
using System.Globalization;
using System.IO;
using IoDirectory = System.IO.Directory;
using System.Net.Http;
using System.Text.Json;
using System.Linq;

namespace TravelTrackerApi.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class PhotosController : ControllerBase
    {
        private readonly AppDbContext _context;
        private readonly ILogger<PhotosController> _logger;
        private readonly IHttpClientFactory _httpClientFactory;
        private readonly IConfiguration _configuration;

        // API key should be stored in the appsettings.json file
        private readonly string _googleMapsApiKey;
        
        // Cache for location data to reduce API calls
        private static readonly Dictionary<string, (string City, string Country, DateTime CachedTime)> _locationCache = new();
        private static readonly object _cacheLock = new();
        private const double COORDINATE_PRECISION = 0.01; // Approximately 1km at the equator
        private const int CACHE_EXPIRY_DAYS = 7;

        public PhotosController(AppDbContext context, ILogger<PhotosController> logger, 
            IHttpClientFactory httpClientFactory, IConfiguration configuration)
        {
            _context = context;
            _logger = logger;
            _httpClientFactory = httpClientFactory;
            _configuration = configuration;
            
            // Get API key from configuration
            _googleMapsApiKey = _configuration["GoogleMaps:ApiKey"] ?? "YOUR_API_KEY";
        }

        [HttpPost("process")]
        public async Task<IActionResult> ProcessPhotos(IFormFileCollection files)
        {
            if (files == null || files.Count == 0)
            {
                return BadRequest("No files were uploaded.");
            }

            var results = new List<Location>();
            var updatedLocations = new List<Location>();
            var newLocations = new List<Location>();

            foreach (var file in files)
            {
                try
                {
                    using var stream = file.OpenReadStream();
                    var directories = ImageMetadataReader.ReadMetadata(stream);
                    var gpsDirectory = directories.OfType<GpsDirectory>().FirstOrDefault();

                    if (gpsDirectory != null && gpsDirectory.GetGeoLocation() != null)
                    {
                        var lat = gpsDirectory.GetGeoLocation().Latitude;
                        var lng = gpsDirectory.GetGeoLocation().Longitude;

                        var (city, country) = await GetLocationInfoAsync(lat, lng);

                        var dateTaken = GetDateTaken(directories) ?? DateTime.Now;

                        // Check if this photo already exists in the database
                        var existingLocation = await _context.Locations
                            .FirstOrDefaultAsync(l => 
                                l.PhotoFileName == file.FileName && 
                                Math.Abs(l.Latitude - lat) < 0.0001 && 
                                Math.Abs(l.Longitude - lng) < 0.0001 &&
                                l.CaptureDate.Date == dateTaken.Date);

                        if (existingLocation != null)
                        {
                            // If existing location has unknown city/country, update it
                            bool updated = false;
                            
                            if ((existingLocation.City == "Unknown" || string.IsNullOrEmpty(existingLocation.City)) && 
                                city != "Unknown" && !string.IsNullOrEmpty(city))
                            {
                                existingLocation.City = city;
                                updated = true;
                            }
                            
                            if ((existingLocation.Country == "Unknown" || string.IsNullOrEmpty(existingLocation.Country)) && 
                                country != "Unknown" && !string.IsNullOrEmpty(country))
                            {
                                existingLocation.Country = country;
                                updated = true;
                            }
                            
                            if (updated)
                            {
                                _context.Locations.Update(existingLocation);
                                updatedLocations.Add(existingLocation);
                            }
                            
                            // Add to results in either case to show in UI
                            results.Add(existingLocation);
                        }
                        else
                        {
                            // Create a new location record
                            var location = new Location
                            {
                                Latitude = lat,
                                Longitude = lng,
                                CaptureDate = dateTaken,
                                Country = country,
                                City = city,
                                PhotoFileName = file.FileName
                            };

                            _context.Locations.Add(location);
                            newLocations.Add(location);
                            results.Add(location);
                        }
                    }
                    else
                    {
                        _logger.LogInformation("No GPS data found in {FileName}", file.FileName);
                    }
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Error processing {FileName}", file.FileName);
                }
            }

            await _context.SaveChangesAsync();
            return Ok(new { 
                Processed = files.Count, 
                LocationsFound = results.Count, 
                New = newLocations.Count,
                Updated = updatedLocations.Count,
                Locations = results 
            });
        }

        [HttpPost("process-directory")]
        public async Task<IActionResult> ProcessPhotoDirectory([FromBody] DirectoryImportRequest request)
        {
            if (string.IsNullOrEmpty(request.DirectoryPath))
            {
                return BadRequest("No directory path provided.");
            }

            string directoryPath = NormalizePath(request.DirectoryPath);
            
            // Set date filter to last 2 months by default
            DateTime fromDate = DateTime.Now.AddMonths(-2);
            DateTime toDate = DateTime.Now;
            
            if (request.FromDate.HasValue)
                fromDate = request.FromDate.Value;
            
            if (request.ToDate.HasValue)
                toDate = request.ToDate.Value;

            // Special handling for Photos Library
            if (directoryPath.EndsWith(".photoslibrary", StringComparison.OrdinalIgnoreCase))
            {
                return await ProcessPhotosLibrary(directoryPath, fromDate, toDate, request.MaxImages);
            }

            if (!IoDirectory.Exists(directoryPath))
            {
                return BadRequest($"Directory not found: {directoryPath}");
            }

            // Get all image files from the directory that match our filter criteria
            var imageExtensions = new[] { ".jpg", ".jpeg", ".png", ".heic", ".heif" };
            _logger.LogInformation("Getting image files from {Directory} with date range {FromDate} to {ToDate}, max images: {MaxImages}", 
                directoryPath, fromDate, toDate, request.MaxImages);
                
            var imageFiles = GetImageFiles(
                directoryPath, 
                imageExtensions, 
                searchRecursively: request.IncludeSubDirectories,
                fromDate: fromDate,
                toDate: toDate,
                maxImages: request.MaxImages);

            if (imageFiles.Count == 0)
            {
                return BadRequest("No image files found in the specified directory matching your criteria.");
            }

            return await ProcessImageFiles(imageFiles, directoryPath, fromDate, toDate);
        }

        [HttpPost("recent-photos")]
        public async Task<IActionResult> ProcessRecentPhotos([FromBody] RecentPhotosRequest request)
        {
            if (string.IsNullOrEmpty(request.LibraryPath))
            {
                // Try to find Photos Library in default location
                string username = Environment.UserName;
                string defaultPath = Path.Combine("/Users", username, "Pictures", "Photos Library.photoslibrary");
                
                if (IoDirectory.Exists(defaultPath))
                {
                    request.LibraryPath = defaultPath;
                }
                else
                {
                    return BadRequest("Photos Library path not provided and default path not found.");
                }
            }

            string libraryPath = NormalizePath(request.LibraryPath);
            
            // Default to last 2 months if not specified
            DateTime fromDate = request.Months > 0
                ? DateTime.Now.AddMonths(-request.Months)
                : DateTime.Now.AddMonths(-2);
                
            return await ProcessPhotosLibrary(libraryPath, fromDate, DateTime.Now, request.MaxImages);
        }

        private async Task<IActionResult> ProcessPhotosLibrary(string libraryPath, DateTime fromDate, DateTime toDate, int? maxImages = null)
        {
            // Common paths within Photos Library where photos might be stored
            string[] possiblePhotoFolders = new[]
            {
                Path.Combine(libraryPath, "originals"),
                Path.Combine(libraryPath, "Masters"),
                Path.Combine(libraryPath, "resources", "masters"),
                Path.Combine(libraryPath, "resources", "derivatives")
            };

            var imageExtensions = new[] { ".jpg", ".jpeg", ".png", ".heic", ".heif" };
            var allImageFiles = new List<string>();

            _logger.LogInformation("Processing Photos Library at {Path} with date range {FromDate} to {ToDate}, max images: {MaxImages}", 
                libraryPath, fromDate, toDate, maxImages);

            foreach (var folder in possiblePhotoFolders)
            {
                if (IoDirectory.Exists(folder))
                {
                    // Since we might need to search across multiple folders, we'll collect all matching files
                    // then apply the maxImages limit to the combined set
                    var imageFiles = GetImageFiles(
                        folder, 
                        imageExtensions, 
                        searchRecursively: true,
                        fromDate: fromDate,
                        toDate: toDate);
                        
                    allImageFiles.AddRange(imageFiles);
                }
            }

            if (allImageFiles.Count == 0)
            {
                return BadRequest("No image files found in the Photos Library matching your criteria.");
            }

            // If maxImages is specified and we have collected files from multiple folders,
            // we need to apply the maxImages limit to the combined set
            if (maxImages.HasValue && maxImages.Value > 0 && maxImages.Value < allImageFiles.Count)
            {
                _logger.LogInformation("Limiting to {MaxImages} most recent images from {TotalImages} total images", 
                    maxImages.Value, allImageFiles.Count);
                    
                allImageFiles = allImageFiles
                    .Select(file => new { FilePath = file, LastModified = System.IO.File.GetLastWriteTime(file) })
                    .OrderByDescending(f => f.LastModified)
                    .Take(maxImages.Value)
                    .Select(f => f.FilePath)
                    .ToList();
            }

            return await ProcessImageFiles(allImageFiles, libraryPath, fromDate, toDate);
        }

        private async Task<IActionResult> ProcessImageFiles(List<string> imageFiles, string sourcePath, DateTime fromDate, DateTime toDate)
        {
            var results = new List<Location>();
            var skippedForDate = 0;
            var newLocations = new List<Location>();
            var updatedLocations = new List<Location>();
            int processedCount = 0;
            
            _logger.LogInformation("Processing {FileCount} image files from {SourcePath} with date range {FromDate} to {ToDate}", 
                imageFiles.Count, sourcePath, fromDate, toDate);

            foreach (var imagePath in imageFiles)
            {
                try
                {
                    using var stream = new FileStream(imagePath, FileMode.Open, FileAccess.Read);
                    var directories = ImageMetadataReader.ReadMetadata(stream);
                    
                    // Check date first to filter early
                    var dateTaken = GetDateTaken(directories);
                    
                    // Skip if date is outside our date range
                    if (!dateTaken.HasValue || dateTaken.Value < fromDate || dateTaken.Value > toDate)
                    {
                        skippedForDate++;
                        continue;
                    }
                    
                    var gpsDirectory = directories.OfType<GpsDirectory>().FirstOrDefault();

                    if (gpsDirectory != null && gpsDirectory.GetGeoLocation() != null)
                    {
                        var lat = gpsDirectory.GetGeoLocation().Latitude;
                        var lng = gpsDirectory.GetGeoLocation().Longitude;

                        var (city, country) = await GetLocationInfoAsync(lat, lng);
                        var fileName = Path.GetFileName(imagePath);

                        // Check if this photo already exists in the database
                        var existingLocation = await _context.Locations
                            .FirstOrDefaultAsync(l => 
                                l.PhotoFileName == fileName && 
                                Math.Abs(l.Latitude - lat) < 0.0001 && 
                                Math.Abs(l.Longitude - lng) < 0.0001 &&
                                l.CaptureDate.Date == dateTaken.Value.Date);

                        if (existingLocation != null)
                        {
                            // If existing location has unknown city/country, update it
                            bool updated = false;
                            
                            if ((existingLocation.City == "Unknown" || string.IsNullOrEmpty(existingLocation.City)) && 
                                city != "Unknown" && !string.IsNullOrEmpty(city))
                            {
                                existingLocation.City = city;
                                updated = true;
                            }
                            
                            if ((existingLocation.Country == "Unknown" || string.IsNullOrEmpty(existingLocation.Country)) && 
                                country != "Unknown" && !string.IsNullOrEmpty(country))
                            {
                                existingLocation.Country = country;
                                updated = true;
                            }
                            
                            if (updated)
                            {
                                _context.Locations.Update(existingLocation);
                                updatedLocations.Add(existingLocation);
                            }
                            
                            // Add to results in either case to show in UI
                            results.Add(existingLocation);
                        }
                        else
                        {
                            // Create new location
                            var location = new Location
                            {
                                Latitude = lat,
                                Longitude = lng,
                                CaptureDate = dateTaken.Value,
                                Country = country,
                                City = city,
                                PhotoFileName = fileName
                            };

                            _context.Locations.Add(location);
                            newLocations.Add(location);
                            results.Add(location);
                        }
                    }

                    processedCount++;
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Error processing {FileName}: {Error}", Path.GetFileName(imagePath), ex.Message);
                }
            }

            await _context.SaveChangesAsync();
            
            return Ok(new 
            { 
                Processed = processedCount, 
                LocationsFound = results.Count, 
                SkippedForDate = skippedForDate,
                New = newLocations.Count,
                Updated = updatedLocations.Count,
                Locations = results,
                DirectoryPath = sourcePath,
                DateRange = new { From = fromDate, To = toDate }
            });
        }

        private List<string> GetImageFiles(string directoryPath, string[] extensions, bool searchRecursively = false)
        {
            try
            {
                var searchOption = searchRecursively ? SearchOption.AllDirectories : SearchOption.TopDirectoryOnly;
                var allFiles = IoDirectory.GetFiles(directoryPath, "*.*", searchOption);
                
                return allFiles
                    .Where(file => extensions.Contains(Path.GetExtension(file).ToLower()))
                    .ToList();
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error listing files in directory {Directory}", directoryPath);
                return new List<string>();
            }
        }

        private List<string> GetImageFiles(string directoryPath, string[] extensions, bool searchRecursively = false, 
            DateTime? fromDate = null, DateTime? toDate = null, int? maxImages = null)
        {
            try
            {
                var searchOption = searchRecursively ? SearchOption.AllDirectories : SearchOption.TopDirectoryOnly;
                
                // Get all files first
                var allFiles = IoDirectory.GetFiles(directoryPath, "*.*", searchOption);
                
                // Filter by extension and get modification date
                var filteredFiles = allFiles
                    .Where(file => extensions.Contains(Path.GetExtension(file).ToLower()))
                    .Select(file => new {
                        FilePath = file,
                        LastModified = System.IO.File.GetLastWriteTime(file)
                    });
                
                // Apply date filtering if specified
                if (fromDate.HasValue)
                {
                    filteredFiles = filteredFiles.Where(f => f.LastModified >= fromDate.Value);
                }
                
                if (toDate.HasValue)
                {
                    filteredFiles = filteredFiles.Where(f => f.LastModified <= toDate.Value);
                }
                
                // Order by date (newest first)
                var orderedFiles = filteredFiles.OrderByDescending(f => f.LastModified);
                
                // Apply limit if specified
                IEnumerable<string> resultFiles;
                if (maxImages.HasValue && maxImages.Value > 0)
                {
                    resultFiles = orderedFiles.Take(maxImages.Value).Select(f => f.FilePath);
                }
                else
                {
                    resultFiles = orderedFiles.Select(f => f.FilePath);
                }
                
                // Execute the query and return file paths
                return resultFiles.ToList();
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error listing files in directory {Directory}", directoryPath);
                return new List<string>();
            }
        }

        private string NormalizePath(string path)
        {
            // Replace ~ with user home directory on macOS/Unix systems
            if (path.StartsWith("~"))
            {
                var homeDir = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
                path = Path.Combine(homeDir, path.Substring(1).TrimStart('/'));
            }
            
            // Convert to absolute path if relative
            if (!Path.IsPathRooted(path))
            {
                path = Path.GetFullPath(path);
            }
            
            return path;
        }

        private DateTime? GetDateTaken(IEnumerable<MetadataExtractor.Directory> directories)
        {
            // Try multiple ways to extract the date
            
            // First, try to get from EXIF SubIFD
            var exifSubDir = directories.OfType<ExifSubIfdDirectory>().FirstOrDefault();
            if (exifSubDir != null)
            {
                // First try original date/time
                if (exifSubDir.TryGetDateTime(ExifDirectoryBase.TagDateTimeOriginal, out var dateTaken))
                {
                    return dateTaken;
                }
                
                // Then try digitized date/time
                if (exifSubDir.TryGetDateTime(ExifDirectoryBase.TagDateTimeDigitized, out dateTaken))
                {
                    return dateTaken;
                }
            }
            
            // Try EXIF IFD0 (less accurate but better than nothing)
            var exifDir = directories.OfType<ExifIfd0Directory>().FirstOrDefault();
            if (exifDir != null && exifDir.TryGetDateTime(ExifDirectoryBase.TagDateTime, out var fileDate))
            {
                return fileDate;
            }
            
            // Last resort: try to get file creation date
            return null;
        }

        private async Task<(string City, string Country)> GetLocationInfoAsync(double lat, double lng)
        {
            try
            {
                // Check the cache first
                string cacheKey = GetCacheKey(lat, lng);
                
                if (TryGetFromCache(cacheKey, out var cachedLocation))
                {
                    _logger.LogInformation("Location cache hit for coordinates {Lat}, {Long}", lat, lng);
                    return cachedLocation;
                }
                
                // First try Google Maps API
                var (city, country) = await GetLocationFromGoogleMapsAsync(lat, lng);
                
                // Add successful result to cache
                if (city != "Unknown" && country != "Unknown")
                {
                    AddToCache(cacheKey, (city, country));
                    return (city, country);
                }
                
                // Fallback to simplified local geocoding if API fails
                var simplifiedResult = GetLocationInfoSimplified(lat, lng);
                
                // Add fallback result to cache only if it found something
                if (simplifiedResult.City != "Unknown" || simplifiedResult.Country != "Unknown")
                {
                    AddToCache(cacheKey, simplifiedResult);
                }
                
                return simplifiedResult;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error getting location info from API for coordinates {Lat}, {Long}", lat, lng);
                
                // Fallback to simplified geocoding
                return GetLocationInfoSimplified(lat, lng);
            }
        }
        
        private async Task<(string City, string Country)> GetLocationFromGoogleMapsAsync(double lat, double lng)
        {
            try
            {
                // Log API key (just the first few characters) for debugging
                string logApiKey = !string.IsNullOrEmpty(_googleMapsApiKey) && _googleMapsApiKey.Length > 4 
                    ? _googleMapsApiKey.Substring(0, 4) + "..." 
                    : "null or empty";
                _logger.LogInformation("Using Google Maps API key starting with: {ApiKeyPrefix}", logApiKey);
                
                // Ensure we have a proper API key
                if (string.IsNullOrEmpty(_googleMapsApiKey) || _googleMapsApiKey == "YOUR_API_KEY")
                {
                    _logger.LogWarning("No valid Google Maps API key provided. Using fallback geocoding.");
                    return ("Unknown", "Unknown");
                }
                
                using var httpClient = _httpClientFactory.CreateClient();
                
                // Use Google Maps Geocoding API with result_type to limit the response data
                // We only want locality (city) and country information
                string url = $"https://maps.googleapis.com/maps/api/geocode/json?latlng={lat},{lng}&result_type=locality|country&key={_googleMapsApiKey}";
                
                _logger.LogInformation("Calling Google Maps API for coordinates {Lat}, {Long}", lat, lng);
                var response = await httpClient.GetAsync(url);
                
                // Log the status code
                _logger.LogInformation("Google Maps API response status code: {StatusCode}", response.StatusCode);
                
                if (!response.IsSuccessStatusCode)
                {
                    var errorContent = await response.Content.ReadAsStringAsync();
                    _logger.LogWarning("Google Maps API returned error: {StatusCode}, Content: {Content}", 
                        response.StatusCode, errorContent);
                    return ("Unknown", "Unknown");
                }
                
                var content = await response.Content.ReadAsStringAsync();
                
                // Only log a short excerpt of the response to avoid excessive logging
                _logger.LogDebug("API Response (truncated): {Content}", 
                    content.Length > 100 ? content.Substring(0, 100) + "..." : content);
                
                // Parse the JSON response
                using var doc = JsonDocument.Parse(content);
                var root = doc.RootElement;
                
                // Check if the API request was successful
                if (!root.TryGetProperty("status", out var status) || status.GetString() != "OK")
                {
                    _logger.LogWarning("Google Maps API returned non-OK status: {Status}", 
                        status.GetString() ?? "Unknown");
                    return ("Unknown", "Unknown");
                }
                
                // Extract location data
                if (!root.TryGetProperty("results", out var results) || results.GetArrayLength() == 0)
                {
                    return ("Unknown", "Unknown");
                }
                
                string city = "Unknown";
                string country = "Unknown";
                
                // Process each result
                foreach (var result in results.EnumerateArray())
                {
                    // Get the address components
                    if (!result.TryGetProperty("address_components", out var components))
                    {
                        continue;
                    }
                    
                    // Find city and country components
                    foreach (var component in components.EnumerateArray())
                    {
                        if (!component.TryGetProperty("types", out var types))
                        {
                            continue;
                        }
                        
                        bool isCountry = false;
                        bool isLocality = false;
                        
                        // Check component types
                        foreach (var type in types.EnumerateArray())
                        {
                            string typeValue = type.GetString() ?? "";
                            
                            if (typeValue == "country")
                            {
                                isCountry = true;
                            }
                            else if (typeValue == "locality")
                            {
                                isLocality = true;
                            }
                        }
                        
                        // Extract values based on component type
                        if (isCountry && country == "Unknown" && component.TryGetProperty("long_name", out var countryName))
                        {
                            country = countryName.GetString() ?? "Unknown";
                        }
                        else if (isLocality && city == "Unknown" && component.TryGetProperty("long_name", out var cityName))
                        {
                            if (cityName.GetString() == "Greenhithe")
                            {
                                city = cityName.GetString() ?? "Unknown";
                            }
                            
                            if (cityName.GetString() == "St Albans")
                            {
                                city = cityName.GetString() ?? "Unknown";
                            }
                            
                            city = cityName.GetString() ?? "Unknown";
                        }
                    }
                }
                
                return (city, country);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error calling Google Maps API for coordinates {Lat}, {Long}", lat, lng);
                return ("Unknown", "Unknown");
            }
        }

        private (string City, string Country) GetLocationInfoSimplified(double lat, double lng)
        {
            // Simplified geocoding for MVP
            // In a real app, you would use a geocoding service like Google Maps, OpenStreetMap/Nominatim, etc.
            
            // For demo purposes only - this is extremely simplified
            string country = "Unknown";
            string city = "Unknown";

            // USA
            if (lat >= 24 && lat <= 49 && lng >= -125 && lng <= -66)
            {
                country = "United States";
                city = GetUSCity(lat, lng);
            }
            // Europe
            else if (lat >= 36 && lat <= 70 && lng >= -10 && lng <= 40)
            {
                if (lng >= -10 && lng <= 2 && lat >= 50 && lat <= 59) 
                {
                    country = "United Kingdom";
                    if (Math.Abs(lat - 51.5) < 1 && Math.Abs(lng - (-0.13)) < 1)
                        city = "London";
                }
                else if (lng >= 2 && lng <= 8 && lat >= 43 && lat <= 51)
                {
                    country = "France";
                    if (Math.Abs(lat - 48.85) < 1 && Math.Abs(lng - 2.35) < 1)
                        city = "Paris";
                }
                // Add more European countries as needed
            }
            // Australia
            else if (lat >= -44 && lat <= -10 && lng >= 110 && lng <= 155)
            {
                country = "Australia";
                if (Math.Abs(lat - (-33.87)) < 1 && Math.Abs(lng - 151.21) < 1)
                    city = "Sydney";
                else if (Math.Abs(lat - (-37.81)) < 1 && Math.Abs(lng - 144.96) < 1)
                    city = "Melbourne";
            }
            // Japan
            else if (lat >= 30 && lat <= 46 && lng >= 129 && lng <= 146)
            {
                country = "Japan";
                if (Math.Abs(lat - 35.68) < 1 && Math.Abs(lng - 139.77) < 1)
                    city = "Tokyo";
                else if (Math.Abs(lat - 34.67) < 1 && Math.Abs(lng - 135.5) < 1)
                    city = "Osaka";
            }
            // Thailand
            else if (lat >= 5 && lat <= 21 && lng >= 97 && lng <= 106)
            {
                country = "Thailand";
                if (Math.Abs(lat - 13.75) < 1 && Math.Abs(lng - 100.5) < 1)
                    city = "Bangkok";
            }
            
            return (city, country);
        }

        private string GetUSCity(double lat, double lng)
        {
            // Very simplified city detection for the US
            if (Math.Abs(lat - 40.71) < 1 && Math.Abs(lng - (-74.01)) < 1)
                return "New York";
            if (Math.Abs(lat - 34.05) < 1 && Math.Abs(lng - (-118.24)) < 1)
                return "Los Angeles";
            if (Math.Abs(lat - 41.88) < 1 && Math.Abs(lng - (-87.63)) < 1)
                return "Chicago";
            if (Math.Abs(lat - 37.77) < 1 && Math.Abs(lng - (-122.42)) < 1)
                return "San Francisco";
            if (Math.Abs(lat - 25.76) < 1 && Math.Abs(lng - (-80.19)) < 1)
                return "Miami";
            if (Math.Abs(lat - 29.76) < 1 && Math.Abs(lng - (-95.37)) < 1)
                return "Houston";
            if (Math.Abs(lat - 33.75) < 1 && Math.Abs(lng - (-84.39)) < 1)
                return "Atlanta";
            
            return "Unknown US City";
        }

        [HttpGet("test-geocoding")]
        public async Task<IActionResult> TestGeocoding([FromQuery] double lat = 40.7128, [FromQuery] double lon = -74.0060)
        {
            try
            {
                // Display API key configuration (masked for security)
                string maskedKey = !string.IsNullOrEmpty(_googleMapsApiKey) && _googleMapsApiKey.Length > 4
                    ? _googleMapsApiKey.Substring(0, 4) + "..." + _googleMapsApiKey.Substring(_googleMapsApiKey.Length - 2)
                    : "not configured";
                
                _logger.LogInformation("Testing geocoding with API key (masked): {ApiKey}", maskedKey);
                
                // First try the API
                string apiUrl = $"https://maps.googleapis.com/maps/api/geocode/json?latlng={lat},{lon}&result_type=locality|country&key={_googleMapsApiKey}";
                string rawResponse = "Not fetched";
                
                // API response data
                string apiCity = "Not fetched";
                string apiCountry = "Not fetched";
                int statusCode = 0;
                
                try
                {
                    using var httpClient = _httpClientFactory.CreateClient();
                    var response = await httpClient.GetAsync(apiUrl);
                    statusCode = (int)response.StatusCode;
                    
                    // Only get a preview of the response to avoid huge payloads
                    var fullResponse = await response.Content.ReadAsStringAsync();
                    rawResponse = fullResponse.Length > 500 
                        ? fullResponse.Substring(0, 500) + "... [truncated]" 
                        : fullResponse;
                    
                    if (response.IsSuccessStatusCode)
                    {
                        var (city, country) = await GetLocationFromGoogleMapsAsync(lat, lon);
                        apiCity = city;
                        apiCountry = country;
                    }
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "API call error");
                }
                
                // Then try the simplified fallback
                var (fallbackCity, fallbackCountry) = GetLocationInfoSimplified(lat, lon);
                
                return Ok(new
                {
                    ApiConfiguration = new
                    {
                        KeyConfigured = !string.IsNullOrEmpty(_googleMapsApiKey) && _googleMapsApiKey != "YOUR_API_KEY",
                        MaskedKey = maskedKey,
                        StatusCode = statusCode,
                        ResponsePreview = rawResponse
                    },
                    Coordinates = new { Latitude = lat, Longitude = lon },
                    ApiResult = new { City = apiCity, Country = apiCountry },
                    FallbackResult = new { City = fallbackCity, Country = fallbackCountry },
                    RecommendedAction = statusCode == 401 || statusCode == 403 ? "Your API key appears to be invalid or unauthorized. Check for typos and ensure it's entered correctly in appsettings.json." :
                                        statusCode == 429 ? "You've exceeded your API request limit. Wait or upgrade your plan." : 
                                        "Use the API result if successful, otherwise use the fallback."
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error testing geocoding");
                return StatusCode(500, "An error occurred testing the geocoding service");
            }
        }

        // Cache helper methods
        private string GetCacheKey(double lat, double lng)
        {
            // Round coordinates to reduce precision and group nearby points
            double roundedLat = Math.Round(lat / COORDINATE_PRECISION) * COORDINATE_PRECISION;
            double roundedLng = Math.Round(lng / COORDINATE_PRECISION) * COORDINATE_PRECISION;
            return $"{roundedLat}:{roundedLng}";
        }
        
        private bool TryGetFromCache(string cacheKey, out (string City, string Country) location)
        {
            lock (_cacheLock)
            {
                if (_locationCache.TryGetValue(cacheKey, out var cachedData))
                {
                    // Check if cache entry is still valid
                    if (cachedData.CachedTime > DateTime.Now.AddDays(-CACHE_EXPIRY_DAYS))
                    {
                        location = (cachedData.City, cachedData.Country);
                        return true;
                    }
                    
                    // Remove expired entry
                    _locationCache.Remove(cacheKey);
                }
                
                location = default;
                return false;
            }
        }
        
        private void AddToCache(string cacheKey, (string City, string Country) location)
        {
            lock (_cacheLock)
            {
                _locationCache[cacheKey] = (location.City, location.Country, DateTime.Now);
                
                // Simple cache size management - if it gets too big, remove oldest entries
                const int maxCacheSize = 1000;
                if (_locationCache.Count > maxCacheSize)
                {
                    var oldestEntries = _locationCache
                        .OrderBy(kvp => kvp.Value.CachedTime)
                        .Take(_locationCache.Count - maxCacheSize)
                        .Select(kvp => kvp.Key)
                        .ToList();
                        
                    foreach (var key in oldestEntries)
                    {
                        _locationCache.Remove(key);
                    }
                }
            }
        }
        
        // Add API endpoint to inspect and clear the cache
        [HttpGet("location-cache-stats")]
        public IActionResult GetCacheStats()
        {
            lock (_cacheLock)
            {
                return Ok(new
                {
                    CacheSize = _locationCache.Count,
                    OldestEntry = _locationCache.Any() ? _locationCache.Values.Min(v => v.CachedTime) : (DateTime?)null,
                    NewestEntry = _locationCache.Any() ? _locationCache.Values.Max(v => v.CachedTime) : (DateTime?)null,
                    CoordinatePrecision = COORDINATE_PRECISION,
                    CacheExpiryDays = CACHE_EXPIRY_DAYS
                });
            }
        }
        
        [HttpPost("clear-location-cache")]
        public IActionResult ClearCache()
        {
            lock (_cacheLock)
            {
                int count = _locationCache.Count;
                _locationCache.Clear();
                return Ok(new { Message = $"Cleared {count} entries from location cache" });
            }
        }
    }

    public class DirectoryImportRequest
    {
        public string DirectoryPath { get; set; } = string.Empty;
        public DateTime? FromDate { get; set; }
        public DateTime? ToDate { get; set; }
        public bool IncludeSubDirectories { get; set; } = true;
        public int? MaxImages { get; set; } // Limit to the most recent X images
    }

    public class RecentPhotosRequest
    {
        public string LibraryPath { get; set; } = string.Empty;
        public int Months { get; set; } = 2;  // Default to 2 months
        public int? MaxImages { get; set; }   // Limit to the most recent X images
    }
} 