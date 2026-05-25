# Dreamers Academic Command Center

Premium academic timetable & faculty management system for **Doon Defence Dreamers** coaching institute.

## 🎯 Features

- 🛡️ **Role-based login** — Director portal + Teacher portal (separate URLs, separate dashboards)
- 📱 **Mobile OTP authentication** (demo mode — any 4 digits work)
- 📊 **Director Command Center** — live class tracking, conflicts, workload, analytics
- 📚 **Topic Tracking** — class-wise chapter progress with topic-by-topic breakdown
- 👨‍🏫 **Teacher portal** — mobile-first, only own schedule + topic logging
- 📥 **Excel bulk import** — upload existing timetable, auto-parse
- ⚡ **Conflict engine** — auto-detect double-bookings, time errors
- 🎨 **Premium design** — defence academy aesthetic, gold + dark theme

## 🚀 Quick Deploy

**See `DEPLOY_GUIDE.md` for step-by-step instructions** (in Hindi/English).

Short version:
1. Upload to GitHub (free)
2. Connect to Vercel (free) 
3. Auto-deploys at `*.vercel.app`

## 🛠 Local Development (developers only)

```bash
npm install
npm run dev      # localhost:5173
npm run build    # production build
```

## 📦 Tech Stack

- **React 18** + **Vite 5** (fast build, instant HMR)
- **Tailwind CSS 3** (utility-first styling)
- **lucide-react** (icons)
- Fonts: **Italiana**, **Fraunces**, **Cormorant Garamond**, **JetBrains Mono** (via Google Fonts)

## 🗂 Project Structure

```
dreamers-app/
├── index.html            # Entry HTML
├── package.json          # Dependencies
├── vite.config.js        # Vite config
├── tailwind.config.js    # Tailwind config
├── postcss.config.js     # PostCSS config
├── src/
│   ├── main.jsx          # React entry point
│   ├── App.jsx           # Main app component (all views)
│   └── index.css         # Tailwind directives
├── README.md             # This file
└── DEPLOY_GUIDE.md       # Deployment guide (Hindi)
```

## ⚠️ Important

This is a **design prototype**:
- Data is hardcoded (mock)
- OTP is demo only (no real SMS)
- Refresh resets state
- No backend / database

For a **real production app** with persistent data, real authentication, and live integrations — additional backend development needed (Supabase/Firebase + MSG91/Twilio + custom API).

## 📄 License

Private — Doon Defence Dreamers.
