"use client"

import React from "react"
import { motion } from "framer-motion"
import { cn } from "@/lib/utils"

export const GridBeam: React.FC<{ children?: React.ReactNode; className?: string }> = ({
  children,
  className
}) => (
  <div className={cn("relative w-full overflow-hidden", className)}>
    <div className="absolute inset-0 z-0 opacity-30 [mask-image:radial-gradient(ellipse_at_center,black_70%,transparent_100%)]">
        <div className="absolute inset-0 bg-grid-white/[0.05]" />
    </div>
    <Beam />
    {children && (
      <div className="relative z-10 w-full h-full">
          {children}
      </div>
    )}
  </div>
)

export const Beam = () => {
  return (
    <svg
      width="156"
      height="63"
      viewBox="0 0 156 63"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="absolute top-0 left-1/4 mt-8 pointer-events-none z-0"
    >
      <path
        d="M31 .5h32M0 .5h32m30 31h32m-1 0h32m-1 31h32M62.5 32V0m62 63V31"
        stroke="url(#grad1)"
        strokeWidth={1.5}
      />
      <defs>
        <motion.linearGradient
          id="grad1"
          variants={{
            initial: {
              x1: "40%",
              x2: "50%",
              y1: "160%",
              y2: "180%"
            },
            animate: {
              x1: "0%",
              x2: "10%",
              y1: "-40%",
              y2: "-20%"
            }
          }}
          animate="animate"
          initial="initial"
          transition={{
            duration: 1.8,
            repeat: Infinity,
            repeatType: "loop",
            ease: "linear",
            repeatDelay: 2
          }}
        >
          <stop stopColor="#3b82f6" stopOpacity="0" />
          <stop stopColor="#3b82f6" />
          <stop offset="0.325" stopColor="#8b5cf6" />
          <stop offset="1" stopColor="#d946ef" stopOpacity="0" />
        </motion.linearGradient>
      </defs>
    </svg>
  )
}
