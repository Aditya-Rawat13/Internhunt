require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const { scrapeInternships } = require('./services/scraper');
const Internship = require('./models/Internship');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Connect to MongoDB
mongoose.connect('mongodb+srv://jayeshjena2003:hunter12345@internhunt.qukfwbe.mongodb.net/')
    .then(() => console.log('Connected to MongoDB'))
    .catch(err => console.error('MongoDB connection error:', err));

// Routes
app.get('/api/internships', async (req, res) => {
    try {
        const internships = await Internship.find().sort({ scrapedAt: -1 });
        const formatted = internships.map(intern => ({
            id: intern._id?.toString() || intern.id,
            title: intern.title,
            company: intern.company,
            location: intern.location,
            salary: intern.stipend || "",
            deadline: intern.applyBy || "",
            source: intern.sourceSite || "Unknown",
            description: `Scraped at: ${intern.scrapedAt ? new Date(intern.scrapedAt).toLocaleString() : ""}`,
            logoUrl: intern.logoUrl || "",
            tags: Array.isArray(intern.tags) ? intern.tags : [],
            skills: Array.isArray(intern.skills) ? intern.skills : [],
            applyBy: intern.applyBy || "",
            link: intern.link || "",
        }));
        res.json(formatted);
    } catch (error) {
        res.status(500).json({ error: 'Error fetching internships' });
    }
});

app.post('/api/scrape', async (req, res) => {
    try {
        const internships = await scrapeInternships();
        res.json({ message: 'Scraping completed successfully', count: internships.length });
    } catch (error) {
        res.status(500).json({ error: 'Error during scraping' });
    }
});

// Start server
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
}); 