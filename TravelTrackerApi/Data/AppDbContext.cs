using Microsoft.EntityFrameworkCore;
using TravelTrackerApi.Models;

namespace TravelTrackerApi.Data
{
    public class AppDbContext : DbContext
    {
        public AppDbContext(DbContextOptions<AppDbContext> options) : base(options)
        {
        }

        public DbSet<Location> Locations { get; set; } = null!;
    }
} 