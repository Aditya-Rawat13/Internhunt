const mongoose = require('mongoose');

const internshipSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true
    },
    company: {
        type: String,
        required: true
    },
    location: {
        type: String,
        required: true
    },
    duration: {
        type: String,
        required: true
    },
    stipend: {
        type: String,
        required: true
    },
    applyBy: {
        type: String,
        required: true
    },
    link: {
        type: String,
        required: true
    },
    sourceSite: {
        type: String,
        required: true
    },
    scrapedAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('Internship', internshipSchema); 