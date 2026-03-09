"use client";

import { useState, useEffect } from "react";

type CountdownProps = {
  targetUnix: number;
  className?: string;
};

function computeTimeLeft(targetUnix: number) {
  const diff = targetUnix * 1000 - Date.now();
  if (diff <= 0) return null;

  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((diff % (1000 * 60)) / 1000);

  return { days, hours, minutes, seconds };
}

export function Countdown({ targetUnix, className }: CountdownProps) {
  const [timeLeft, setTimeLeft] = useState(() => computeTimeLeft(targetUnix));

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft(computeTimeLeft(targetUnix));
    }, 1000);

    return () => clearInterval(timer);
  }, [targetUnix]);

  if (!timeLeft) {
    return <span className={className}>Ended</span>;
  }

  if (timeLeft.days > 0) {
    return (
      <span className={className}>
        {timeLeft.days}d {timeLeft.hours}h
      </span>
    );
  }

  if (timeLeft.hours > 0) {
    return (
      <span className={className}>
        {timeLeft.hours}h {timeLeft.minutes}m
      </span>
    );
  }

  return (
    <span className={className}>
      {timeLeft.minutes}m {timeLeft.seconds}s
    </span>
  );
}
