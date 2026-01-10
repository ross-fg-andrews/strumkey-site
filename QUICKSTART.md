# Quick Start Guide

## Step 1: Install Node.js

If you don't have Node.js installed:

**Option A: Download from website**
- Visit https://nodejs.org
- Download and install the LTS version

**Option B: Using Homebrew (Mac)**
```bash
brew install node
```

Verify installation:
```bash
node --version
npm --version
```

## Step 2: Install Dependencies

In the project directory, run:
```bash
npm install
```

This will install all required packages (React, Vite, InstantDB, etc.)

## Step 3: Set Up InstantDB

1. **Create an InstantDB account:**
   - Go to https://instantdb.com
   - Sign up for a free account

2. **Create a new app:**
   - In the InstantDB dashboard, create a new app
   - Copy your App ID

3. **Create environment file:**
   ```bash
   # Create .env file
   echo "VITE_INSTANTDB_APP_ID=your_app_id_here" > .env
   ```
   
   Or manually create `.env` file with:
   ```
   VITE_INSTANTDB_APP_ID=your_actual_app_id_here
   ```

## Step 4: Configure InstantDB Schema

1. Go to your InstantDB dashboard
2. Navigate to Schema section
3. You'll need to set up the schema manually or import it
4. See `src/db/schema.js` for the schema structure

**Note:** InstantDB's schema setup might be done through their UI. Check their documentation for the exact process.

## Step 5: Run the Development Server

```bash
npm run dev
```

The dev server automatically manages cache - it will clear cache when configuration files change. The app will start and you should see:
```
  VITE v5.x.x  ready in xxx ms

  ➜  Local:   http://localhost:3000/
  ➜  Network: use --host to expose
```

Open http://localhost:3000 in your browser!

## Step 6: First-Time Setup

1. **Sign in** with your email (magic link authentication)
2. **Seed the chord library:**
   - Open browser console (F12)
   - Run:
   ```javascript
   // You'll need to import and run the setup function
   // This might need to be done through a temporary admin page
   ```

## Troubleshooting

### Dev Server Showing Old/Stale Code

The dev server automatically clears cache when config files change. If your changes still aren't appearing:

1. **Force clear cache**:
   ```bash
   npm run dev:clean
   ```
   This forces cache clearing before starting the server.

2. **Manual cache clear**:
   ```bash
   npm run clean:cache
   npm run dev
   ```

3. **Hard refresh browser**:
   - Windows/Linux: `Ctrl+Shift+R`
   - Mac: `Cmd+Shift+R`

4. **If still not working**:
   ```bash
   npm run clean:all
   npm install
   npm run dev
   ```

### "Cannot find module" errors
- Make sure you ran `npm install`
- Try: `npm run clean:all && npm install`

### "App ID not found" error
- Check that `.env` file exists and has the correct `VITE_INSTANTDB_APP_ID`
- Restart the dev server after creating/modifying `.env` (use `npm run dev:clean`)

### Port 3000 already in use
- Change the port in `vite.config.js` or kill the process using port 3000

### InstantDB connection errors
- Verify your App ID is correct
- Check InstantDB dashboard for any setup requirements
- Make sure schema is properly configured

## Available Commands

- `npm run dev` - Start development server (auto-manages cache)
- `npm run dev:clean` - Force clear cache and start dev server
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm run lint` - Run ESLint
- `npm run clean:cache` - Clear Vite cache
- `npm run clean:all` - Clear all caches

## Next Steps

Once the app is running:
1. Visit the landing page
2. Sign in with your email
3. Create your first song
4. Set up your first group
5. Start using Strumkey!



