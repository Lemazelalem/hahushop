type FlyToCartOptions = {
  sourceEl?: HTMLElement | null;
  imageUrl?: string | null;
  durationMs?: number;
};

function isVisible(el: HTMLElement): boolean {
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function getBestCartTarget(): HTMLElement | null {
  const candidates = Array.from(
    document.querySelectorAll<HTMLElement>(
      [
        '[data-cart-target="true"]',
        'a[href="/checkout"]',
        'button[aria-label*="Cart"]',
        'button[aria-label*="cart"]',
        'a[aria-label*="Cart"]',
        'a[aria-label*="cart"]',
      ].join(",")
    )
  ).filter(isVisible);

  if (candidates.length > 0) return candidates[0];
  return null;
}

export function flyToCart(options: FlyToCartOptions = {}): void {
  if (typeof window === "undefined" || typeof document === "undefined") return;

  const target = getBestCartTarget();

  const duration = options.durationMs ?? 1150;
  const sourceRect = options.sourceEl?.getBoundingClientRect();
  const targetRect = target?.getBoundingClientRect();

  const startX = sourceRect ? sourceRect.left + sourceRect.width / 2 : window.innerWidth / 2;
  const startY = sourceRect ? sourceRect.top + sourceRect.height / 2 : window.innerHeight * 0.7;
  const endX = targetRect
    ? targetRect.left + targetRect.width / 2
    : Math.max(24, window.innerWidth - 42);
  const endY = targetRect
    ? targetRect.top + targetRect.height / 2
    : 42;

  const ghost = document.createElement(options.imageUrl ? "img" : "div");
  if (options.imageUrl && ghost instanceof HTMLImageElement) {
    ghost.src = options.imageUrl;
    ghost.alt = "";
  }

  ghost.style.position = "fixed";
  ghost.style.left = `${startX - 26}px`;
  ghost.style.top = `${startY - 26}px`;
  ghost.style.width = "52px";
  ghost.style.height = "52px";
  ghost.style.borderRadius = "999px";
  ghost.style.objectFit = "cover";
  ghost.style.background = options.imageUrl ? "#ffffff" : "linear-gradient(90deg,#22c55e,#22d3ee)";
  ghost.style.boxShadow = "0 14px 32px rgba(15,23,42,0.3)";
  ghost.style.border = "1px solid rgba(255,255,255,0.75)";
  ghost.style.pointerEvents = "none";
  ghost.style.zIndex = "2147483647";
  ghost.style.willChange = "transform, opacity";

  document.body.appendChild(ghost);

  const deltaX = endX - startX;
  const deltaY = endY - startY;
  const arcY = Math.min(-80, deltaY * 0.35);

  ghost
    .animate(
      [
        { transform: "translate(0px, 0px) scale(1)", opacity: 0.98 },
        {
          transform: `translate(${deltaX * 0.55}px, ${deltaY * 0.45 + arcY}px) scale(0.82)`,
          opacity: 0.96,
        },
        { transform: `translate(${deltaX}px, ${deltaY}px) scale(0.28)`, opacity: 0.22 },
      ],
      {
        duration,
        easing: "cubic-bezier(0.18, 0.72, 0.16, 1)",
        fill: "forwards",
      }
    )
    .finished.finally(() => {
      ghost.remove();
    });

  if (target) {
    target.animate(
      [
        { transform: "scale(1)" },
        { transform: "scale(1.14)" },
        { transform: "scale(1)" },
      ],
      {
        duration: 360,
        easing: "ease-out",
        delay: Math.max(0, duration - 260),
      }
    );
  }
}
