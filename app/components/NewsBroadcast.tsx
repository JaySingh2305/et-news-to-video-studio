import React from 'react';
import {
  AbsoluteFill,
  Audio,
  Img,
  interpolate,
  Sequence,
  useCurrentFrame,
  useVideoConfig,
  spring,
} from 'remotion';

export const NewsBroadcast: React.FC<{
  avatarUrl: string;
  bRollImages: string[];
  audioUrl: string;
  headline: string;
  script: string;
  stocks: { symbol: string; price: string; change: string }[];
}> = ({ avatarUrl, bRollImages, audioUrl, headline, script, stocks }) => {
  const { durationInFrames } = useVideoConfig();
  const frame = useCurrentFrame();

  // Calculate timings
  const hasBRoll = bRollImages && bRollImages.length > 0;
  
  // 20% intro, 60% b-roll, 20% outro
  const introDuration = hasBRoll ? Math.floor(durationInFrames * 0.2) : durationInFrames;
  const outroDuration = hasBRoll ? Math.floor(durationInFrames * 0.2) : 0;
  const bRollTotalDuration = durationInFrames - introDuration - outroDuration;
  const bRollDurationPerImage = hasBRoll ? Math.floor(bRollTotalDuration / bRollImages.length) : 0;

  return (
    <AbsoluteFill style={{ backgroundColor: '#000' }}>
      {audioUrl && <Audio src={audioUrl} />}
      
      {/* Avatar Layer (Base) */}
      {avatarUrl && (
        <AbsoluteFill>
           <AvatarImage src={avatarUrl} isSpeaking={!!audioUrl} />
        </AbsoluteFill>
      )}

      {/* B-Roll Layer */}
      {hasBRoll && bRollImages.map((src, index) => {
        const startFrame = introDuration + (index * bRollDurationPerImage);
        // Ensure the last b-roll doesn't overlap the outro
        const duration = (index === bRollImages.length - 1) 
          ? bRollTotalDuration - (index * bRollDurationPerImage) 
          : bRollDurationPerImage;
          
        return (
          <Sequence key={`broll-${index}`} from={startFrame} durationInFrames={duration}>
            <KenBurnsImage src={src} />
          </Sequence>
        );
      })}

      {/* Overlays */}
      <AbsoluteFill>
        {/* Subtitles */}
        {script && <Subtitles script={script} />}

        {/* Lower Third */}
        <LowerThird headline={headline} />
        
        {/* Stock Ticker */}
        {stocks && stocks.length > 0 && <StockTicker stocks={stocks} />}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

const AvatarImage: React.FC<{ src: string, isSpeaking: boolean }> = ({ src, isSpeaking }) => {
  return (
    <AbsoluteFill>
      <Img
        src={src}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
        }}
      />
    </AbsoluteFill>
  );
};

const KenBurnsImage: React.FC<{ src: string }> = ({ src }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  // Slow zoom in
  const scale = interpolate(frame, [0, durationInFrames], [1, 1.15]);

  return (
    <AbsoluteFill>
      <Img
        src={src}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          transform: `scale(${scale})`,
        }}
      />
    </AbsoluteFill>
  );
};

const LowerThird: React.FC<{ headline: string }> = ({ headline }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  
  const entrance = spring({
    fps,
    frame: frame - 15, // Delay entrance slightly
    config: { damping: 12 },
  });

  const translateY = interpolate(entrance, [0, 1], [200, 0]);

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 90, // Adjusted to sit above the stock ticker
        left: 80,
        right: 80,
        transform: `translateY(${translateY}px)`,
        display: 'flex',
        flexDirection: 'column',
        fontFamily: 'system-ui, sans-serif',
        zIndex: 40
      }}
    >
      <div style={{ 
        backgroundColor: 'rgba(17, 24, 39, 0.95)', 
        color: 'white', 
        padding: '24px 36px', 
        fontSize: 42, 
        fontWeight: 700, 
        borderLeft: '8px solid #ef4444', 
        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)',
        lineHeight: 1.3
      }}>
        {headline}
      </div>
    </div>
  );
};

