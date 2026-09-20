# 🚍 KSRTC Radio (ആനവണ്ടി) | Malayalam Nostalgia

<div align="center">

[![Live Demo](https://img.shields.io/badge/Live%20Demo-ksrtcradio.online-E31837?style=for-the-badge&logo=google-chrome&logoColor=white)](https://ksrtcradio.online)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge)](LICENSE)
[![HTML5 / CSS3 / ES6](https://img.shields.io/badge/Built%20With-HTML5%20%7C%20CSS3%20%7C%20ES6-blue?style=for-the-badge&logo=javascript&logoColor=white)](https://github.com/bensonthomas9745/ksrtc-radio)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg?style=for-the-badge)](https://github.com/bensonthomas9745/ksrtc-radio/pulls)

**Ride through nostalgia with KSRTC Radio (ആനവണ്ടി). Experience the soul of Kerala bus journeys with classic Malayalam melodies, ambient engine rumbles, soothing monsoon rain, and authentic bus sounds.**

[**Experience the Journey Now »**](https://ksrtcradio.online)

</div>

---

## 🌴 About The Project

There is nothing quite like a window-seat journey on a Kerala State Road Transport Corporation (**KSRTC / ആനവണ്ടി**) bus — the cool breeze sweeping through the open shutter, lush green paddy fields and rubber plantations rushing past, the low metallic rumble of the diesel engine, and timeless Malayalam songs playing softly over the cabin speaker.

**KSRTC Radio** is a lightweight, zero-dependency ambient web experience engineered to bring that exact feeling right to your browser, anywhere in the world.

---

## ✨ Key Features

### 🚍 Scenic Passenger POV Journey
- **Authentic Window-Seat POV**: Seamless looping video capturing the winding roads, misty hills, and coconut palm-lined routes of Kerala.
- **Cinematic Start & Boarding Animation**: Animated retro bus grill, destination board (*"FAST PASSENGER • ആനവണ്ടി"*), glowing headlights, and engine rumble sequence before entering the cabin.
- **"Make a Stop" Experience**: Hit the *Make a Stop* button to simulate getting off at a bus stop with dedicated stop chime audio, deceleration video, and seamless resume.

### 🎵 Curated Malayalam Nostalgia Radio
- **169+ Evergreen Classics**: A hand-picked catalog spanning golden-era film melodies, romantic hits, melody mojo gems, and monsoon tracks (*Swapnakkoodu, Anwar, Lion, Diamond Necklace, Beautiful, Trivandrum Lodge, Salt N' Pepper, and many more*).
- **Auto-Shuffle**: The playlist automatically shuffles on every visit or refresh for an unpredictable journey.
- **Full Player Controls**: Play, pause, skip forward, jump backward, and live scrubbable progress bar with track runtime and elapsed time.
- **Album Art & Metadata**: High-resolution cover art, song titles, artists, and movie tags.

### 🌧️ Monsoon Rain Mode
- **Rain Overlay**: Toggle soothing Kerala monsoon rains streaming down the glass.
- **Wiper Animations**: Functional windscreen wipers sweeping across the window.
- **Layered Rain Audio**: Dedicated ambient rain track that blends naturally with the music and engine.

### 🎚️ Multi-Track Audio Engine & Sound Controls
- **Independent Engine Rumble**: Dedicated bus running sound (`runsound.mp3`) running at ~30% volume by default.
- **Independent Rain Audio**: Dedicated rain audio layer (`rainsound.mp3`) enabled when Rain Mode is turned on.
- **Individual Volume Sliders**: Custom sliders (0%–100%) and instant mute toggles for both the bus engine and rain sounds with persistent user preferences (`localStorage`).
- **Synchronized Audio Pausing**: Ambient sounds smoothly react when music stops or when making a stop.

### 🔔 Interactive Bus Controls
- 📢 **Realistic Air Horn**: Punchy KSRTC air horn blast with button vibration state.
- 🔔 **Dual-Ring Conductor Bell**: Authentic two-stroke metallic bell chime signalling the driver.
- 🚏 **Stop Request**: Interactive halt sequence.

### 📱 Apple-Style Playlist Drawer & Search
- **Slide-Out Sheet**: Smooth slide-up bottom sheet / drawer on mobile and responsive drawer on desktop.
- **Real-Time Instant Search**: Filter all 169+ tracks dynamically by title, movie name, or artist.
- **"Now Playing" Banner & Jump**: Displays current track banner with a one-click *"Jump to Song"* button that smoothly scrolls to the active song in the playlist.

### 📲 Mobile & In-App Browser Optimization
- **Responsive Perspective**: Dynamically adjusts viewport framing in portrait mode so both the road ahead and the bus dashboard are visible.
- **In-App Browser Support**: Detects embedded webviews (Instagram, Facebook, Threads, TikTok) and displays a clean helper dialog to open the site in external browsers (Safari/Chrome) for background audio playback.
- **Fullscreen Mode**: Dedicated one-click fullscreen toggle for an immersive travel setup.

---

## 🎛️ Controls & Interface Guide

| Control | Description |
| :--- | :--- |
| **Start Journey** | Boards the bus, initiates audio preload, and starts engine rumble and radio. |
| **Play / Pause** | Toggles the radio playback. Pauses ambient engine sound automatically. |
| **Next / Previous** | Skips to the next or previous Malayalam classic in the shuffled rotation. |
| **Make a Stop** | Plays bus stop sequence video and stop chime. |
| **Horn** | Triggers the signature Kerala bus horn sound effect. |
| **Bus Bell** | Rings the conductor's classic double-bell bell. |
| **Rain Mode** | Toggles rainy windshield video, wiper motion, and rain sound. |
| **Bus Sound Slider** | Adjusts the diesel engine rumble volume (0% – 100%). |
| **Rain Sound Slider** | Adjusts rain ambient sound volume (0% – 100%). |
| **Songs (Drawer)** | Opens the searchable 169+ track list. |
| **Fullscreen** | Toggles browser fullscreen mode. |

---

## 🛠️ Tech Stack & Architecture

- **Frontend**: Pure Vanilla HTML5, CSS3, Modern ES6+ JavaScript.
- **No Bundlers / Frameworks**: Zero build steps, zero external frameworks (no React, Vue, or Webpack required) for instant load times and 100% portability.
- **Streaming Engine**:
  - HTML5 `<video>` elements with progressive chunk buffering and fallback image safety.
  - YouTube IFrame API integration with background audio synchronization.
  - Web Audio / HTML5 Audio API for low-latency layered sound effects.
- **Responsive Styling**: Modern CSS Flexbox & CSS Grid, backdrop-filter glassmorphism, CSS custom properties, and fluid typography.

---

## 🚀 Running Locally

### Prerequisites
- [Node.js](https://nodejs.org/) (v16 or higher)

### Quick Start

1. **Clone the repository**:
   ```bash
   git clone https://github.com/bensonthomas9745/ksrtc-radio.git
   cd ksrtc-radio
   ```

2. **Start the local server**:
   ```bash
   npm start
   ```
   *The custom development server supports HTTP 206 partial content byte-range streaming for seamless video and audio seeking.*

3. **Open in browser**:
   Visit [http://localhost:4174](http://localhost:4174) in your browser.

4. **Verify integrity**:
   ```bash
   npm run verify
   ```

---

## 🌐 Deployment (GitHub Pages & Custom Domain)

This project is ready to be deployed as a static site anywhere (GitHub Pages, Cloudflare Pages, Vercel, Netlify):

### GitHub Pages Setup
1. Push your changes to the `main` branch:
   ```bash
   git add .
   git commit -m "Update KSRTC Radio"
   git push origin main
   ```
2. Navigate to **Settings** → **Pages** in your GitHub repository.
3. Under **Build and deployment** → **Source**, select **Deploy from a branch**.
4. Set branch to `main` and folder to `/(root)`, then save.
5. If using a custom domain (e.g., `ksrtcradio.online`), ensure the `CNAME` file is present in the repository root.

---

## 🤝 Contributing

Contributions, song recommendations, sound improvements, and bug fixes are very welcome!

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/NewFeature`)
3. Commit your Changes (`git commit -m 'Add some NewFeature'`)
4. Push to the Branch (`git push origin feature/NewFeature`)
5. Open a Pull Request

---

## 📜 License & Attribution

- Distributed under the **MIT License**. See `LICENSE` for more information.
- This is an unofficial, non-commercial fan tribute to the iconic **Kerala State Road Transport Corporation (KSRTC)** and Malayalam cinema music. All logos, songs, and media belong to their respective copyright holders.

<div align="center">
  <sub>Made with ❤️ for all ആനവണ്ടി lovers across the globe.</sub>
</div>
