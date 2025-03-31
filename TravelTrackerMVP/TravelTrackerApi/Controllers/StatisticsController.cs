using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Linq;
using TravelTrackerApi.Data;
using TravelTrackerApi.Models;

namespace TravelTrackerApi.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class StatisticsController : ControllerBase
    {
        private readonly AppDbContext _context;
        private readonly ILogger<StatisticsController> _logger;

        public StatisticsController(AppDbContext context, ILogger<StatisticsController> logger)
        {
            _context = context;
            _logger = logger;
        }

        [HttpGet]
        public async Task<IActionResult> GetStatistics([FromQuery] int? year = null)
        {
            try
            {
                IQueryable<Location> query = _context.Locations;

                if (year.HasValue)
                {
                    query = query.Where(l => l.CaptureDate.Year == year.Value);
                }

                var locations = await query.ToListAsync();

                var countries = locations
                    .Where(l => !string.IsNullOrEmpty(l.Country) && l.Country != "Unknown")
                    .Select(l => l.Country)
                    .Distinct()
                    .ToList();

                var cities = locations
                    .Where(l => !string.IsNullOrEmpty(l.City) && l.City != "Unknown")
                    .Select(l => new { l.City, l.Country })
                    .Distinct()
                    .ToList();

                return Ok(new
                {
                    CountriesCount = countries.Count,
                    Countries = countries,
                    CitiesCount = cities.Count,
                    PhotosCount = locations.Count
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error retrieving statistics");
                return StatusCode(500, "An error occurred while retrieving statistics");
            }
        }

        [HttpGet("locations")]
        public async Task<IActionResult> GetLocations([FromQuery] int? year = null, [FromQuery] bool cluster = false)
        {
            try
            {
                IQueryable<Location> query = _context.Locations;

                if (year.HasValue)
                {
                    query = query.Where(l => l.CaptureDate.Year == year.Value);
                }

                var locations = await query.ToListAsync();

                if (cluster)
                {
                    // Simple clustering by city
                    var result = locations
                        .Where(l => !string.IsNullOrEmpty(l.City) && l.City != "Unknown")
                        .GroupBy(l => l.City + ", " + l.Country)
                        .Select(g => new 
                        {
                            Id = g.First().Id,
                            Latitude = g.Average(l => l.Latitude),
                            Longitude = g.Average(l => l.Longitude),
                            Country = g.First().Country,
                            City = g.First().City,
                            CaptureDate = g.Max(l => l.CaptureDate),
                            PhotoFileName = g.First().PhotoFileName,
                            Count = g.Count()
                        })
                        .ToList();
                    
                    // Add locations with unknown cities
                    var unknownLocations = locations
                        .Where(l => string.IsNullOrEmpty(l.City) || l.City == "Unknown")
                        .Select(l => new 
                        {
                            l.Id,
                            l.Latitude,
                            l.Longitude,
                            l.Country,
                            City = "Unknown location",
                            l.CaptureDate,
                            l.PhotoFileName,
                            Count = 1
                        });
                    
                    return Ok(result.Concat(unknownLocations));
                }
                else
                {
                    // Return individual locations
                    var result = locations.Select(l => new
                    {
                        l.Id,
                        l.Latitude,
                        l.Longitude,
                        l.Country,
                        l.City,
                        l.CaptureDate,
                        l.PhotoFileName,
                        Count = 1
                    });
                    
                    return Ok(result);
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error retrieving locations");
                return StatusCode(500, "An error occurred while retrieving locations");
            }
        }

        [HttpGet("clustered-locations")]
        public async Task<IActionResult> GetClusteredLocations([FromQuery] int? year = null, [FromQuery] string clusterBy = "city")
        {
            try
            {
                IQueryable<Location> query = _context.Locations;

                if (year.HasValue)
                {
                    query = query.Where(l => l.CaptureDate.Year == year.Value);
                }

                var locations = await query.ToListAsync();

                if (clusterBy.ToLower() == "country")
                {
                    var countryLocations = ClusterLocationsByCountry(locations);
                    return Ok(countryLocations);
                }
                else
                {
                    // Default to city clustering
                    var cityLocations = ClusterLocationsByCity(locations);
                    return Ok(cityLocations);
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error retrieving clustered locations");
                return StatusCode(500, "An error occurred while retrieving clustered locations");
            }
        }
        
        [HttpGet("zoom-based-locations")]
        public async Task<IActionResult> GetZoomBasedLocations([FromQuery] int? year = null, [FromQuery] int zoomLevel = 2)
        {
            try
            {
                IQueryable<Location> query = _context.Locations;

                if (year.HasValue)
                {
                    query = query.Where(l => l.CaptureDate.Year == year.Value);
                }

                var locations = await query.ToListAsync();
                
                // Determine clustering strategy based on zoom level
                if (zoomLevel <= 3) // World view
                {
                    return Ok(ClusterLocationsByCountry(locations));
                }
                else if (zoomLevel <= 6) // Continental/region view
                {
                    return Ok(ClusterLocationsByCity(locations));
                }
                else if (zoomLevel <= 10) // City view
                {
                    // Group by area within city (using more precise coordinates)
                    return Ok(ClusterLocationsByArea(locations, 0.05)); // ~5km precision
                }
                else // Neighborhood view or higher zoom
                {
                    // Return individual pins (or cluster with high precision)
                    return Ok(ClusterLocationsByArea(locations, 0.01)); // ~1km precision
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error retrieving zoom-based locations");
                return StatusCode(500, "An error occurred while retrieving zoom-based locations");
            }
        }
        
        private List<ClusteredLocation> ClusterLocationsByArea(List<Location> locations, double precision)
        {
            // Group by coordinates rounded to the specified precision
            var grouped = locations
                .GroupBy(l => new { 
                    Lat = Math.Round(l.Latitude / precision) * precision,
                    Lng = Math.Round(l.Longitude / precision) * precision
                })
                .Select(g => new ClusteredLocation
                {
                    Id = $"area-{g.Key.Lat}-{g.Key.Lng}".Replace(".", "p"),
                    Latitude = g.Average(l => l.Latitude),
                    Longitude = g.Average(l => l.Longitude),
                    Country = g.Count() == 1 ? g.First().Country : g.GroupBy(l => l.Country).OrderByDescending(x => x.Count()).First().Key,
                    City = g.Count() == 1 ? g.First().City : g.GroupBy(l => l.City).OrderByDescending(x => x.Count()).First().Key,
                    CaptureDate = g.Max(l => l.CaptureDate),
                    Count = g.Count(),
                    VisitDates = g.Select(l => l.CaptureDate).OrderByDescending(d => d).Take(10).ToList(),
                    DetailLevel = "area"
                })
                .ToList();
                
            return grouped;
        }

        private List<ClusteredLocation> ClusterLocationsByCity(List<Location> locations)
        {
            // First, filter out locations with unknown or null cities
            var validLocations = locations
                .Where(l => !string.IsNullOrEmpty(l.City) && l.City != "Unknown")
                .ToList();

            // Group by City and Country (to handle cities with the same name in different countries)
            var grouped = validLocations
                .GroupBy(l => new { l.City, l.Country })
                .Select(g => new ClusteredLocation
                {
                    Id = $"city-{g.Key.City}-{g.Key.Country}".Replace(" ", "-").ToLower(),
                    Latitude = g.Average(l => l.Latitude),
                    Longitude = g.Average(l => l.Longitude),
                    Country = g.Key.Country,
                    City = g.Key.City,
                    // Take the most recent photo date
                    CaptureDate = g.Max(l => l.CaptureDate),
                    Count = g.Count(),
                    // List of photo dates for this cluster
                    VisitDates = g.Select(l => l.CaptureDate).OrderByDescending(d => d).Take(10).ToList(),
                    DetailLevel = "city"
                })
                .ToList();

            // Handle locations with unknown cities by adding them individually
            var unknownCityLocations = locations
                .Where(l => string.IsNullOrEmpty(l.City) || l.City == "Unknown")
                .Select(l => new ClusteredLocation
                {
                    Id = $"location-{l.Id}",
                    Latitude = l.Latitude,
                    Longitude = l.Longitude,
                    Country = l.Country,
                    City = "Unknown location",
                    CaptureDate = l.CaptureDate,
                    Count = 1,
                    VisitDates = new List<DateTime> { l.CaptureDate },
                    DetailLevel = "point"
                });

            // Combine the results
            var result = grouped.Concat(unknownCityLocations).ToList();
            return result;
        }

        private List<ClusteredLocation> ClusterLocationsByCountry(List<Location> locations)
        {
            // Filter out locations with unknown or null countries
            var validLocations = locations
                .Where(l => !string.IsNullOrEmpty(l.Country) && l.Country != "Unknown")
                .ToList();

            // Group by Country
            var grouped = validLocations
                .GroupBy(l => l.Country)
                .Select(g => new ClusteredLocation
                {
                    Id = $"country-{g.Key}".Replace(" ", "-").ToLower(),
                    // Calculate the center point for the country (simple average)
                    Latitude = g.Average(l => l.Latitude),
                    Longitude = g.Average(l => l.Longitude),
                    Country = g.Key,
                    City = $"{g.Select(l => l.City).Where(c => !string.IsNullOrEmpty(c) && c != "Unknown").Distinct().Count()} cities",
                    CaptureDate = g.Max(l => l.CaptureDate),
                    Count = g.Count(),
                    VisitDates = g.Select(l => l.CaptureDate).OrderByDescending(d => d).Take(10).ToList(),
                    DetailLevel = "country"
                })
                .ToList();

            // Handle locations with unknown countries
            var unknownCountryLocations = locations
                .Where(l => string.IsNullOrEmpty(l.Country) || l.Country == "Unknown")
                .Select(l => new ClusteredLocation
                {
                    Id = $"location-{l.Id}",
                    Latitude = l.Latitude,
                    Longitude = l.Longitude,
                    Country = "Unknown",
                    City = l.City ?? "Unknown location",
                    CaptureDate = l.CaptureDate,
                    Count = 1,
                    VisitDates = new List<DateTime> { l.CaptureDate },
                    DetailLevel = "point"
                });

            // Combine the results
            var result = grouped.Concat(unknownCountryLocations).ToList();
            return result;
        }

        [HttpDelete("clear-all-data")]
        public async Task<IActionResult> ClearAllData()
        {
            try
            {
                // Delete all location records
                _context.Locations.RemoveRange(_context.Locations);
                await _context.SaveChangesAsync();
                
                return Ok(new { message = "All location data has been cleared successfully" });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error clearing database");
                return StatusCode(500, "An error occurred while clearing the database");
            }
        }
    }

    public class ClusteredLocation
    {
        public string Id { get; set; }
        public double Latitude { get; set; }
        public double Longitude { get; set; }
        public string Country { get; set; }
        public string City { get; set; }
        public DateTime CaptureDate { get; set; }
        public int Count { get; set; }
        public List<DateTime> VisitDates { get; set; }
        public string DetailLevel { get; set; } = "unknown";
    }
} 