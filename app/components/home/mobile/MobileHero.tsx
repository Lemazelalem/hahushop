"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { ArrowRight, Play } from "lucide-react";

export type MobileHeroSlide = {
  id: string;
  title: string;
  tagline: string | null;
  image_url: string | null;
  link_url: string | null;
};

function useMSlider(length: number, ms = 4200) {
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    if (length <= 1) return;
    const t = setInterval(() => setIdx((i) => (i + 1) % length), ms);
    return () => clearInterval(t);
  }, [length, ms]);

  return [idx, setIdx] as const;
}

type Props = {
  slides: MobileHeroSlide[];
  onShopNow: (link?: string | null) => void;
};

export default function MobileHero({ slides, onShopNow }: Props) {
  const [idx, setIdx] = useMSlider(slides.length);
  if (!slides.length) return null;

  const fallbackBg = [
    "linear-gradient(145deg,#0f172a 0%,#1e3a8a 100%)",
    "linear-gradient(145deg,#1a0505 0%,#7f1d1d 100%)",
    "linear-gradient(145deg,#0f172a 0%,#312e81 100%)",
  ][idx % 3];

  const slide = slides[idx];

  return (
    <div
      style={{
        margin: "8px 12px 0",
        borderRadius: 16,
        overflow: "hidden",
        position: "relative",
        height: 190,
        cursor: "pointer",
      }}
      onClick={() => onShopNow(slide.link_url)}
    >
      {slide.image_url ? (
        <Image
          src={slide.image_url}
          alt={slide.title ?? ""}
          fill
          sizes="100vw"
          style={{ objectFit: "cover" }}
          priority
        />
      ) : (
        <div style={{ position: "absolute", inset: 0, background: fallbackBg }} />
      )}

      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage: "radial-gradient(rgba(255,255,255,0.055) 1px,transparent 1px)",
          backgroundSize: "20px 20px",
          opacity: 0.6,
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "linear-gradient(180deg,transparent 30%,rgba(0,0,0,0.52) 100%)",
        }}
      />

      <div
        style={{
          position: "absolute",
          inset: 0,
          padding: 16,
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
        }}
      >
        <div>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              background: "rgba(255,255,255,0.16)",
              backdropFilter: "blur(8px)",
              color: "#fff",
              fontSize: 10,
              fontWeight: 800,
              padding: "4px 8px",
              borderRadius: 999,
              marginBottom: 8,
            }}
          >
            <Play size={10} /> Trending
          </div>

          <div
            style={{
              fontSize: 24,
              fontWeight: 900,
              color: "#fff",
              lineHeight: 1.08,
              letterSpacing: "-0.6px",
              maxWidth: "70%",
            }}
          >
            {slide.title}
          </div>

          {slide.tagline && (
            <div
              style={{
                fontSize: 12,
                color: "rgba(255,255,255,0.82)",
                marginTop: 6,
                maxWidth: "80%",
              }}
            >
              {slide.tagline}
            </div>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onShopNow(slide.link_url);
            }}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              background: "#fff",
              color: "#0f172a",
              fontSize: 12,
              fontWeight: 800,
              padding: "10px 14px",
              borderRadius: 999,
              border: "none",
              cursor: "pointer",
              boxShadow: "0 4px 16px rgba(0,0,0,0.22)",
            }}
          >
            Shop now <ArrowRight size={13} />
          </button>

          <div style={{ display: "flex", gap: 6 }}>
            {slides.map((s, i) => (
              <button
                key={s.id}
                onClick={(e) => {
                  e.stopPropagation();
                  setIdx(i);
                }}
                style={{
                  width: i === idx ? 18 : 6,
                  height: 6,
                  borderRadius: 999,
                  background: i === idx ? "#fff" : "rgba(255,255,255,0.45)",
                  border: "none",
                  padding: 0,
                  cursor: "pointer",
                  transition: "all 0.2s ease",
                }}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}