const Subtitles: React.FC<{ script: string }> = ({ script }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  
  // Improve word timings by accounting for punctuation pauses
  const words = script.split(' ').filter(Boolean);
  
  // Calculate total weight of the script
  let totalWeight = 0;
  const wordWeights = words.map(word => {
    let weight = word.length + 2; // Base weight: character count + 2 for natural word spacing
    if (word.endsWith(',')) weight += 10; // Pause for comma
    if (word.endsWith('.') || word.endsWith('!') || word.endsWith('?')) weight += 20; // Longer pause for sentence end
    totalWeight += weight;
    return weight;
  });

  const framesPerWeight = durationInFrames / totalWeight;
  
  let currentWeight = 0;
  const chunks: { words: any[], startFrame: number, endFrame: number }[] = [];
  let currentChunk: any[] = [];
  let chunkStartFrame = 0;
  
  words.forEach((word, index) => {
    const wordWeight = wordWeights[index];
    const startFrame = currentWeight * framesPerWeight;
    const endFrame = (currentWeight + wordWeight) * framesPerWeight;
    
    if (currentChunk.length === 0) {
      chunkStartFrame = startFrame;
    }
    
    currentChunk.push({
      word,
      startFrame,
      endFrame
    });
    
    currentWeight += wordWeight;
    
    // Group into chunks of 6-8 words, or break at sentence ends
    const isSentenceEnd = word.endsWith('.') || word.endsWith('!') || word.endsWith('?');
    if (currentChunk.length >= 7 || isSentenceEnd || index === words.length - 1) {
      chunks.push({
        words: currentChunk,
        startFrame: chunkStartFrame,
        endFrame: currentWeight * framesPerWeight
      });
      currentChunk = [];
    }
  });

  const activeChunk = chunks.find(c => frame >= c.startFrame && frame <= c.endFrame);

  if (!activeChunk) return null;

  return (
    <div style={{
      position: 'absolute',
      bottom: 280, // Above lower third
      left: 80,
      right: 80,
      textAlign: 'center',
      display: 'flex',
      justifyContent: 'center',
      gap: '16px',
      flexWrap: 'wrap',
      zIndex: 30
    }}>
      {activeChunk.words.map((w, i) => {
        const isActive = frame >= w.startFrame && frame <= w.endFrame;
        const isPast = frame > w.endFrame;
        return (
          <span key={i} style={{
            fontSize: 56,
            fontWeight: 800,
            fontFamily: 'system-ui, sans-serif',
            color: isActive ? '#fbbf24' : (isPast ? '#ffffff' : 'rgba(255,255,255,0.6)'),
            textShadow: '0 4px 15px rgba(0,0,0,0.8), 0 0 20px rgba(0,0,0,0.5)',
            transform: isActive ? 'scale(1.05)' : 'scale(1)',
            transition: 'all 0.1s ease-out',
            display: 'inline-block'
          }}>
            {w.word}
          </span>
        );
      })}
    </div>
  );
};

const StockTicker: React.FC<{ stocks: any[] }> = ({ stocks }) => {
  const frame = useCurrentFrame();
  const { width } = useVideoConfig();
  
  // Scroll speed: pixels per frame
  const speed = 5;
  const translateX = width - (frame * speed);
  
  // Duplicate stocks to ensure the ticker doesn't run out during the video
  const displayStocks = Array(20).fill(stocks).flat();

  return (
    <div style={{
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      height: 60,
      backgroundColor: '#111827',
      borderTop: '2px solid #374151',
      display: 'flex',
      alignItems: 'center',
      overflow: 'hidden',
      fontFamily: 'system-ui, sans-serif',
      zIndex: 50
    }}>
      <div style={{
        display: 'flex',
        gap: 80,
        transform: `translateX(${translateX}px)`,
        whiteSpace: 'nowrap'
      }}>
        {displayStocks.map((stock, i) => {
          if (!stock) return null;
          const change = stock.change || '';
          const isPositive = change.startsWith('+');
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 24, fontWeight: 600 }}>
              <span style={{ color: '#9ca3af' }}>{stock.symbol || 'UNKNOWN'}</span>
              <span style={{ color: 'white' }}>₹{stock.price || '0.00'}</span>
              <span style={{ color: isPositive ? '#10b981' : '#ef4444' }}>
                {isPositive ? '▲' : '▼'} {change}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};
