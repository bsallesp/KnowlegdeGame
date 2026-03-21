"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface AudiobookPlayerProps {
  audioUrl: string;
  onClose: () => void;
}

export default function AudiobookPlayer({ audioUrl, onClose }: AudiobookPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    audio.play().then(() => setIsPlaying(true)).catch(() => {});

    const onTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
      setProgress(audio.duration > 0 ? (audio.currentTime / audio.duration) * 100 : 0);
    };
    const onLoadedMetadata = () => setDuration(audio.duration);
    const onEnded = () => setIsPlaying(false);

    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("loadedmetadata", onLoadedMetadata);
    audio.addEventListener("ended", onEnded);

    return () => {
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("loadedmetadata", onLoadedMetadata);
      audio.removeEventListener("ended", onEnded);
      audio.pause();
    };
  }, [audioUrl]);

  const togglePlayPause = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      audio.play().then(() => setIsPlaying(true)).catch(() => {});
    }
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    const audio = audioRef.current;
    if (!audio || !audio.duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    audio.currentTime = ratio * audio.duration;
  };

  const fmt = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 40 }}
        transition={{ type: "spring", damping: 24, stiffness: 280 }}
        className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 w-full max-w-md px-4"
      >
        <div
          className="rounded-2xl p-4 flex flex-col gap-3"
          style={{ backgroundColor: "#12121A", border: "1px solid #2E2E40", boxShadow: "0 8px 32px rgba(0,0,0,0.6)" }}
        >
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-lg">🎧</span>
              <div>
                <p className="text-sm font-semibold" style={{ color: "#EEEEFF" }}>Audiobook personalizado</p>
                <p className="text-xs" style={{ color: "#9494B8" }}>Gerado com base no seu progresso</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg transition-colors"
              style={{ color: "#9494B8" }}
              aria-label="Fechar player"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Progress bar */}
          <div
            className="w-full h-1.5 rounded-full cursor-pointer"
            style={{ backgroundColor: "#2E2E40" }}
            onClick={handleSeek}
          >
            <motion.div
              className="h-full rounded-full"
              style={{ backgroundColor: "#818CF8", width: `${progress}%` }}
              transition={{ duration: 0.1 }}
            />
          </div>

          {/* Controls */}
          <div className="flex items-center justify-between">
            <span className="text-xs tabular-nums" style={{ color: "#9494B8" }}>{fmt(currentTime)}</span>

            <motion.button
              whileHover={{ scale: 1.08 }}
              whileTap={{ scale: 0.92 }}
              onClick={togglePlayPause}
              className="w-10 h-10 rounded-full flex items-center justify-center"
              style={{ backgroundColor: "#818CF8" }}
              aria-label={isPlaying ? "Pausar" : "Reproduzir"}
            >
              {isPlaying ? (
                <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
                </svg>
              ) : (
                <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7L8 5z" />
                </svg>
              )}
            </motion.button>

            <span className="text-xs tabular-nums" style={{ color: "#9494B8" }}>
              {duration > 0 ? fmt(duration) : "--:--"}
            </span>
          </div>
        </div>

        <audio ref={audioRef} src={audioUrl} preload="auto" />
      </motion.div>
    </AnimatePresence>
  );
}
