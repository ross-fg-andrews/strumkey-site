# Ukelio - Ukulele Group Web App

A web application for ukulele group organizers and members to create, share, and manage songs, songbooks, and group meetings.

## Tech Stack

- **Frontend**: React 18 with Vite
- **Backend/Database**: InstantDB (real-time data, auth, permissions)
- **Styling**: Tailwind CSS
- **Routing**: React Router v6
- **Hosting**: Vercel (recommended)

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- InstantDB account (get your App ID from [InstantDB Dashboard](https://instantdb.com))

### Installation

1. Install dependencies:
```bash
npm install
```

2. Set up environment variables:
```bash
cp .env.example .env
```

Edit `.env` and add your InstantDB App ID:
```
VITE_INSTANTDB_APP_ID=your_app_id_here
```

3. Start the development server:
```bash
npm run dev
```

The app will be available at `http://localhost:3000`

### Initial Setup

1. **Configure InstantDB Schema**: 
   - Go to your InstantDB dashboard
   - Import the schema from `src/db/schema.js`
   - Set up permissions from `src/db/permissions.js` (if using InstantDB's permission system)

2. **Seed Chord Library**:
   - Once authenticated, you can run the chord seeding function
   - Import and call `seedChords(db)` from `src/data/chord-seed.js`

## Project Structure

```
src/
├── components/       # Reusable UI components
├── contexts/         # React contexts (Auth, etc.)
├── db/              # InstantDB schema and queries
├── pages/           # Page components
├── utils/           # Utility functions
├── data/            # Seed data and static data
└── App.jsx          # Main app component with routing
```

## Features

- ✅ User authentication with magic links
- ✅ Create and edit songs with chord notation
- ✅ Share songs with groups
- ✅ Create songbooks (private and group)
- ✅ Group management
- ✅ Schedule meetings with RSVP
- ✅ Real-time data synchronization

## Development Roadmap

See the comprehensive plan document for detailed feature roadmap and implementation timeline.

## Environment Variables

- `VITE_INSTANTDB_APP_ID`: Your InstantDB application ID

## Building for Production

```bash
npm run build
```

The built files will be in the `dist/` directory, ready to deploy to Vercel or any static hosting service.

## License

MIT

