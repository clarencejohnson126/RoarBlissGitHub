"use client";

import { motion, useReducedMotion, type Variants } from "framer-motion";
import { createElement, type CSSProperties } from "react";

type Props = {
  /** A single string (split into words) or an array of strings (revealed line by line). */
  text: string | readonly string[];
  splitBy?: "word" | "line";
  as?: "h1" | "h2" | "h3" | "p" | "span" | "div";
  className?: string;
  itemClassName?: string;
  style?: CSSProperties;
  stagger?: number;
  delay?: number;
  y?: number;
  once?: boolean;
};

export default function RevealText({
  text,
  splitBy = "word",
  as = "p",
  className,
  itemClassName,
  style,
  stagger = 0.06,
  delay = 0,
  y = 22,
  once = true,
}: Props) {
  const reduced = useReducedMotion();
  const items = Array.isArray(text) ? [...text] : (text as string).split(" ");

  const container: Variants = {
    hidden: {},
    show: { transition: { staggerChildren: reduced ? 0 : stagger, delayChildren: delay } },
  };
  const item: Variants = {
    hidden: reduced ? { opacity: 1, y: 0 } : { opacity: 0, y },
    show: { opacity: 1, y: 0, transition: { duration: reduced ? 0 : 0.8, ease: [0.16, 1, 0.3, 1] } },
  };

  const MotionTag = motion[as];
  const isLines = splitBy === "line" || Array.isArray(text);

  return createElement(
    MotionTag as typeof motion.p,
    {
      className,
      style,
      variants: container,
      initial: "hidden",
      whileInView: "show",
      viewport: { once, amount: 0.4 },
    },
    items.map((word, i) => (
      <motion.span
        key={i}
        variants={item}
        className={itemClassName}
        style={{ display: isLines ? "block" : "inline-block", willChange: "transform, opacity" }}
      >
        {word}
        {!isLines && i < items.length - 1 ? " " : null}
      </motion.span>
    )),
  );
}
