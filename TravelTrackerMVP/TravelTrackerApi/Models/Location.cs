namespace TravelTrackerApi.Models
{
    public class Location
    {
        public int Id { get; set; }
        public double Latitude { get; set; }
        public double Longitude { get; set; }
        public DateTime CaptureDate { get; set; }
        public string? Country { get; set; }
        public string? City { get; set; }
        public string? PhotoFileName { get; set; } // For reference only
    }
} 