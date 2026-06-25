"use client";

import { motion } from "framer-motion";

interface AnimatedGradientBgProps {
  variant?: "default" | "vibrant" | "subtle" | "cosmic";
}

export function AnimatedGradientBg({ variant = "default" }: AnimatedGradientBgProps) {
  const variants = {
    default: [
      { colors: ["#F5B731", "#4CAF50", "#9333EA"], positions: ["-40%", "60%", "20%"] },
    ],
    vibrant: [
      { colors: ["#F97316", "#EC4899", "#8B5CF6"], positions: ["-30%", "70%", "30%"] },
    ],
    subtle: [
      { colors: ["#FFF8E7", "#F5B731", "#4CAF50"], positions: ["-20%", "50%", "80%"] },
    ],
    cosmic: [
      { colors: ["#4C1D95", "#7C3AED", "#EC4899"], positions: ["-50%", "40%", "10%"] },
    ],
  };

  const config = variants[variant][0];

  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden opacity-20 -z-10">
      {config.colors.map((color, index) => (
        <motion.div
          key={index}
          className="absolute rounded-full blur-3xl"
          style={{
            width: index === 0 ? "40rem" : index === 1 ? "35rem" : "30rem",
            height: index === 0 ? "40rem" : index === 1 ? "35rem" : "30rem",
            background: color,
            top: config.positions[index],
            left: index === 0 ? config.positions[index] : "auto",
            right: index === 1 ? config.positions[index] : "auto",
            bottom: index === 2 ? config.positions[index] : "auto",
          }}
          animate={{
            scale: [1, 1.2, 1],
            opacity: [0.3, 0.5, 0.3],
            x: [0, 50, 0],
            y: [0, -30, 0],
          }}
          transition={{
            duration: 10 + index * 2,
            repeat: Infinity,
            ease: "easeInOut",
            delay: index * 2,
          }}
        />
      ))}

      {/* Animated dots pattern */}
      <div className="absolute inset-0">
        {Array.from({ length: 50 }).map((_, i) => (
          <motion.div
            key={i}
            className="absolute w-1 h-1 bg-brand-yellow/20 rounded-full"
            style={{
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
            }}
            animate={{
              scale: [0, 1, 0],
              opacity: [0, 1, 0],
            }}
            transition={{
              duration: 4,
              repeat: Infinity,
              delay: i * 0.1,
              ease: "easeInOut",
            }}
          />
        ))}
      </div>
    </div>
  );
}
