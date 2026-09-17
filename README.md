# 🚍 KSRTC Radio (ആനവണ്ടി)

A nostalgic, ambient web experience recreating the feeling of traveling in a Kerala State Road Transport Corporation (KSRTC) bus while listening to classic Malayalam melodies.

---

## ✨ Features

- **Scenic Bus Ride**: Looping passenger POV video with realistic lighting and roadside views.
- **Ambient Engine Sound**: Synchronized 30% bus engine rumble that pauses when the music or bus stops.
- **Rain Mode**: Rain-streaked windshield with functioning wipers and soothing ambient rain audio.
- **Interactive Controls**:
  - 📢 Realistic Bus Horn
  - 🔔 Authentic Dual-Ring Conductor Bell
  - 🚏 "Make a Stop" sequence with stop request chime
- **Integrated YouTube Radio**: Continuous playback of nostalgic Malayalam tracks with album art, scrubbable progress bar, and automatic shuffle.
- **Mobile-Optimized Framing**: Automatically shifts the windshield perspective on mobile portrait displays so both the road ahead and the bus cabin are visible.

---

## 🚀 Live Demo / GitHub Pages Deployment

This project is built with standard static web technologies (**HTML5, CSS3, Modern ES6 JavaScript**) and requires zero build steps or servers.

### To host on GitHub Pages:
1. Push this repository to GitHub:
 `ash
 git add .
 git commit -m \Initial commit of KSRTC Radio\
 git push -u origin main
 `
2. Go to your repository on GitHub:
 - Click **Settings** → **Pages** (in the left sidebar).
 - Under **Build and deployment** → **Source**, select **Deploy from a branch**.
 - Under **Branch**, select main and / (root), then click **Save**.
3. In a couple of minutes, your site will be live at https://<your-username>.github.io/<repo-name>/.

---

## 💻 Local Development

Run the lightweight local development server (with HTTP 206 byte-range audio/video streaming):

`ash
npm start
`
Then open [http://localhost:4174](http://localhost:4174) in your browser.

