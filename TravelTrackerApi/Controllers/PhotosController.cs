using Microsoft.AspNetCore.Mvc;
using MetadataExtractor;
using MetadataExtractor.Formats.Exif;
using TravelTrackerApi.Data;
using TravelTrackerApi.Models;
using System.Globalization;

namespace TravelTrackerApi.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class PhotosController : ControllerBase
    {
        private readonly AppDbContext _context;
        private readonly ILogger<PhotosController> _logger;

        public PhotosController(AppDbContext context, ILogger<PhotosController> logger)
        {
            _context = context;
            _logger = logger;
        }

        [HttpPost("process")]
        public async Task<IActionResult> ProcessPhotos(IFormFileCollection files)
        {
            if (files == null || files.Count == 0)
            {
                return BadRequest("No files were uploaded.");
            }

            var results = new List<Location>();

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

                        // Simple geocoding (in a real app, use a geocoding service)
                        var (country, city) = GetLocationInfo(lat, lng);

                        var dateTaken = GetDateTaken(directories) ?? DateTime.Now;

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
                        results.Add(location);
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
            return Ok(new { Processed = files.Count, LocationsFound = results.Count, Locations = results });
        }

        private DateTime? GetDateTaken(IEnumerable<MetadataExtractor.Directory> directories)
        {
            // Extract date from EXIF data
            var exifSubDir = directories.OfType<ExifSubIfdDirectory>().FirstOrDefault();
            if (exifSubDir != null && exifSubDir.TryGetDateTime(ExifDirectoryBase.TagDateTimeOriginal, out var dateTaken))
            {
                return dateTaken;
            }
            return null;
        }

        private (string Country, string City) GetLocationInfo(double lat, double lng)
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
            
            return (country, city);
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
            
            return "Unknown US City";
        }
    }
} 