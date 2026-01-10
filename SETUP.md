# Strumkey Setup Guide

Follow these steps to get your Strumkey app up and running.

## Step 1: Install Dependencies

Make sure you have Node.js 18+ installed, then run:

```bash
npm install
```

## Step 2: Set Up InstantDB

1. Create an account at [InstantDB](https://instantdb.com)
2. Create a new app in your InstantDB dashboard
3. Copy your App ID

## Step 3: Configure Environment Variables

1. Create a `.env` file in the root directory:
```bash
cp .env.example .env
```

2. Edit `.env` and add your InstantDB App ID:
```
VITE_INSTANTDB_APP_ID=your_app_id_here
```

## Step 4: Set Up InstantDB Schema

1. Go to your InstantDB dashboard
2. Navigate to the Schema section
3. Import or manually create the schema from `src/db/schema.js`

The schema includes:
- Users
- Groups & Group Members
- Songs & Song Shares
- Songbooks & Songbook Songs
- Meetings & Meeting RSVPs
- Chords (reference library)

## Step 5: Configure Permissions

Set up permissions in your InstantDB dashboard. See `src/db/permissions.md` for reference.

Key permission rules:
- Users can only edit their own songs
- Group members can view shared songs
- Only group admins can create meetings
- All authenticated users can view chords

## Step 6: Seed Chord Library

After authenticating for the first time, you need to seed the chord library:

1. Open the browser console
2. Run:
```javascript
import { runInitialSetup } from './src/utils/setup-utils';
runInitialSetup();
```

Or create a temporary admin page that calls `runInitialSetup()` on mount.

## Step 7: Start Development Server

```bash
npm run dev
```

The app will be available at `http://localhost:3000`

## Step 8: Test the App

1. Visit the landing page
2. Sign in with your email (magic link)
3. Create your first song
4. Create a group
5. Share songs with the group

## Troubleshooting

### "App ID not found" error
- Make sure your `.env` file has the correct `VITE_INSTANTDB_APP_ID`
- Restart the dev server after changing `.env`

### Schema errors
- Verify your InstantDB schema matches `src/db/schema.js`
- Check that all relationships are properly configured

### Permission errors
- Review `src/db/permissions.md` for required permissions
- Make sure permissions are set in InstantDB dashboard

### Chords not showing
- Run the chord seeding function (see Step 6)
- Check that chords exist in your InstantDB database

## Next Steps

- Customize the styling in `src/index.css`
- Add more chord variations to `src/data/chord-seed.js`
- Implement additional features from your plan

## Deployment

To deploy to Vercel:

1. Push your code to GitHub
2. Import the project in Vercel
3. Add environment variable: `VITE_INSTANTDB_APP_ID`
4. Deploy!

The app will automatically build and deploy.

