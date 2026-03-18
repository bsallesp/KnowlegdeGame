"use client";

import { motion } from "framer-motion";

interface SkeletonBlockProps {
  className?: string;
  width?: string;
  height?: string;
}

export default function SkeletonBlock({ className = "", width = "100%", height = "1rem" }: SkeletonBlockProps) {
  return (
    <motion.div
      className={`rounded ${className}`}
      style={{
        width,
        height,
        backgroundColor: "#1C1C28",
      }}
      animate={{
        opacity: [0.5, 1, 0.5],
      }}
      transition={{
        duration: 1.5,
        repeat: Infinity,
        ease: "easeInOut",
      }}
    />
  );
}
