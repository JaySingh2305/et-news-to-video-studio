'use client';

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Search, Loader2, FileText, Video, Play, Pause, Settings, User, Image as ImageIcon, Mic, LayoutTemplate, Layers, Download, Wand2, Type as TypeIcon, Music, Clock, ChevronRight, X, Plus } from 'lucide-react';
import { GoogleGenAI, Type } from '@google/genai';
import { Player } from '@remotion/player';
import { NewsBroadcast } from './components/NewsBroadcast';

function safeJsonParse(text: string, fallback: any) {
  try {
    const cleaned = text.replace(/^```json\n?/m, '').replace(/\n?```$/m, '').trim();
    return JSON.parse(cleaned);
  } catch (e) {
    console.warn('Failed to parse JSON:', e);
    return fallback;
  }
}

function writeString(view: DataView, offset: number, string: string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

function createWavUrl(base64Pcm: string, sampleRate: number = 24000): { url: string, duration: number } {
  const binaryString = atob(base64Pcm);
  const dataSize = binaryString.length;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  const audioData = new Uint8Array(buffer, 44);
  for (let i = 0; i < binaryString.length; i++) {
    audioData[i] = binaryString.charCodeAt(i);
  }

  const blob = new Blob([buffer], { type: 'audio/wav' });
  const duration = dataSize / (sampleRate * 2); // 16-bit mono = 2 bytes per sample
  return { url: URL.createObjectURL(blob), duration };
}

const AVATAR_PERSONAS = [
  { id: 'anchor_m', name: 'News Anchor (M)', prompt: 'A photorealistic, professional Indian male news anchor sitting at a modern news desk with Economic Times background. High quality, 4k, cinematic lighting, broadcast studio background.' },
  { id: 'anchor_f', name: 'News Anchor (F)', prompt: 'A photorealistic, professional Indian female news anchor sitting at a modern news desk with Economic Times background. High quality, 4k, cinematic lighting, broadcast studio background.' },
  { id: 'tech', name: 'Tech Reviewer', prompt: 'A casual, friendly Indian tech reviewer in a modern studio with neon lights in the background. Photorealistic, 4k, cinematic.' },
  { id: 'finance', name: 'Financial Analyst', prompt: 'A sharp Indian financial analyst in a high-end corporate office with charts in the background. Photorealistic, 4k, cinematic.' },
];

const VOICES = ['Puck', 'Charon', 'Kore', 'Fenrir', 'Zephyr'];

export default function Home() {
  const [activeTab, setActiveTab] = useState<'script' | 'avatar' | 'visuals'>('script');

  // Script State
  const [url, setUrl] = useState('');
  const [isScraping, setIsScraping] = useState(false);
  const [script, setScript] = useState('');
  const [headline, setHeadline] = useState('');
  const [language, setLanguage] = useState<'English' | 'Hindi'>('English');

  // Voice State
  const [selectedVoice, setSelectedVoice] = useState('Charon');
  const [audioData, setAudioData] = useState<string | null>(null);
  const [isGeneratingAudio, setIsGeneratingAudio] = useState(false);
  const [audioDurationFrames, setAudioDurationFrames] = useState(300); // Default 10s at 30fps

  // Avatar State
  const [selectedPersona, setSelectedPersona] = useState(AVATAR_PERSONAS[0]);
  const [customAvatarPrompt, setCustomAvatarPrompt] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string>('');
  const [isGeneratingAvatar, setIsGeneratingAvatar] = useState(false);

  // Visuals State
  const [bRollImages, setBRollImages] = useState<string[]>([]);
  const [stockData, setStockData] = useState<{ symbol: string, price: string, change: string }[]>([]);
  const [isGeneratingVisuals, setIsGeneratingVisuals] = useState(false);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', index.toString());
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === dropIndex) return;

    const newImages = [...bRollImages];
    const [draggedImage] = newImages.splice(draggedIndex, 1);
    newImages.splice(dropIndex, 0, draggedImage);

    setBRollImages(newImages);
    setDraggedIndex(null);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
  };

  // Global Progress
  const [progressMsg, setProgressMsg] = useState('');
  const [error, setError] = useState('');
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [isProcessingPipeline, setIsProcessingPipeline] = useState(false);
  const [timelineHeight, setTimelineHeight] = useState(256);
  const isResizingRef = useRef(false);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizingRef.current) return;
      const newHeight = window.innerHeight - e.clientY;
      const boundedHeight = Math.max(120, Math.min(newHeight, window.innerHeight * 0.8));
      setTimelineHeight(boundedHeight);
    };

    const handleMouseUp = () => {
      if (isResizingRef.current) {
        isResizingRef.current = false;
        document.body.style.cursor = 'default';
        document.body.classList.remove('select-none');
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  const handleResizeStart = () => {
    isResizingRef.current = true;
    document.body.style.cursor = 'row-resize';
    document.body.classList.add('select-none');
  };

  const handleExportVideo = async () => {
    if (!audioData || !avatarUrl) {
      setError('Please generate audio and avatar first.');
      return;
    }

    setIsExporting(true);
    setExportProgress(0);
    setError('');

    try {
      const canvas = document.createElement('canvas');
      canvas.width = 1920;
      canvas.height = 1080;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Could not create canvas context');

      const loadImage = (src: string) => new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = src;
      });

      const avatarImg = await loadImage(avatarUrl);
      const bRollImgs = await Promise.all(bRollImages.map(loadImage));

      const audio = new Audio(audioData);
      audio.crossOrigin = 'anonymous';

      // Wait for audio metadata to get duration
      await new Promise((resolve) => {
        audio.addEventListener('loadedmetadata', resolve, { once: true });
      });

      const duration = audio.duration;
      if (!duration || !isFinite(duration)) throw new Error('Invalid audio duration');

      // Pre-calculate subtitles
      const words = script ? script.split(' ').filter(Boolean) : [];
      let totalWeight = 0;
      const wordWeights = words.map(word => {
        let weight = word.length + 2;
        if (word.endsWith(',')) weight += 10;
        if (word.endsWith('.') || word.endsWith('!') || word.endsWith('?')) weight += 20;
        totalWeight += weight;
        return weight;
      });

      const secondsPerWeight = duration / totalWeight;
      let currentWeight = 0;
      const chunksData: { words: any[], startTime: number, endTime: number }[] = [];
      let currentChunk: any[] = [];
      let chunkStartTime = 0;

      words.forEach((word, index) => {
        const wordWeight = wordWeights[index];
        const startTime = currentWeight * secondsPerWeight;
        const endTime = (currentWeight + wordWeight) * secondsPerWeight;

        if (currentChunk.length === 0) {
          chunkStartTime = startTime;
        }

        currentChunk.push({ word, startTime, endTime });
        currentWeight += wordWeight;

        const isSentenceEnd = word.endsWith('.') || word.endsWith('!') || word.endsWith('?');
        if (currentChunk.length >= 7 || isSentenceEnd || index === words.length - 1) {
          chunksData.push({
            words: currentChunk,
            startTime: chunkStartTime,
            endTime: currentWeight * secondsPerWeight
          });
          currentChunk = [];
        }
      });

      const captureStream = (canvas as any).captureStream || (canvas as any).mozCaptureStream;
      if (!captureStream) throw new Error('Video export is not supported in this browser.');
      const canvasStream = captureStream.call(canvas, 30);

      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const audioCtx = new AudioContextClass();
      const source = audioCtx.createMediaElementSource(audio);
      const dest = audioCtx.createMediaStreamDestination();
      source.connect(dest);
      // Mute audio during export by not connecting to destination
      // source.connect(audioCtx.destination);

      const combinedStream = new MediaStream([
        ...canvasStream.getVideoTracks(),
        ...dest.stream.getAudioTracks()
      ]);

      let options = { mimeType: 'video/webm' };
      if (MediaRecorder.isTypeSupported('video/webm;codecs=vp9')) {
        options.mimeType = 'video/webm;codecs=vp9';
      } else if (MediaRecorder.isTypeSupported('video/webm;codecs=vp8')) {
        options.mimeType = 'video/webm;codecs=vp8';
      } else if (MediaRecorder.isTypeSupported('video/mp4')) {
        options.mimeType = 'video/mp4';
      }

      const recorder = new MediaRecorder(combinedStream, options);
      const chunks: Blob[] = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: options.mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'broadcast' + (options.mimeType.includes('mp4') ? '.mp4' : '.webm');
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        setIsExporting(false);
        setExportProgress(0);
      };

      recorder.start();
      await audio.play();

      const drawFrame = () => {
        if (audio.ended || audio.paused) {
          if (recorder.state === 'recording') recorder.stop();
          return;
        }

        const time = audio.currentTime;
        setExportProgress(Math.round((time / duration) * 100));

        // Clear
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, 1920, 1080);

        const hasBRoll = bRollImgs.length > 0;
        const introTime = hasBRoll ? duration * 0.2 : duration;
        const outroTime = hasBRoll ? duration * 0.2 : 0;
        const bRollTotalTime = duration - introTime - outroTime;

        // Draw Avatar (Base)
        if (!hasBRoll || time <= introTime || time >= (duration - outroTime)) {
          const scale = Math.max(1920 / avatarImg.width, 1080 / avatarImg.height);
          const w = avatarImg.width * scale;
          const h = avatarImg.height * scale;
          const x = (1920 - w) / 2;
          const y = (1080 - h) / 2;
          ctx.drawImage(avatarImg, x, y, w, h);
        } else if (hasBRoll) {
          // Draw B-Roll
          const bRollTime = time - introTime;
          const timePerImg = bRollTotalTime / bRollImgs.length;
          const imgIndex = Math.min(Math.floor(bRollTime / timePerImg), bRollImgs.length - 1);

          const imgTime = bRollTime % timePerImg;
          const progress = imgTime / timePerImg;
          const scale = 1 + (0.15 * progress);

          const img = bRollImgs[imgIndex];
          const baseScale = Math.max(1920 / img.width, 1080 / img.height);
          const w = img.width * baseScale * scale;
          const h = img.height * baseScale * scale;
          const x = (1920 - w) / 2;
          const y = (1080 - h) / 2;

          ctx.drawImage(img, x, y, w, h);
        }

        // Draw Subtitles
        if (script && chunksData.length > 0) {
          const activeChunk = chunksData.find(c => time >= c.startTime && time <= c.endTime);
          if (activeChunk) {
            ctx.save();
            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom';

            let totalWidth = 0;
            const wordWidths = activeChunk.words.map(w => {
              const isActive = time >= w.startTime && time <= w.endTime;
              ctx.font = isActive ? '800 58px system-ui, sans-serif' : '800 56px system-ui, sans-serif';
              const width = ctx.measureText(w.word).width;
              return width;
            });

            totalWidth = wordWidths.reduce((a, b) => a + b, 0) + (wordWidths.length - 1) * 16;

            let startX = (1920 - totalWidth) / 2;
            const y = 1080 - 280;

            activeChunk.words.forEach((w, i) => {
              const isActive = time >= w.startTime && time <= w.endTime;
              const isPast = time > w.endTime;

              ctx.font = isActive ? '800 58px system-ui, sans-serif' : '800 56px system-ui, sans-serif';

              ctx.shadowColor = 'rgba(0,0,0,0.8)';
              ctx.shadowBlur = 15;
              ctx.shadowOffsetY = 4;

              if (isActive) {
                ctx.fillStyle = '#fbbf24';
              } else if (isPast) {
                ctx.fillStyle = '#ffffff';
              } else {
                ctx.fillStyle = 'rgba(255,255,255,0.6)';
              }

              const wordWidth = wordWidths[i];
              ctx.fillText(w.word, startX + wordWidth / 2, y);

              startX += wordWidth + 16;
            });

            ctx.restore();
          }
        }

        // Draw Lower Third
        if (headline) {
          const entranceProgress = Math.min(time / 0.5, 1);
          const translateY = 200 * (1 - entranceProgress);

          ctx.save();
          ctx.translate(0, translateY);

          ctx.fillStyle = 'rgba(17, 24, 39, 0.95)';
          ctx.fillRect(80, 1080 - 90 - 120, 1760, 120);
          ctx.fillStyle = '#ef4444';
          ctx.fillRect(80, 1080 - 90 - 120, 8, 120);

          ctx.fillStyle = 'white';
          ctx.font = 'bold 42px system-ui, sans-serif';
          ctx.textBaseline = 'middle';
          ctx.fillText(headline, 120, 1080 - 90 - 60);

          ctx.restore();
        }

        // Draw Ticker
        if (stockData && stockData.length > 0) {
          ctx.fillStyle = '#111827';
          ctx.fillRect(0, 1080 - 60, 1920, 60);
          ctx.fillStyle = '#374151';
          ctx.fillRect(0, 1080 - 62, 1920, 2);

          ctx.font = 'bold 24px system-ui, sans-serif';
          ctx.textBaseline = 'middle';
          const speed = 150;
          const startX = 1920 - (time * speed);

          let currentX = startX;
          for (let j = 0; j < 10; j++) {
            for (let i = 0; i < stockData.length; i++) {
              const stock = stockData[i];
              ctx.fillStyle = '#9ca3af';
              ctx.fillText(stock.symbol, currentX, 1080 - 30);
              currentX += ctx.measureText(stock.symbol).width + 12;

              ctx.fillStyle = 'white';
              ctx.fillText('₹' + stock.price, currentX, 1080 - 30);
              currentX += ctx.measureText('₹' + stock.price).width + 12;

              const isPos = stock.change.startsWith('+');
              ctx.fillStyle = isPos ? '#10b981' : '#ef4444';
              const changeText = (isPos ? '▲ ' : '▼ ') + stock.change;
              ctx.fillText(changeText, currentX, 1080 - 30);
              currentX += ctx.measureText(changeText).width + 80;
            }
          }
        }

        requestAnimationFrame(drawFrame);
      };

      drawFrame();

    } catch (err: any) {
      console.error(err);
      setIsExporting(false);
      setExportProgress(0);
      setError(err.message || 'Failed to export video');
    }
  };

  const handleMagicProcess = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url) return;
    setIsProcessingPipeline(true);
    setError('');

    try {
      // 1. Scrape
      setProgressMsg('Extracting article from URL...');
      const res = await fetch('/api/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to extract article');
      // 2. Generate Script
      setProgressMsg('Writing news script...');
      const ai = new GoogleGenAI({ apiKey: process.env.NEXT_PUBLIC_GEMINI_API_KEY });
      const prompt = `Rewrite the following news article into a punchy, exactly 5-sentence broadcast script. The tone MUST be "Financial Professional". The final script AND a catchy headline MUST be written entirely in ${language}.\n\nHeadline: ${data.headline}\n\nBody: ${data.body}`;
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: { headline: { type: Type.STRING }, script: { type: Type.STRING } }
          }
        }
      });
      
      const parsed = safeJsonParse(response.text || '{}', { headline: data.headline, script: '' });
      const generatedScript = parsed.script || '';
      
      setHeadline(parsed.headline || data.headline);
      setScript(generatedScript);

      setProgressMsg('Generating AI assets (Voice, Avatar, B-Roll)...');

      // 3. Audio
      const audioPromise = ai.models.generateContent({
        model: 'gemini-2.5-flash-preview-tts',
        contents: generatedScript,
        config: {
          responseModalities: ['AUDIO'],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: selectedVoice } } }
        }
      }).then(r => {
        const inlineData = r.candidates?.[0]?.content?.parts?.[0]?.inlineData;
        if (inlineData?.data) {
          const { url, duration } = createWavUrl(inlineData.data, 24000);
          setAudioData(url);
          const frames = Math.ceil(duration * 30);
          setAudioDurationFrames(frames > 0 ? frames : 300);
        }
      });

      // 4. Avatar
      const promptToUse = customAvatarPrompt.trim() || selectedPersona.prompt;
      const avatarPromise = ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: promptToUse,
      }).then(r => {
        const inlineData = r.candidates?.[0]?.content?.parts?.find(p => p.inlineData)?.inlineData;
        if (inlineData?.data) {
          setAvatarUrl(`data:${inlineData.mimeType || 'image/png'};base64,${inlineData.data}`);
        }
      });

      // 5. Visuals & Data
      const visualsPromise = (async () => {
        const searchRes = await ai.models.generateContent({
          model: 'gemini-3-flash-preview',
          contents: `Find the current real-time stock prices and daily percentage changes for up to 5 companies mentioned or relevant to this script. Identify the companies regardless of the language and provide the symbol, price, and percentage change. Script: ${data.headline} ${generatedScript}`,
          config: { tools: [{ googleSearch: {} }] }
        });

        const stockRes = await ai.models.generateContent({
          model: 'gemini-3-flash-preview',
          contents: `Extract the stock symbols, prices, and changes from the following text into a JSON array of objects. Each object must have 'symbol' (e.g. AAPL, TCS), 'price' (e.g. "150.00"), and 'change' (e.g. "+1.2%" or "-0.5%"). Text: ${searchRes.text}`,
          config: {
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.ARRAY,
              items: { type: Type.OBJECT, properties: { symbol: { type: Type.STRING }, price: { type: Type.STRING }, change: { type: Type.STRING } } }
            }
          }
        });
        setStockData(safeJsonParse(stockRes.text || '[]', []));

        const promptRes = await ai.models.generateContent({
          model: 'gemini-3-flash-preview',
          contents: `Extract exactly 5 highly visual, descriptive image prompts based on this broadcast script. Translate concepts into English if necessary. Make them photorealistic and cinematic. Script: ${generatedScript}`,
          config: { responseMimeType: 'application/json', responseSchema: { type: Type.ARRAY, items: { type: Type.STRING } } }
        });
        const prompts = safeJsonParse(promptRes.text || '[]', []);

        const newBRoll = [];
        for (let i = 0; i < Math.min(prompts.length, 5); i++) {
          const imgRes = await ai.models.generateContent({
            model: 'gemini-2.5-flash-image',
            contents: prompts[i] + " photorealistic, cinematic, 4k, highly detailed",
          });
          const inlineData = imgRes.candidates?.[0]?.content?.parts?.find(p => p.inlineData)?.inlineData;
          if (inlineData?.data) {
            newBRoll.push(`data:${inlineData.mimeType || 'image/png'};base64,${inlineData.data}`);
          }
        }
        setBRollImages(newBRoll);
      })();

      await Promise.all([audioPromise, avatarPromise, visualsPromise]);
      setProgressMsg('Video ready to preview!');
      setTimeout(() => setProgressMsg(''), 3000);

    } catch (err: any) {
      setError(err.message || 'Pipeline failed');
    } finally {
      setIsProcessingPipeline(false);
    }
  };

  const handleScrape = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url) return;
    setIsScraping(true);
    setError('');
    try {
      const res = await fetch('/api/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to extract article');

      setProgressMsg('Generating script from article...');
      const ai = new GoogleGenAI({ apiKey: process.env.NEXT_PUBLIC_GEMINI_API_KEY });
      const prompt = `Rewrite the following news article into a punchy, exactly 5-sentence broadcast script. The tone MUST be "Financial Professional". The final script AND a catchy headline MUST be written entirely in ${language}.\n\nHeadline: ${data.headline}\n\nBody: ${data.body}`;
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: { headline: { type: Type.STRING }, script: { type: Type.STRING } }
          }
        }
      });

      const parsed = safeJsonParse(response.text || '{}', { headline: data.headline, script: '' });
      setHeadline(parsed.headline || data.headline);
      setScript(parsed.script || '');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsScraping(false);
      setProgressMsg('');
    }
  };

  const handleGenerateAudio = async () => {
    if (!script) return;
    setIsGeneratingAudio(true);
    setError('');
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.NEXT_PUBLIC_GEMINI_API_KEY });
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-preview-tts',
        contents: script,
        config: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: selectedVoice } }
          }
        }
      });
      const inlineData = response.candidates?.[0]?.content?.parts?.[0]?.inlineData;
      if (inlineData && inlineData.data) {
        const { url, duration } = createWavUrl(inlineData.data, 24000);
        setAudioData(url);
        const frames = Math.ceil(duration * 30);
        setAudioDurationFrames(frames > 0 ? frames : 300);
      } else {
        throw new Error('No audio data returned');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to generate audio');
    } finally {
      setIsGeneratingAudio(false);
    }
  };

  const handleGenerateAvatar = async () => {
    setIsGeneratingAvatar(true);
    setError('');
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.NEXT_PUBLIC_GEMINI_API_KEY });
      const promptToUse = customAvatarPrompt.trim() || selectedPersona.prompt;
      const avatarRes = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: promptToUse,
      });

      const parts = avatarRes.candidates?.[0]?.content?.parts || [];
      const imagePart = parts.find(p => p.inlineData);

      const inlineData = imagePart?.inlineData;
      if (inlineData?.data) {
        const mimeType = inlineData.mimeType || 'image/png';
        setAvatarUrl(`data:${mimeType};base64,${inlineData.data}`);
      } else {
        throw new Error('No image returned from the model');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to generate avatar');
    } finally {
      setIsGeneratingAvatar(false);
    }
  };

  const handleGenerateVisuals = async () => {
    if (!script) return;
    setIsGeneratingVisuals(true);
    setError('');
    setBRollImages([]);
    setStockData([]);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.NEXT_PUBLIC_GEMINI_API_KEY });

      setProgressMsg('Searching real-time financial data...');
      const searchRes = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `Find the current real-time stock prices and daily percentage changes for up to 5 companies mentioned or relevant to this script. Identify the companies regardless of the language and provide the symbol, price, and percentage change. Script: ${headline} ${script}`,
        config: {
          tools: [{ googleSearch: {} }]
        }
      });

      setProgressMsg('Parsing financial data...');
      const stockRes = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `Extract the stock symbols, prices, and changes from the following text into a JSON array of objects. Each object must have 'symbol' (e.g. AAPL, TCS), 'price' (e.g. "150.00"), and 'change' (e.g. "+1.2%" or "-0.5%"). Text: ${searchRes.text}`,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.ARRAY,
            items: { type: Type.OBJECT, properties: { symbol: { type: Type.STRING }, price: { type: Type.STRING }, change: { type: Type.STRING } } }
          }
        }
      });
      setStockData(safeJsonParse(stockRes.text || '[]', []));

      setProgressMsg('Analyzing script for B-Roll...');
      const promptRes = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `Extract exactly 5 highly visual, descriptive image prompts based on this broadcast script. Translate concepts into English if necessary. Make them photorealistic and cinematic. Script: ${script}`,
        config: {
          responseMimeType: 'application/json',
          responseSchema: { type: Type.ARRAY, items: { type: Type.STRING } }
        }
      });
      const prompts = safeJsonParse(promptRes.text || '[]', []);

      const newBRoll = [];
      for (let i = 0; i < Math.min(prompts.length, 5); i++) {
        setProgressMsg(`Generating B-Roll ${i + 1} of ${Math.min(prompts.length, 5)}...`);
        const imgRes = await ai.models.generateContent({
          model: 'gemini-2.5-flash-image',
          contents: prompts[i] + " photorealistic, cinematic, 4k, highly detailed",
        });

        const parts = imgRes.candidates?.[0]?.content?.parts || [];
        const imagePart = parts.find(p => p.inlineData);

        const inlineData = imagePart?.inlineData;
        if (inlineData?.data) {
          const mimeType = inlineData.mimeType || 'image/png';
          newBRoll.push(`data:${mimeType};base64,${inlineData.data}`);
        }
      }
      setBRollImages(newBRoll);
    } catch (err: any) {
      setError(err.message || 'Failed to generate visuals');
    } finally {
      setIsGeneratingVisuals(false);
      setProgressMsg('');
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    Array.from(files).forEach(file => {
      if (!file.type.startsWith('image/')) return;
      const reader = new FileReader();
      reader.onload = (event) => {
        const base64 = event.target?.result as string;
        if (base64) {
          setBRollImages(prev => [...prev, base64]);
        }
      };
      reader.readAsDataURL(file);
    });
    // Reset input
    e.target.value = '';
  };

  const handleRemoveBRoll = (indexToRemove: number) => {
    setBRollImages(prev => prev.filter((_, index) => index !== indexToRemove));
  };

  const canPreview = audioData && avatarUrl;

  return (
    <div className="h-screen w-screen flex flex-col bg-gray-50 text-gray-900 overflow-hidden font-sans">
      {/* Top Navbar */}
      <header className="h-14 border-b border-gray-200 bg-white flex items-center justify-between px-4 shrink-0 z-10 w-full">
        <div className="flex items-center gap-2 shrink-0">
          <div className="w-8 h-8 bg-red-600 rounded-lg flex items-center justify-center">
            <Video className="w-5 h-5 text-white" />
          </div>
          <div className="flex flex-col"><span className="font-serif font-bold tracking-tighter text-2xl hidden sm:block text-black">THE ECONOMIC TIMES</span><span className="text-[10px] font-bold tracking-widest text-red-600 uppercase">AI Video Studio</span></div>
        </div>

        <div className="flex-1 max-w-2xl px-8 flex items-center gap-2">
          <select 
            value={language}
            onChange={(e) => setLanguage(e.target.value as 'English' | 'Hindi')}
            className="bg-white border border-gray-200/80 rounded-md px-3 py-2 text-xs font-semibold focus:outline-none focus:border-red-600 transition-colors shadow-sm cursor-pointer"
          >
            <option value="English">EN</option>
            <option value="Hindi">HI</option>
          </select>
          <form onSubmit={handleMagicProcess} className="flex-1 flex items-center relative">
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="Paste article URL here to auto-generate video..."
              className="w-full bg-gray-50 border border-gray-300/50 rounded-full pl-4 pr-32 py-2 text-sm focus:outline-none focus:border-red-600 transition-colors shadow-inner"
              disabled={isProcessingPipeline}
            />
            <button
              type="submit"
              disabled={isProcessingPipeline || !url}
              className="absolute right-1 top-1 bottom-1 cursor-pointer bg-red-600 hover:bg-red-700 disabled:bg-red-600/50 disabled:cursor-not-allowed rounded-full px-4 flex items-center gap-2 text-xs font-semibold text-white transition-all"
            >
              {isProcessingPipeline ? (
                <><Loader2 className="w-3 h-3 animate-spin" /> Processing</>
              ) : (
                <><Wand2 className="w-3 h-3" /> Magic Gen</>
              )}
            </button>
          </form>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={handleExportVideo}
            disabled={isExporting || !audioData || !avatarUrl || isProcessingPipeline}
            className="px-4 py-1.5 cursor-pointer bg-gray-100 hover:bg-gray-200 disabled:bg-gray-100/50 disabled:cursor-not-allowed rounded-md text-sm font-medium transition-colors flex items-center gap-2"
          >
            {isExporting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                {exportProgress}%
              </>
            ) : (
              <>
                <Download className="w-4 h-4" />
                Export
              </>
            )}
          </button>
        </div>
      </header>

      {/* Main Workspace */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar - Tabs */}
        <div className="w-16 border-r border-gray-200 bg-white flex flex-col items-center py-4 gap-4 shrink-0 z-10">
          <button onClick={() => setActiveTab('script')} className={`p-3 rounded-xl transition-colors ${activeTab === 'script' ? 'bg-red-600/20 text-red-600' : 'text-gray-500 hover:text-gray-800 hover:bg-gray-100'}`}>
            <FileText className="w-5 h-5" />
          </button>
          <button onClick={() => setActiveTab('avatar')} className={`p-3 rounded-xl transition-colors ${activeTab === 'avatar' ? 'bg-red-600/20 text-red-600' : 'text-gray-500 hover:text-gray-800 hover:bg-gray-100'}`}>
            <User className="w-5 h-5" />
          </button>
          <button onClick={() => setActiveTab('visuals')} className={`p-3 rounded-xl transition-colors ${activeTab === 'visuals' ? 'bg-red-600/20 text-red-600' : 'text-gray-500 hover:text-gray-800 hover:bg-gray-100'}`}>
            <ImageIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Left Sidebar - Content */}
        <div className="w-80 border-r border-gray-200 bg-white/90 flex flex-col shrink-0 overflow-y-auto">
          <div className="p-4 border-b border-gray-200">
            <h2 className="font-semibold text-lg capitalize">{activeTab} Settings</h2>
          </div>

          <div className="p-4 space-y-6">
            {activeTab === 'script' && (
              <>
                <div className="space-y-2">
                  <div className="p-3 bg-red-600/10 border border-red-600/20 rounded-md">
                    <p className="text-sm font-medium text-red-600 mb-1">💡 Magic Automation</p>
                    <p className="text-xs text-gray-500">Use the URL bar at the top of the interface to automatically generate a video from a news article. Or modify settings here manually.</p>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Headline</label>
                  <input
                    type="text"
                    value={headline}
                    onChange={(e) => setHeadline(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-red-600"
                    placeholder="e.g. Market Rally Continues"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Script</label>
                  <textarea
                    value={script}
                    onChange={(e) => setScript(e.target.value)}
                    rows={8}
                    className="w-full bg-gray-50 border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-red-600 resize-none"
                    placeholder="e.g. Welcome to the daily update. Today, markets rallied as tech stocks surged to new all-time highs..."
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">AI Voice</label>
                  <select
                    value={selectedVoice}
                    onChange={(e) => setSelectedVoice(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-red-600"
                  >
                    {VOICES.map(v => <option key={v} value={v}>{v}</option>)}
                  </select>
                </div>

                <button
                  onClick={handleGenerateAudio}
                  disabled={isGeneratingAudio || !script}
                  className="w-full py-2 bg-red-600/20 text-red-600 hover:bg-red-600/30 border border-red-600/30 rounded-md text-sm font-medium flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
                >
                  {isGeneratingAudio ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mic className="w-4 h-4" />}
                  Generate Voiceover
                </button>
                {audioData && <div className="text-xs text-emerald-400 flex items-center gap-1"><Music className="w-3 h-3" /> Audio ready</div>}
              </>
            )}

            {activeTab === 'avatar' && (
              <>
                <div className="space-y-4">
                  <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Select Persona</label>
                  <div className="grid grid-cols-2 gap-2">
                    {AVATAR_PERSONAS.map(persona => (
                      <button
                        key={persona.id}
                        onClick={() => {
                          setSelectedPersona(persona);
                          setCustomAvatarPrompt('');
                        }}
                        className={`p-3 rounded-lg border text-left text-sm transition-colors ${selectedPersona.id === persona.id && !customAvatarPrompt ? 'bg-red-600/20 border-red-600 text-red-700' : 'bg-gray-50 border-gray-200 text-gray-500 hover:border-gray-300'}`}
                      >
                        {persona.name}
                      </button>
                    ))}
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Or Custom Prompt</label>
                    <textarea
                      value={customAvatarPrompt}
                      onChange={(e) => setCustomAvatarPrompt(e.target.value)}
                      placeholder="Describe your custom avatar..."
                      className="w-full h-24 bg-white border border-gray-200 rounded-lg p-3 text-sm focus:outline-none focus:border-red-600 focus:ring-1 focus:ring-red-600 resize-none"
                    />
                  </div>
                </div>

                <button
                  onClick={handleGenerateAvatar}
                  disabled={isGeneratingAvatar}
                  className="w-full py-2 bg-red-600/20 text-red-600 hover:bg-red-600/30 border border-red-600/30 rounded-md text-sm font-medium flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
                >
                  {isGeneratingAvatar ? <Loader2 className="w-4 h-4 animate-spin" /> : <User className="w-4 h-4" />}
                  Generate Avatar
                </button>

                {avatarUrl && (
                  <div className="mt-4 rounded-lg overflow-hidden border border-gray-200 relative aspect-video">
                    <img src={avatarUrl} alt="Avatar Preview" className="w-full h-full object-cover" />
                  </div>
                )}
              </>
            )}

            {activeTab === 'visuals' && (
              <>
                <p className="text-sm text-gray-500">Generate B-Roll images and extract financial data based on your script.</p>

                <button
                  onClick={handleGenerateVisuals}
                  disabled={isGeneratingVisuals || !script}
                  className="w-full py-2 bg-red-600/20 text-red-600 hover:bg-red-600/30 border border-red-600/30 rounded-md text-sm font-medium flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
                >
                  {isGeneratingVisuals ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImageIcon className="w-4 h-4" />}
                  Generate Visuals
                </button>

                {bRollImages.length > 0 && (
                  <div className="space-y-2 mt-4">
                    <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">B-Roll Clips</label>
                    <div className="grid grid-cols-2 gap-2">
                      {bRollImages.map((url, i) => (
                        <div
                          key={i}
                          draggable
                          onDragStart={(e) => handleDragStart(e, i)}
                          onDragOver={handleDragOver}
                          onDrop={(e) => handleDrop(e, i)}
                          onDragEnd={handleDragEnd}
                          className={`aspect-video rounded-md overflow-hidden border relative group cursor-grab active:cursor-grabbing transition-all ${draggedIndex === i ? 'opacity-50 border-red-600 scale-95' : 'border-gray-200 hover:border-gray-500'}`}
                        >
                          <img src={url} alt={`B-Roll ${i + 1}`} className="w-full h-full object-cover pointer-events-none" />
                          <button
                            onClick={() => handleRemoveBRoll(i)}
                            className="absolute top-1 right-1 p-1 bg-black/60 hover:bg-red-500/80 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="space-y-2 mt-4">
                  <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Add Local Images</label>
                  <div className="flex flex-col gap-2">
                    <label className="w-full py-4 border-2 border-dashed border-gray-200 hover:border-red-600/50 rounded-lg flex flex-col items-center justify-center gap-2 cursor-pointer transition-colors bg-white/90">
                      <ImageIcon className="w-6 h-6 text-gray-9000" />
                      <span className="text-sm text-gray-500">Click to upload images</span>
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        className="hidden"
                        onChange={handleFileUpload}
                      />
                    </label>
                  </div>
                </div>

                {stockData.length > 0 && (
                  <div className="space-y-2 mt-4">
                    <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Extracted Tickers</label>
                    <div className="flex flex-col gap-2">
                      {stockData.map((s, i) => {
                        const isPositive = s.change?.startsWith('+');
                        return (
                          <div key={i} className="flex items-center justify-between px-3 py-2 bg-gray-100 rounded text-sm font-mono">
                            <span className="font-semibold text-gray-800">{s.symbol}</span>
                            <div className="flex items-center gap-3">
                              <span className="text-gray-700">{s.price}</span>
                              <span className={isPositive ? 'text-emerald-400' : 'text-red-400'}>
                                {isPositive ? '▲' : '▼'} {s.change}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </>
            )}

            {error && (
              <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-md text-red-400 text-sm">
                {error}
              </div>
            )}
            {progressMsg && (
              <div className="p-3 bg-red-600/10 border border-red-600/20 rounded-md text-red-600 text-sm flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                {progressMsg}
              </div>
            )}
          </div>
        </div>

        {/* Center Canvas */}
        <div className="flex-1 bg-gray-50 flex flex-col relative overflow-hidden">
          <div className="flex-1 flex items-center justify-center p-8">
            {canPreview ? (
              <div className="w-full max-w-4xl aspect-video bg-black rounded-xl overflow-hidden shadow-2xl border border-gray-200 relative">
                <Player
                  component={NewsBroadcast}
                  inputProps={{
                    avatarUrl: avatarUrl,
                    bRollImages: bRollImages,
                    audioUrl: audioData,
                    headline: headline,
                    script: script,
                    stocks: stockData,
                  }}
                  durationInFrames={audioDurationFrames}
                  compositionWidth={1920}
                  compositionHeight={1080}
                  fps={30}
                  style={{ width: '100%', height: '100%' }}
                  controls
                  autoPlay={false}
                />
              </div>
            ) : (
              <div className="text-center space-y-4 text-gray-9000">
                <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center mx-auto mb-6">
                  <Play className="w-8 h-8 text-neutral-700 ml-1" />
                </div>
                <h3 className="text-xl font-medium text-gray-700">Preview Unavailable</h3>
                <p className="max-w-md mx-auto">Generate an Avatar and Voiceover from the sidebar to preview your broadcast.</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Bottom Timeline */}
      <div
        style={{ height: `${timelineHeight}px` }}
        className="border-t border-gray-200 bg-white shrink-0 flex flex-col relative"
      >
        {/* Resize Handle */}
        <div
          className="absolute -top-[5px] left-0 right-0 h-[10px] cursor-row-resize z-50 hover:bg-red-500/20 transition-colors flex justify-center items-center group"
          onMouseDown={handleResizeStart}
        >
          <div className="w-16 h-1 bg-gray-300 rounded-full group-hover:bg-red-500 transition-colors" />
        </div>
        {/* Timeline Header */}
        <div className="h-8 border-b border-gray-200 flex items-center px-4 text-xs font-medium text-gray-500 bg-white/90">
          <div className="w-48 shrink-0">Tracks</div>
          <div className="flex-1 flex items-center gap-1">
            <Clock className="w-3 h-3" /> Timeline ({(audioDurationFrames / 30).toFixed(1)}s)
          </div>
        </div>

        {/* Timeline Tracks */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {/* Avatar Track */}
          <div className="flex h-12 bg-gray-50/50 rounded-md border border-gray-200/50 overflow-hidden group">
            <div className="w-48 shrink-0 bg-white border-r border-gray-200 flex items-center px-3 gap-2 text-sm text-gray-700">
              <User className="w-4 h-4 text-red-600" /> Avatar
            </div>
            <div className="flex-1 relative p-1">
              {avatarUrl ? (
                <div className="absolute inset-y-1 left-1 right-1 bg-red-600/30 border border-red-600/50 rounded flex items-center px-2 overflow-hidden">
                  <span className="text-xs font-medium text-red-800 truncate">{selectedPersona.name}</span>
                </div>
              ) : (
                <div className="h-full w-full flex items-center justify-center text-xs text-gray-400 border border-dashed border-gray-200 rounded">No Avatar Generated</div>
              )}
            </div>
          </div>

          {/* Audio Track */}
          <div className="flex h-12 bg-gray-50/50 rounded-md border border-gray-200/50 overflow-hidden group">
            <div className="w-48 shrink-0 bg-white border-r border-gray-200 flex items-center px-3 gap-2 text-sm text-gray-700">
              <Mic className="w-4 h-4 text-emerald-400" /> Voiceover
            </div>
            <div className="flex-1 relative p-1">
              {audioData ? (
                <div className="absolute inset-y-1 left-1 right-1 bg-emerald-600/30 border border-emerald-500/50 rounded flex items-center px-2 overflow-hidden">
                  <div className="w-full h-full flex items-center gap-1 opacity-50">
                    {/* Simulated waveform */}
                    {Array.from({ length: 50 }).map((_, i) => (
                      <div key={i} className="flex-1 bg-emerald-400 rounded-full" style={{ height: `${Math.max(20, Math.random() * 100)}%` }} />
                    ))}
                  </div>
                </div>
              ) : (
                <div className="h-full w-full flex items-center justify-center text-xs text-gray-400 border border-dashed border-gray-200 rounded">No Voiceover Generated</div>
              )}
            </div>
          </div>

          {/* B-Roll Track */}
          <div className="flex h-12 bg-gray-50/50 rounded-md border border-gray-200/50 overflow-hidden group">
            <div className="w-48 shrink-0 bg-white border-r border-gray-200 flex items-center px-3 gap-2 text-sm text-gray-700">
              <ImageIcon className="w-4 h-4 text-amber-400" /> B-Roll
            </div>
            <div className="flex-1 relative p-1 flex gap-1">
              {bRollImages.length > 0 ? (
                bRollImages.map((img, i) => (
                  <div
                    key={i}
                    draggable
                    onDragStart={(e) => handleDragStart(e, i)}
                    onDragOver={handleDragOver}
                    onDrop={(e) => handleDrop(e, i)}
                    onDragEnd={handleDragEnd}
                    className={`flex-1 bg-amber-600/30 border rounded flex items-center overflow-hidden relative cursor-grab active:cursor-grabbing transition-all ${draggedIndex === i ? 'opacity-50 border-red-600 scale-95' : 'border-amber-500/50 hover:border-amber-400'}`}
                  >
                    <img src={img} className="absolute inset-0 w-full h-full object-cover opacity-50 pointer-events-none" />
                    <span className="relative z-10 text-xs font-medium text-amber-200 px-2 truncate pointer-events-none">Scene {i + 1}</span>
                  </div>
                ))
              ) : (
                <div className="h-full w-full flex items-center justify-center text-xs text-gray-400 border border-dashed border-gray-200 rounded">No B-Roll Generated</div>
              )}
            </div>
          </div>

          {/* Subtitles Track */}
          <div className="flex h-12 bg-gray-50/50 rounded-md border border-gray-200/50 overflow-hidden group">
            <div className="w-48 shrink-0 bg-white border-r border-gray-200 flex items-center px-3 gap-2 text-sm text-gray-700">
              <TypeIcon className="w-4 h-4 text-pink-400" /> Subtitles
            </div>
            <div className="flex-1 relative p-1">
              {script ? (
                <div className="absolute inset-y-1 left-1 right-1 bg-pink-600/30 border border-pink-500/50 rounded flex items-center px-2 overflow-hidden">
                  <span className="text-xs font-medium text-pink-200 truncate">{script}</span>
                </div>
              ) : (
                <div className="h-full w-full flex items-center justify-center text-xs text-gray-400 border border-dashed border-gray-200 rounded">No Script</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
