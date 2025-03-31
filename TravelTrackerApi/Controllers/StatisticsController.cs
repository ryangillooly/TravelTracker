using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
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
        public async Task<IActionResult> GetLocations([FromQuery] int? year = null)
        {
            try
            {
                IQueryable<Location> query = _context.Locations;

                if (year.HasValue)
                {
                    query = query.Where(l => l.CaptureDate.Year == year.Value);
                }

                var locations = await query
                    .Select(l => new
                    {
                        l.Id,
                        l.Latitude,
                        l.Longitude,
                        l.Country,
                        l.City,
                        l.CaptureDate,
                        l.PhotoFileName
                    })
                    .ToListAsync();

                return Ok(locations);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error retrieving locations");
                return StatusCode(500, "An error occurred while retrieving locations");
            }
        }
    }
} 