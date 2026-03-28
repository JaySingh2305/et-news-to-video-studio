# 📰 ET News to Video Studio

A next-generation automated AI native news studio prototype. This Next.js web application transforms any business/financial news article URL into a fully-produced, short-form video briefing—complete with AI avatars, voiceovers, dynamic B-roll, subtitles, and real-time stock data—all with a single click.

It specifically features the **Economic Times** brand styling and was built to demonstrate the capabilities of large multimodal models running complex agentic pipelines.

## ✨ Features

- **🪄 Magic Automation:** Simply paste a news article URL (e.g., from The Economic Times) into the top search bar. The app takes over, executing a parallelized agent pipeline that handles everything from scraping to rendering.
- **🌐 Bilingual Output:** Flip a switch to natively generate your scripts, headlines, and voiceovers in either **English (EN)** or **Hindi (HI)**. 
- **🎤 AI Avatars & Voiceovers:** Uses *Gemini 2.5 Flash Image* to synthesize professional news anchor avatars and *Gemini 2.5 Flash TTS* to generate natural, broadcast-quality voiceovers.
- **📈 Real-Time Data Extractor:** Agentically searches the web via *Gemini 3 Flash* to fetch real-time stock ticker prices for companies mentioned in your news script.
- **🎥 Dynamic B-Roll Imagery:** Automatically analyzes the script to dream up highly visual, descriptive prompts and streams 4K photorealistic images for the background.
- **✂️ Video Rendering & Export:** Uses *Remotion* and HTML5 Canvas API to generate a final, synchronized `.mp4` / `.webm` broadcast with scrolling tickers and animated subtitles ready for download.
- **💅 ET Signature UI:** A sleek, fully responsive interface inspired by the classic red, white, and black Economic Times style. Features a draggable, resizable timeline track editor.

## 🚀 Tech Stack

- **Framework:** [Next.js](https://nextjs.org/) (React)
- **Styling:** [Tailwind CSS](https://tailwindcss.com/)
- **Core AI Integration:** [`@google/genai`](https://www.npmjs.com/package/@google/genai) SDK
- **Video Composition:** [Remotion](https://www.remotion.dev/)
- **Web Scraping:** [Cheerio](https://cheerio.js.org/)

## 🛠️ Run Locally

**Prerequisites:** Node.js (v18+ recommended)

1. **Clone & Install Dependencies**
   ```bash
   npm install
   ```

2. **Configure Environment Variables**
   Create a `.env.local` file in the root directory and add your Google Gemini API key:
   ```env
   NEXT_PUBLIC_GEMINI_API_KEY="your_api_key_here"
   ```

3. **Start the Development Server**
   ```bash
   npm run dev
   ```

4. **Experience the Magic**
   Open `http://localhost:3000` in your browser. Grab any financial article URL, paste it in the top bar, and click **Magic Gen**.
