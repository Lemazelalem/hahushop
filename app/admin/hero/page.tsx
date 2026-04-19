"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

import {
  DndContext,
  closestCenter,
  type DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  arrayMove,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

type HeroSlide = {
  id: string;
  title: string;
  tagline: string | null;
  image_url: string | null;
  cta_label: string | null;
  cta_link: string | null;
  sort_order: number | null;
  is_active: boolean;
  is_archived: boolean;
  created_at: string | null;
};

type SlideFormState = {
  title: string;
  tagline: string;
  image_url: string;
  cta_label: string;
  cta_link: string;
  sort_order: number | "";
  is_active: boolean;
};

const EMPTY_FORM: SlideFormState = {
  title: "",
  tagline: "",
  image_url: "",
  cta_label: "Shop now",
  cta_link: "/shop",
  sort_order: "",
  is_active: true,
};

function SortableSlideCard({
  slide,
  onToggleActive,
  onArchive,
  onDelete,
}: {
  slide: HeroSlide;
  onToggleActive: (id: string, next: boolean) => void;
  onArchive: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: slide.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.7 : 1,
    cursor: "grab",
  } as const;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="glass-card rounded-2xl p-3 md:p-4 flex items-center gap-3 md:gap-4"
    >
      {/* Drag handle */}
      <button
        type="button"
        {...attributes}
        {...listeners}
        className="shrink-0 h-8 w-8 rounded-full bg-white/60 flex items-center justify-center text-slate-500 hover:bg-white"
        aria-label="Drag to reorder"
      >
        ☰
      </button>

      {/* Thumbnail */}
      <div className="shrink-0 h-14 w-24 md:h-16 md:w-28 rounded-xl bg-slate-100 overflow-hidden flex items-center justify-center">
        {slide.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={slide.image_url}
            alt={slide.title}
            className="h-full w-full object-cover"
          />
        ) : (
          <span className="text-xs text-slate-400">No image</span>
        )}
      </div>

      {/* Text */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="truncate font-semibold text-slate-900">
            {slide.title}
          </p>
          {!slide.is_active && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
              Hidden
            </span>
          )}
        </div>
        {slide.tagline && (
          <p className="mt-0.5 text-xs text-slate-600 truncate">
            {slide.tagline}
          </p>
        )}
        <p className="mt-1 text-[11px] text-slate-500 truncate">
          {slide.cta_label || "—"} · {slide.cta_link || "—"}
        </p>
      </div>

      {/* Actions */}
      <div className="flex flex-col items-end gap-1 shrink-0">
        <button
          type="button"
          onClick={() => onToggleActive(slide.id, !slide.is_active)}
          className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
            slide.is_active
              ? "bg-emerald-500/90 text-white"
              : "bg-slate-200 text-slate-800"
          }`}
        >
          {slide.is_active ? "Active" : "Show"}
        </button>
        <button
          type="button"
          onClick={() => onArchive(slide.id)}
          className="rounded-full px-2.5 py-1 text-[11px] font-semibold bg-slate-100 text-slate-600 hover:bg-slate-200"
        >
          Archive
        </button>
        <button
          type="button"
          onClick={() => onDelete(slide.id)}
          className="rounded-full px-2.5 py-1 text-[11px] font-semibold bg-red-50 text-red-500 hover:bg-red-100"
        >
          Delete
        </button>
      </div>
    </div>
  );
}

export default function HeroAdminPage() {
  const router = useRouter();

  const [slides, setSlides] = useState<HeroSlide[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingOrder, setSavingOrder] = useState(false);
  const [creating, setCreating] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);
  const [form, setForm] = useState<SlideFormState>(EMPTY_FORM);
  const [orderDirty, setOrderDirty] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    })
  );

  // Load existing slides
  useEffect(() => {
    async function loadSlides() {
      setLoading(true);
      setPageError(null);

      const { data, error } = await supabase
        .from("hero_slides")
        .select(
          `
          id,
          title,
          tagline,
          image_url,
          cta_label,
          cta_link,
          sort_order,
          is_active,
          is_archived,
          created_at
        `
        )
        .order("sort_order", { ascending: true });

      if (error) {
        console.error(error);
        setPageError(error.message || "Could not load hero slides.");
        setLoading(false);
        return;
      }

      const rows = (data ?? []) as HeroSlide[];

      // Ensure we have a sort_order for everything
      rows.sort(
        (a, b) => (a.sort_order || 0) - (b.sort_order || 0)
      ).forEach((row, idx) => {
        if (!row.sort_order) row.sort_order = idx + 1;
      });

      setSlides(rows);
      setLoading(false);
      setOrderDirty(false);
    }

    loadSlides();
  }, []);

  const activeSlides = useMemo(
    () => slides.filter((s) => !s.is_archived),
    [slides]
  );

  // ---- Drag & drop ----
  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    setSlides((prev) => {
      const actives = prev.filter((s) => !s.is_archived);
      const archived = prev.filter((s) => s.is_archived);

      const oldIndex = actives.findIndex((s) => s.id === active.id);
      const newIndex = actives.findIndex((s) => s.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return prev;

      const reordered = arrayMove(actives, oldIndex, newIndex);

      // Re-apply sort_order locally (will be saved later)
      const merged = [...reordered, ...archived].map((s, idx) => ({
        ...s,
        sort_order: idx + 1,
      }));

      return merged;
    });

    setOrderDirty(true);
  }

  // ---- Save order (FIXED: only UPDATE, no UPSERT) ----
  async function handleSaveOrder() {
    if (!orderDirty || activeSlides.length === 0) return;
    setPageError(null);
    setSavingOrder(true);

    // Compute new order only for non-archived slides
    const ordered = activeSlides.map((s, idx) => ({
      id: s.id,
      sort_order: idx + 1,
    }));

    for (const row of ordered) {
      const { error } = await supabase
        .from("hero_slides")
        .update({ sort_order: row.sort_order })
        .eq("id", row.id);

      if (error) {
        console.error(error);
        setPageError(error.message || "Failed to save order.");
        setSavingOrder(false);
        return;
      }
    }

    // Update local state to reflect saved order
    setSlides((prev) =>
      prev
        .map((s) => {
          const found = ordered.find((o) => o.id === s.id);
          return found ? { ...s, sort_order: found.sort_order } : s;
        })
        .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
    );

    setSavingOrder(false);
    setOrderDirty(false);
  }

  // ---- Toggle active ----
  async function handleToggleActive(id: string, next: boolean) {
    setPageError(null);
    const { error } = await supabase
      .from("hero_slides")
      .update({ is_active: next })
      .eq("id", id);

    if (error) {
      console.error(error);
      setPageError(error.message || "Failed to update slide.");
      return;
    }

    setSlides((prev) =>
      prev.map((s) =>
        s.id === id ? { ...s, is_active: next } : s
      )
    );
  }

  // ---- Archive ----
  async function handleArchive(id: string) {
    if (!confirm("Archive this slide? It will disappear from the hero.")) {
      return;
    }

    setPageError(null);
    const { error } = await supabase
      .from("hero_slides")
      .update({ is_archived: true, is_active: false })
      .eq("id", id);

    if (error) {
      console.error(error);
      setPageError(error.message || "Failed to archive slide.");
      return;
    }

    setSlides((prev) =>
      prev.map((s) =>
        s.id === id
          ? { ...s, is_archived: true, is_active: false }
          : s
      )
    );
    setOrderDirty(true);
  }

  // ---- Delete ----
  async function handleDelete(id: string) {
    if (
      !confirm(
        "Permanently delete this slide? This cannot be undone."
      )
    ) {
      return;
    }

    setPageError(null);
    const { error } = await supabase
      .from("hero_slides")
      .delete()
      .eq("id", id);

    if (error) {
      console.error(error);
      setPageError(error.message || "Failed to delete slide.");
      return;
    }

    setSlides((prev) => prev.filter((s) => s.id !== id));
  }

  // ---- Create new slide ----
  async function handleCreateNew(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) {
      setPageError("Title is required.");
      return;
    }
    if (!form.image_url.trim()) {
      setPageError("Image URL is required.");
      return;
    }

    setCreating(true);
    setPageError(null);

    const sort =
      typeof form.sort_order === "number" && !isNaN(form.sort_order)
        ? form.sort_order
        : slides.filter((s) => !s.is_archived).length + 1;

    const payload = {
      title: form.title.trim(),
      tagline: form.tagline.trim() || null,
      image_url: form.image_url.trim(),
      cta_label: form.cta_label.trim() || null,
      cta_link: form.cta_link.trim() || null,
      sort_order: sort,
      is_active: form.is_active,
      is_archived: false,
    };

    const { data, error } = await supabase
      .from("hero_slides")
      .insert([payload])
      .select()
      .single();

    if (error) {
      console.error(error);
      setPageError(error.message || "Could not create hero slide.");
      setCreating(false);
      return;
    }

    const newSlide = data as HeroSlide;

    setSlides((prev) =>
      [...prev, newSlide].sort(
        (a, b) => (a.sort_order || 0) - (b.sort_order || 0)
      )
    );
    setForm(EMPTY_FORM);
    setCreating(false);
  }

  // ---- Render ----
  return (
    <main className="min-h-screen px-4 py-6 md:px-6 md:py-8">
      <div className="bg-scene" />
      <div className="bg-vignette" />
      <div className="sparkles" />

      <div className="mx-auto max-w-6xl space-y-6 md:space-y-8 relative">
        {/* Header */}
        <section className="glass rounded-[28px] p-5 md:p-6 glass-ring flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold text-emerald-700">
              Admin
            </p>
            <h1 className="mt-1 text-2xl md:text-3xl font-bold text-slate-900">
              Homepage hero manager
            </h1>
            <p className="mt-2 text-sm text-slate-700 max-w-xl">
              Control the auto-swiping hero on the homepage. Active
              slides (sorted by drag order) are shown on <code>/</code>.
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Tip: keep <span className="font-semibold">2–4</span> active
              slides for a focused hero.
            </p>
          </div>
          <button
            type="button"
            onClick={() => router.push("/admin")}
            className="inline-flex items-center rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold text-white"
          >
            ← Back to admin
          </button>
        </section>

        {/* Error banner */}
        {pageError && (
          <div className="glass rounded-2xl border border-red-200 bg-red-50/80 px-4 py-3 text-sm text-red-700">
            {pageError}
          </div>
        )}

        {/* Existing slides */}
        <section className="glass rounded-[26px] p-4 md:p-5 glass-ring space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm md:text-base font-semibold text-slate-900">
                Existing slides
              </h2>
              <p className="text-[11px] md:text-xs text-slate-600">
                Drag to reorder. Active slides (non-archived) are shown
                on the homepage hero.
              </p>
            </div>
            <button
              type="button"
              onClick={handleSaveOrder}
              disabled={!orderDirty || savingOrder || activeSlides.length === 0}
              className={`rounded-full px-4 py-2 text-xs font-semibold ${
                !orderDirty || activeSlides.length === 0
                  ? "bg-slate-200 text-slate-500 cursor-not-allowed"
                  : "bg-emerald-500 text-white"
              }`}
            >
              {savingOrder ? "Saving…" : "Save order"}
            </button>
          </div>

          {loading ? (
            <div className="rounded-2xl bg-white/70 px-4 py-6 text-sm text-slate-600">
              Loading slides…
            </div>
          ) : activeSlides.length === 0 ? (
            <div className="rounded-2xl bg-white/70 px-4 py-6 text-sm text-slate-600">
              No hero slides yet. Use the form below to create the first
              one.
            </div>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={activeSlides.map((s) => s.id)}
                strategy={verticalListSortingStrategy}
              >
                <div className="space-y-3">
                  {activeSlides.map((slide) => (
                    <SortableSlideCard
                      key={slide.id}
                      slide={slide}
                      onToggleActive={handleToggleActive}
                      onArchive={handleArchive}
                      onDelete={handleDelete}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}
        </section>

        {/* Add new slide */}
        <section className="glass rounded-[26px] p-4 md:p-5 glass-ring">
          <h2 className="text-sm md:text-base font-semibold text-slate-900">
            Add new hero slide
          </h2>
          <p className="mt-1 text-[11px] md:text-xs text-slate-600">
            Use a public image from the <code>hero-banners</code> bucket
            (paste the public URL). This will appear in the large hero
            panel.
          </p>

          <form
            onSubmit={handleCreateNew}
            className="mt-4 space-y-3 md:space-y-4"
          >
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700">
                  Title
                </label>
                <input
                  type="text"
                  value={form.title}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      title: e.target.value,
                    }))
                  }
                  className="w-full rounded-2xl border border-slate-200 bg-white/80 px-3 py-2 text-sm outline-none focus:border-emerald-400"
                  placeholder="Fresh kicks for the weekend"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700">
                  Subtitle / tagline (optional)
                </label>
                <input
                  type="text"
                  value={form.tagline}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      tagline: e.target.value,
                    }))
                  }
                  className="w-full rounded-2xl border border-slate-200 bg-white/80 px-3 py-2 text-sm outline-none focus:border-emerald-400"
                  placeholder="Sneakers, slides, and more."
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700">
                Image URL
              </label>
              <input
                type="text"
                value={form.image_url}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    image_url: e.target.value,
                  }))
                }
                className="w-full rounded-2xl border border-slate-200 bg-white/80 px-3 py-2 text-sm outline-none focus:border-emerald-400"
                placeholder="https://…/storage/v1/object/public/hero-banners/your-image.jpg"
              />
              <p className="text-[10px] text-slate-500">
                Use a public image from the <code>hero-banners</code> bucket.
              </p>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700">
                  CTA label
                </label>
                <input
                  type="text"
                  value={form.cta_label}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      cta_label: e.target.value,
                    }))
                  }
                  className="w-full rounded-2xl border border-slate-200 bg-white/80 px-3 py-2 text-sm outline-none focus:border-emerald-400"
                  placeholder="Shop now"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700">
                  CTA link
                </label>
                <input
                  type="text"
                  value={form.cta_link}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      cta_link: e.target.value,
                    }))
                  }
                  className="w-full rounded-2xl border border-slate-200 bg-white/80 px-3 py-2 text-sm outline-none focus:border-emerald-400"
                  placeholder="/shop?category=Shoes"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700">
                  Sort order (optional)
                </label>
                <input
                  type="number"
                  value={form.sort_order}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      sort_order: e.target.value
                        ? Number(e.target.value)
                        : "",
                    }))
                  }
                  className="w-28 rounded-2xl border border-slate-200 bg-white/80 px-3 py-2 text-sm outline-none focus:border-emerald-400"
                  placeholder="10"
                />
                <p className="text-[10px] text-slate-500">
                  Used as a hint; drag &amp; drop will control final order.
                </p>
              </div>

              <label className="mt-4 inline-flex items-center gap-2 text-xs font-semibold text-slate-700">
                <input
                  type="checkbox"
                  checked={form.is_active}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      is_active: e.target.checked,
                    }))
                  }
                  className="h-4 w-4 rounded border-slate-300 text-emerald-500"
                />
                Active (show on homepage)
              </label>

              <div className="flex-1" />

              <button
                type="submit"
                disabled={creating}
                className="rounded-full bg-emerald-500 px-5 py-2 text-sm font-semibold text-white disabled:opacity-60"
              >
                {creating ? "Creating…" : "Create slide"}
              </button>
            </div>
          </form>
        </section>
      </div>
    </main>
  );
}
