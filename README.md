# Location Tracker

A web application for tracking the location of links, files, and photos.

## Features

- Create tracking links with custom slugs
- Generate masked URLs that look like file or photo sharing links
- Record visitor information including GPS coordinates
- View visit history and statistics

## Prerequisites

- Node.js 14 or higher
- MongoDB Atlas account

## Deployment to Vercel

1. Fork or clone this repository

2. Create a MongoDB Atlas database
   - Sign up for [MongoDB Atlas](https://www.mongodb.com/cloud/atlas)
   - Create a new cluster
   - Create a database user with read/write permissions
   - Whitelist IP addresses (0.0.0.0/0 for development)
   - Get your connection string

3. Configure Vercel
   - Sign up for [Vercel](https://vercel.com)
   - Import your GitHub repository
   - Add the following environment variables:
     - `MONGODB_URI`: Your MongoDB connection string
     - `BASE_URL`: Your Vercel app URL (e.g., https://your-app-name.vercel.app)

4. Deploy your application
   - Vercel will automatically detect the configuration in `vercel.json`
   - The application will be built and deployed

## Local Development

1. Clone the repository
   ```
   git clone https://github.com/yourusername/location-tracker.git
   cd location-tracker
   ```

2. Install dependencies
   ```
   npm install
   ```

3. Create a `.env` file in the root directory with the following variables:
   ```
   MONGODB_URI=your_mongodb_connection_string
   BASE_URL=http://localhost:3000
   ```

4. Start the development server
   ```
   npm run dev
   ```

5. Open http://localhost:3000 in your browser

## License

MIT 