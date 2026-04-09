# Sector 7 — Multiplayer Server Deploy Guide

## Step 1: Push the server to GitHub

Create a NEW repo just for the server (separate from your frontend repo):

1. Go to github.com → New repository → name it `sector7-server`
2. Open Terminal and run:

```bash
cd ~/path/to/your/Testing/sector7-server
git init
git add .
git commit -m "sector 7 multiplayer server"
git remote add origin https://github.com/YOUR_USERNAME/sector7-server.git
git push -u origin main
```

---

## Step 2: Deploy to Railway

1. Go to **railway.app** and sign up (free, use GitHub login)
2. Click **New Project → Deploy from GitHub repo**
3. Select your `sector7-server` repo
4. Railway auto-detects Node.js and runs `npm start`
5. Once deployed, click your service → **Settings → Networking → Generate Domain**
6. Copy the domain — it'll look like: `sector7-server-production.up.railway.app`

---

## Step 3: Update the game with your server URL

Open `index.html` and find this line near the bottom:

```javascript
const SERVER_URL = 'wss://YOUR-APP.railway.app';
```

Replace it with your Railway domain:

```javascript
const SERVER_URL = 'wss://sector7-server-production.up.railway.app';
```

Save, commit, and push to your frontend repo. Vercel will auto-redeploy.

---

## Step 4: Play with friends

- Share your Vercel URL with friends
- Everyone enters the **same room code** to join the same game
- Leave the room code blank to join the global room
- Blue = human players, Green = AI enemies

---

## Rooms

- Max 8 players per room
- AI waves run independently on each client
- Players can shoot each other (PvP) and AI enemies
- Deaths respawn after 5 seconds
- Killing a human player gives +250 points
