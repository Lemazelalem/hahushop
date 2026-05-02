"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";
import { useRouter, useParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import {
  ArrowLeft,
  AlertCircle,
  CheckCircle2,
  Clock,
  XCircle,
  Sparkles,
  Camera,
  Upload,
  X,
  Plus,
  Tag,
  FileText,
  ImagePlus,
  Layers,
  Palette,
  Ruler,
  Trash2,
  ChevronDown,
  Info,
  Send,
  Edit3,
  Eye,
  GripVertical,
  Save,
  RotateCcw,
  Ban,
  Package,
  Shield,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type ProductStatus =
  | "draft"
  | "submitted"
  | "pending"
  | "approved"
  | "rejected"
  | "archived";

type ColorVariant = {
  id: string;
  name: string;
  hex: string;
  imageUrl: string;
  extraImageUrls: string[];
};

type SizeVariant = {
  id: string;
  label: string;
  stock: number;
  priceAdjustCents: number;
};

type Product = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  emoji: string | null;
  status: ProductStatus;
  price_cents: number;
  final_price_cents: number | null;
  image_url: string | null;
  extra_image_urls: string[] | null;
  stock_quantity: number;
  is_active: boolean;
  color_variants: ColorVariant[] | null;
  size_variants: SizeVariant[] | null;
  category_id: string | null;
  branch_slug?: string | null;
  product_type_slug?: string | null;
  rejection_reason?: string | null;
  admin_notes?: string | null;
  created_at: string;
};

type CategoryRow = { id: string; name: string; slug: string };

type VariantPreset = {
  enableColors?: boolean;
  optionLabel?: string;
  optionValues?: string[];
};

type ProductTypePreset = {
  slug: string;
  name: string;
  emoji?: string;
  variantPreset: VariantPreset;
};

type BranchPreset = {
  slug: string;
  name: string;
  items: ProductTypePreset[];
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function dollarsToCents(v: string) {
  const n = Number(String(v).replace(/[^0-9.]/g, "").trim());
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

function centsToStr(c: number) {
  return (c / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function slugify(s: string) {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function makeSlug(name: string) {
  const base = slugify(name);
  return (base || "product") + "-" + Math.random().toString(36).slice(2, 7);
}

function prettyError(err: any): string {
  if (!err) return "Unknown error.";
  if (typeof err === "string") return err;
  return err.message || err.details || JSON.stringify(err);
}

function cx(...args: Array<string | false | null | undefined>) {
  return args.filter(Boolean).join(" ");
}

function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function normalizeSlug(v?: string | null) {
  return slugify(v || "");
}

function getCategoryBranchKey(category?: CategoryRow | null) {
  if (!category) return "";

  const raw = normalizeSlug(category.slug || category.name);

  if (raw === "phones") return "phones";
  if (raw === "audio") return "audio";
  if (raw === "laptops") return "laptops";
  if (raw === "accessories") return "accessories";
  if (raw === "wearables") return "wearables";
  if (raw === "diapers_wipes") return "diapers_wipes";
  if (raw === "mattress_bedding") return "mattress_bedding";
  if (raw === "clothing" || raw === "clothes") return "clothing";
  if (raw === "kids_clothes") return "kids_clothes";
  if (raw === "shoes") return "shoes";
  if (raw === "home_appliances") return "home_appliances";
  if (raw === "toys") return "toys";
  if (raw === "office_furniture") return "office_furniture";
  if (raw === "office_tech") return "office_tech";
  if (raw === "stationery") return "stationery";
  if (raw === "office_supplies") return "office_supplies";
  if (raw === "breakroom") return "breakroom";
  if (raw === "bags") return "bags";

  return "";
}

function buildMergedOptionVariants(
  prev: SizeVariant[],
  presetLabels: string[]
): SizeVariant[] {
  const used = new Set<string>();
  const merged: SizeVariant[] = [];

  for (const label of presetLabels) {
    const existing = prev.find((p) => p.label === label);
    merged.push(
      existing ?? { id: uid(), label, stock: 0, priceAdjustCents: 0 }
    );
    used.add(label);
  }

  for (const existing of prev) {
    if (!used.has(existing.label)) merged.push(existing);
  }

  return merged;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_CFG: Record<
  ProductStatus,
  {
    label: string;
    icon: any;
    color: string;
    bg: string;
    border: string;
    hint: string;
  }
> = {
  draft: {
    label: "Draft",
    icon: Edit3,
    color: "text-slate-300",
    bg: "bg-slate-500/10",
    border: "border-slate-600/30",
    hint: "Not yet submitted for review.",
  },
  submitted: {
    label: "Under Review",
    icon: Clock,
    color: "text-amber-300",
    bg: "bg-amber-500/10",
    border: "border-amber-500/30",
    hint: "Submitted — awaiting admin review.",
  },
  pending: {
    label: "Pending",
    icon: Clock,
    color: "text-amber-300",
    bg: "bg-amber-500/10",
    border: "border-amber-500/30",
    hint: "Awaiting admin review.",
  },
  approved: {
    label: "Approved",
    icon: CheckCircle2,
    color: "text-emerald-300",
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/30",
    hint: "Live on the store.",
  },
  rejected: {
    label: "Rejected",
    icon: XCircle,
    color: "text-red-300",
    bg: "bg-red-500/10",
    border: "border-red-500/30",
    hint: "Needs changes — re-submit when ready.",
  },
  archived: {
    label: "Archived",
    icon: Ban,
    color: "text-slate-500",
    bg: "bg-slate-500/10",
    border: "border-slate-600/30",
    hint: "No longer active.",
  },
};

const SIZE_PRESETS = {
  clothing: ["XS", "S", "M", "L", "XL", "XXL", "3XL"],
  numeric: ["36", "37", "38", "39", "40", "41", "42", "43", "44", "45"],
  general: ["One Size", "Small", "Medium", "Large"],
};

const COLOR_SWATCHES = [
  { name: "Black", hex: "#0f0f0f" },
  { name: "White", hex: "#ffffff" },
  { name: "Red", hex: "#ef4444" },
  { name: "Blue", hex: "#3b82f6" },
  { name: "Green", hex: "#22c55e" },
  { name: "Yellow", hex: "#eab308" },
  { name: "Orange", hex: "#f97316" },
  { name: "Purple", hex: "#a855f7" },
  { name: "Pink", hex: "#ec4899" },
  { name: "Gray", hex: "#6b7280" },
  { name: "Brown", hex: "#92400e" },
  { name: "Navy", hex: "#1e3a5f" },
];

const INPUT =
  "w-full rounded-xl border border-slate-700 bg-slate-800/50 px-4 py-3 text-white placeholder:text-slate-500 focus:border-lime-400 focus:ring-2 focus:ring-lime-400/20 transition-all outline-none";

const CATEGORY_BRANCHES: Record<string, BranchPreset[]> = {
  // ... (same as new page - truncated for brevity, use full version from your file)
  phones: [
    {
      slug: "smartphones",
      name: "Smartphones",
      items: [
        {
          slug: "android-phones",
          name: "Android Phones",
          emoji: "📱",
          variantPreset: {
            enableColors: true,
            optionLabel: "Storage",
            optionValues: ["64GB", "128GB", "256GB", "512GB"],
          },
        },
        {
          slug: "iphone",
          name: "iPhone",
          emoji: "📱",
          variantPreset: {
            enableColors: true,
            optionLabel: "Storage",
            optionValues: ["128GB", "256GB", "512GB", "1TB"],
          },
        },
        {
          slug: "budget-phones",
          name: "Budget Phones",
          emoji: "📱",
          variantPreset: {
            enableColors: true,
            optionLabel: "Memory",
            optionValues: ["3GB / 32GB", "4GB / 64GB", "6GB / 128GB"],
          },
        },
      ],
    },
  ],
  // ... include all other categories from your existing file
};

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function SellerProductDetailPage() {
  const router = useRouter();
  const params = useParams();
  const productId = params?.id as string;
  const categoryRef = useRef<HTMLDivElement>(null);
  const dragIndex = useRef<number | null>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [product, setProduct] = useState<Product | null>(null);
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("🛍️");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [branchSlug, setBranchSlug] = useState("");
  const [productTypeSlug, setProductTypeSlug] = useState("");
  const [sellerPrice, setSellerPrice] = useState("");
  const [stockQty, setStockQty] = useState("");
  const [showCatDrop, setShowCatDrop] = useState(false);

  const [imageUrl, setImageUrl] = useState("");
  const [imageUploading, setImageUploading] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const [extraUrls, setExtraUrls] = useState<string[]>([]);
  const [extraUploading, setExtraUploading] = useState(false);

  const [hasColors, setHasColors] = useState(false);
  const [hasSizes, setHasSizes] = useState(false);
  const [colorVariants, setColorVariants] = useState<ColorVariant[]>([]);
  const [sizeVariants, setSizeVariants] = useState<SizeVariant[]>([]);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [colorMainUpl, setColorMainUpl] = useState<Record<string, boolean>>({});
  const [colorExtraUpl, setColorExtraUpl] = useState<Record<string, boolean>>({});

  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);

  // ── Derived ──────────────────────────────────────────────────────────────
  const canEdit = !!product && ["draft", "rejected"].includes(product.status);
  const canSubmit = !!product && ["draft", "rejected"].includes(product.status);
  const underReview =
    !!product && ["submitted", "pending"].includes(product.status);
  const anyUploading =
    imageUploading ||
    extraUploading ||
    Object.values(colorMainUpl).some(Boolean) ||
    Object.values(colorExtraUpl).some(Boolean);

  const selectedCategory = categories.find((c) => c.id === categoryId) ?? null;
  const selectedCatName = selectedCategory?.name ?? "";
  const categoryBranchKey = getCategoryBranchKey(selectedCategory);
  const availableBranches = CATEGORY_BRANCHES[categoryBranchKey] ?? [];
  const selectedBranch =
    availableBranches.find((b) => b.slug === branchSlug) ?? null;
  const availableProductTypes = selectedBranch?.items ?? [];
  const selectedProductType =
    availableProductTypes.find((i) => i.slug === productTypeSlug) ?? null;
  const dynamicOptionLabel =
    selectedProductType?.variantPreset.optionLabel ?? "Size Variants";
  const dynamicOptionValues =
    selectedProductType?.variantPreset.optionValues ?? [];

  // ── Populate form from product ────────────────────────────────────────────
  function populate(p: Product) {
    setName(p.name);
    setEmoji(p.emoji ?? "🛍️");
    setDescription(p.description ?? "");
    setCategoryId(p.category_id ?? "");
    setBranchSlug(p.branch_slug ?? "");
    setProductTypeSlug(p.product_type_slug ?? "");
    setSellerPrice(centsToStr(p.price_cents));
    const sizes = p.size_variants ?? [];
    setStockQty(sizes.length > 0 ? "" : String(p.stock_quantity ?? 0));
    setImageUrl(p.image_url ?? "");
    setExtraUrls(p.extra_image_urls ?? []);
    setHasColors((p.color_variants?.length ?? 0) > 0);
    setHasSizes(sizes.length > 0);
    setColorVariants(p.color_variants ?? []);
    setSizeVariants(sizes);
    setExpandedIds(new Set());
    setIsDirty(false);
  }

  // ── Outside-click dropdown ────────────────────────────────────────────────
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (
        categoryRef.current &&
        !categoryRef.current.contains(e.target as Node)
      ) {
        setShowCatDrop(false);
      }
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  // ── Unsaved-changes guard ─────────────────────────────────────────────────
  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [isDirty]);

  // ── Keep branch/type valid when category changes ──────────────────────────
  useEffect(() => {
    const categoryStillValid = availableBranches.some((b) => b.slug === branchSlug);
    if (!categoryStillValid) {
      if (branchSlug || productTypeSlug) {
        setBranchSlug("");
        setProductTypeSlug("");
      }
      return;
    }

    const typeStillValid = availableProductTypes.some(
      (i) => i.slug === productTypeSlug
    );
    if (!typeStillValid && productTypeSlug) {
      setProductTypeSlug("");
    }
  }, [categoryId, availableBranches, availableProductTypes, branchSlug, productTypeSlug]);

  // ── Auto-apply type-aware variants without destroying custom rows ─────────
  useEffect(() => {
    if (!selectedProductType || !isEditing) return;

    const preset = selectedProductType.variantPreset;
    const shouldHaveColors = !!preset.enableColors;
    const nextOptionValues = preset.optionValues ?? [];

    setHasColors(shouldHaveColors);

    if (!shouldHaveColors && colorVariants.length > 0) {
      setColorVariants([]);
      setExpandedIds(new Set());
    }

    if (nextOptionValues.length > 0) {
      setHasSizes(true);
      setSizeVariants((prev) => buildMergedOptionVariants(prev, nextOptionValues));
    }
  }, [selectedProductType, isEditing]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Load ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!productId) return;
    let alive = true;

    (async () => {
      setLoading(true);
      try {
        const { data: auth, error: authErr } = await supabase.auth.getUser();
        if (authErr || !auth?.user) {
          setPageError("You must be signed in.");
          return;
        }
        if (!alive) return;

        setUserId(auth.user.id);

        const [{ data: prof }, { data: cats }, { data: prod, error: prodErr }] =
          await Promise.all([
            supabase
              .from("profiles")
              .select("id,role")
              .eq("id", auth.user.id)
              .maybeSingle(),
            supabase
              .from("categories")
              .select("id,name,slug")
              .order("sort_order")
              .order("name"),
            supabase
              .from("products")
              .select("*")
              .eq("id", productId)
              .eq("seller_id", auth.user.id)
              .maybeSingle(),
          ]);

        if (!alive) return;

        setRole(prof?.role ?? null);
        setCategories((cats ?? []) as CategoryRow[]);

        if (prodErr || !prod) {
          setPageError("Product not found or you don't have access to it.");
          return;
        }

        setProduct(prod as Product);
        populate(prod as Product);
      } catch {
        if (!alive) return;
        setPageError("Failed to load product.");
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [productId]);

  // ── Image upload helper ───────────────────────────────────────────────────
  async function uploadFile(file: File, path: string): Promise<string | null> {
    const { error } = await supabase.storage
      .from("product-images")
      .upload(path, file);
    if (error) return null;
    return supabase.storage.from("product-images").getPublicUrl(path).data.publicUrl;
  }

  async function handleMainImage(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !userId) return;
    setImageError(null);
    setImageUploading(true);
    try {
      const ext = file.name.split(".").pop() || "jpg";
      const url = await uploadFile(file, `seller-${userId}/${Date.now()}.${ext}`);
      if (url) {
        setImageUrl(url);
        setIsDirty(true);
      } else {
        setImageError("Upload failed.");
      }
    } catch (err: any) {
      setImageError(prettyError(err));
    } finally {
      setImageUploading(false);
      e.target.value = "";
    }
  }

  async function handleExtraImages(e: ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || !userId) return;

    setExtraUploading(true);
    const newUrls: string[] = [];

    for (const file of Array.from(files)) {
      const ext = file.name.split(".").pop() || "jpg";
      const url = await uploadFile(
        file,
        `seller-${userId}/extra-${Date.now()}-${uid()}.${ext}`
      );
      if (url) newUrls.push(url);
    }

    if (newUrls.length) {
      setExtraUrls((p) => [...p, ...newUrls]);
      setIsDirty(true);
    }

    setExtraUploading(false);
    e.target.value = "";
  }

  function galleryDragStart(i: number) {
    dragIndex.current = i;
    setDraggingIndex(i);
  }

  // FIXED: Added dragIndex.current = null reset
  function galleryDrop(i: number) {
    if (dragIndex.current === null || dragIndex.current === i) {
      dragIndex.current = null;  // ← FIX: Reset dragIndex
      setDragOverIndex(null);
      setDraggingIndex(null);
      return;
    }

    setExtraUrls((prev) => {
      const next = [...prev];
      const [moved] = next.splice(dragIndex.current!, 1);
      next.splice(i, 0, moved);
      return next;
    });

    dragIndex.current = null;
    setDragOverIndex(null);
    setDraggingIndex(null);
    setIsDirty(true);
  }

  // ── Color handlers ────────────────────────────────────────────────────────
  function addColor(preset?: { name: string; hex: string }) {
    const id = uid();
    setColorVariants((p) => [
      ...p,
      {
        id,
        name: preset?.name ?? "",
        hex: preset?.hex ?? "#6b7280",
        imageUrl: "",
        extraImageUrls: [],
      },
    ]);
    setExpandedIds((p) => new Set([...p, id]));
    setIsDirty(true);
  }

  function updateColor(id: string, patch: Partial<ColorVariant>) {
    setColorVariants((p) => p.map((c) => (c.id === id ? { ...c, ...patch } : c)));
    setIsDirty(true);
  }

  function removeColor(id: string) {
    setColorVariants((p) => p.filter((c) => c.id !== id));
    setExpandedIds((p) => {
      const n = new Set(p);
      n.delete(id);
      return n;
    });
    setIsDirty(true);
  }

  async function handleColorMain(
    colorId: string,
    e: ChangeEvent<HTMLInputElement>
  ) {
    const file = e.target.files?.[0];
    if (!file || !userId) return;

    setColorMainUpl((p) => ({ ...p, [colorId]: true }));
    try {
      const ext = file.name.split(".").pop() || "jpg";
      const url = await uploadFile(
        file,
        `seller-${userId}/color-${colorId}-${Date.now()}.${ext}`
      );
      if (url) {
        updateColor(colorId, { imageUrl: url });
      } else {
        const colorName = colorVariants.find((c) => c.id === colorId)?.name || "color";
        setPageError(`Failed to upload image for ${colorName}.`);
      }
    } finally {
      setColorMainUpl((p) => ({ ...p, [colorId]: false }));
      e.target.value = "";
    }
  }

  async function handleColorExtra(
    colorId: string,
    e: ChangeEvent<HTMLInputElement>
  ) {
    const files = e.target.files;
    if (!files || !userId) return;

    setColorExtraUpl((p) => ({ ...p, [colorId]: true }));
    const newUrls: string[] = [];

    for (const file of Array.from(files)) {
      const ext = file.name.split(".").pop() || "jpg";
      const url = await uploadFile(
        file,
        `seller-${userId}/color-${colorId}-extra-${Date.now()}-${uid()}.${ext}`
      );
      if (url) newUrls.push(url);
    }

    if (newUrls.length) {
      setColorVariants((p) =>
        p.map((c) =>
          c.id === colorId
            ? { ...c, extraImageUrls: [...c.extraImageUrls, ...newUrls] }
            : c
        )
      );
      setIsDirty(true);
    } else {
      const colorName = colorVariants.find((c) => c.id === colorId)?.name || "color";
      setPageError(`Failed to upload gallery images for ${colorName}.`);
    }

    setColorExtraUpl((p) => ({ ...p, [colorId]: false }));
    e.target.value = "";
  }

  // ── Size handlers ─────────────────────────────────────────────────────────
  function addSize(label = "") {
    if (label && sizeVariants.some((s) => s.label === label)) return;
    setSizeVariants((p) => [
      ...p,
      { id: uid(), label, stock: 0, priceAdjustCents: 0 },
    ]);
    setIsDirty(true);
  }

  function updateSize(id: string, patch: Partial<SizeVariant>) {
    setSizeVariants((p) => p.map((s) => (s.id === id ? { ...s, ...patch } : s)));
    setIsDirty(true);
  }

  function toggleSizes() {
    if (hasSizes) {
      const total = sizeVariants.reduce((s, v) => s + (v.stock || 0), 0);
      if (total > 0) setStockQty(String(total));
      else setStockQty("");
      setSizeVariants([]);
    }
    setHasSizes((v) => !v);
    setIsDirty(true);
  }

  // ── Validation ────────────────────────────────────────────────────────────
  // FIXED: Added color image validation to match new page
  function validate(): string | null {
    if (!name.trim()) return "Product name is required.";
    if (!categoryId) return "Select a category.";
    if (availableBranches.length > 0 && !branchSlug) return "Select a branch.";
    if (availableProductTypes.length > 0 && !productTypeSlug) {
      return "Select a product type.";
    }
    if (dollarsToCents(sellerPrice) <= 0) return "Enter a valid price.";
    if (!imageUrl) return "Upload a main product image.";
    if (!hasSizes && (!stockQty || Number(stockQty) < 0)) {
      return "Enter a valid stock quantity.";
    }
    if (hasColors) {
      if (colorVariants.length === 0) {
        return "Add at least one color or disable color variants.";
      }
      if (colorVariants.some((c) => !c.name.trim())) {
        return "All color variants need a name.";
      }
      // NEW: Validate color images
      const missingImage = colorVariants.find((c) => !c.imageUrl);
      if (missingImage) {
        return `Color "${missingImage.name || 'unnamed'}" is missing a main image. Upload an image or remove this color.`;
      }
    }
    if (hasSizes && sizeVariants.length === 0) {
      return "Add at least one option or disable option variants.";
    }
    if (hasSizes && sizeVariants.some((s) => !s.label.trim())) {
      return "All option variants need a label.";
    }
    return null;
  }

  // ── Save ──────────────────────────────────────────────────────────────────
  async function handleSave(e?: FormEvent): Promise<boolean> {
    e?.preventDefault();
    setPageError(null);

    const err = validate();
    if (err) {
      setPageError(err);
      return false;
    }

    if (!product || !userId) return false;

    const stock = hasSizes
      ? sizeVariants.reduce((s, v) => s + (v.stock || 0), 0)
      : Math.max(0, Number(stockQty) || 0);

    const cents = dollarsToCents(sellerPrice);

    setSaving(true);
    try {
      const { data: updated, error } = await supabase
        .from("products")
        .update({
          name: name.trim(),
          slug: makeSlug(name),
          description: description.trim() || null,
          emoji: emoji.trim() || "🛍️",
          category_id: categoryId,
          branch_slug: branchSlug || null,
          product_type_slug: productTypeSlug || null,
          price_cents: cents,
          final_price_cents: cents,
          image_url: imageUrl,
          extra_image_urls: extraUrls.length ? extraUrls : null,
          stock_quantity: stock,
          color_variants: hasColors && colorVariants.length ? colorVariants : null,
          size_variants: hasSizes && sizeVariants.length ? sizeVariants : null,
        })
        .eq("id", product.id)
        .eq("seller_id", userId)
        .select()
        .single();

      if (error) throw error;

      setProduct(updated as Product);
      setIsDirty(false);
      setIsEditing(false);
      setSuccessMsg("Changes saved.");
      setTimeout(() => setSuccessMsg(null), 3000);
      return true;
    } catch (err: any) {
      setPageError(prettyError(err));
      return false;
    } finally {
      setSaving(false);
    }
  }

  // ── Submit for review ─────────────────────────────────────────────────────
  async function handleSubmit() {
    setPageError(null);
    if (!product || !userId) return;

    if (isDirty) {
      const ok = await handleSave();
      if (!ok) return;
    } else {
      const err = validate();
      if (err) {
        setPageError(err);
        return;
      }
    }

    setSubmitting(true);
    try {
      const { data: updated, error } = await supabase
        .from("products")
        .update({ status: "submitted" })
        .eq("id", product.id)
        .eq("seller_id", userId)
        .select()
        .single();

      if (error) throw error;

      setProduct(updated as Product);
      setIsEditing(false);
      setSuccessMsg(
        "Product submitted for review! You'll be notified once it's approved."
      );
      setTimeout(() => setSuccessMsg(null), 6000);
    } catch (err: any) {
      setPageError(prettyError(err));
    } finally {
      setSubmitting(false);
    }
  }

  function safeBack() {
    if (
      isDirty &&
      !window.confirm("You have unsaved changes. Leave without saving?")
    ) {
      return;
    }
    router.push("/seller");
  }

  // ─── Sub-components ───────────────────────────────────────────────────────

  function FieldLabel({ children }: { children: React.ReactNode }) {
    return (
      <label className="block text-sm font-medium text-slate-300 mb-2">
        {children}
      </label>
    );
  }

  function Req() {
    return <span className="text-lime-400">*</span>;
  }

  function SectionCard({
    title,
    icon,
    children,
  }: {
    title: string;
    icon: React.ReactNode;
    children: React.ReactNode;
  }) {
    return (
      <div className="rounded-2xl border border-slate-700/50 bg-slate-900/40 overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-700/40 flex items-center gap-2">
          {icon}
          <span className="text-sm font-semibold text-white">{title}</span>
        </div>
        <div className="p-5 space-y-4">{children}</div>
      </div>
    );
  }

  function Toggle({
    on,
    onChange,
    color = "bg-orange-500",
  }: {
    on: boolean;
    onChange: () => void;
    color?: string;
  }) {
    return (
      <button
        type="button"
        onClick={onChange}
        className={cx(
          "relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none",
          on ? color : "bg-slate-700"
        )}
      >
        <span
          className={cx(
            "inline-block h-4 w-4 transform rounded-full bg-white shadow-md transition-transform",
            on ? "translate-x-6" : "translate-x-1"
          )}
        />
      </button>
    );
  }

  // ─── ColorCard Component (Enhanced to match new page) ─────────────────────

  type ColorCardProps = {
    variant: ColorVariant;
    expanded: boolean;
    onToggle: () => void;
    disabled: boolean;
    mainUploading: boolean;
    extraUploading: boolean;
    onUpdate: (patch: Partial<ColorVariant>) => void;
    onRemove: () => void;
    onMainImage: (e: ChangeEvent<HTMLInputElement>) => void;
    onExtraImages: (e: ChangeEvent<HTMLInputElement>) => void;
    onRemoveExtra: (url: string) => void;
  };

  function ColorCard({
    variant,
    expanded,
    onToggle,
    disabled,
    mainUploading,
    extraUploading,
    onUpdate,
    onRemove,
    onMainImage,
    onExtraImages,
    onRemoveExtra,
  }: ColorCardProps) {
    const hasMainImage = !!variant.imageUrl;
    const totalImages = hasMainImage ? 1 + variant.extraImageUrls.length : variant.extraImageUrls.length;

    return (
      <div className="rounded-xl border border-slate-700 bg-slate-900/40 overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-3">
          <div className="relative">
            <label className="cursor-pointer">
              <span
                className="block w-9 h-9 rounded-xl border-2 border-white/10 shadow-md transition-all hover:border-white/30"
                style={{ backgroundColor: variant.hex }}
              />
              <input
                type="color"
                value={variant.hex}
                onChange={(e) => onUpdate({ hex: e.target.value })}
                disabled={disabled}
                className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
              />
            </label>
          </div>

          <input
            className="flex-1 bg-transparent border-b border-slate-700 focus:border-orange-400 text-white text-sm py-1 outline-none transition-colors placeholder:text-slate-600"
            placeholder="Color name (e.g. Ocean Blue)"
            value={variant.name}
            onChange={(e) => onUpdate({ name: e.target.value.slice(0, 40) })}
            disabled={disabled}
          />

          {/* ENHANCED: Visual indicator for missing image */}
          <span className={cx(
            "text-xs tabular-nums mr-1",
            !hasMainImage && totalImages === 0 ? "text-amber-400" : "text-slate-500"
          )}>
            {!hasMainImage && totalImages === 0 ? (
              <span className="flex items-center gap-1">
                <AlertCircle className="w-3 h-3" />
                No image
              </span>
            ) : (
              `${totalImages} img`
            )}
          </span>

          <button
            type="button"
            onClick={onToggle}
            className="w-7 h-7 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 flex items-center justify-center transition-all"
          >
            <ChevronDown
              className={cx("w-4 h-4 transition-transform", expanded && "rotate-180")}
            />
          </button>

          <button
            type="button"
            onClick={onRemove}
            disabled={disabled}
            className="w-7 h-7 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10 flex items-center justify-center transition-all"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>

        {expanded && (
          <div className="border-t border-slate-700/50 px-4 py-4 bg-slate-800/20">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                {/* ENHANCED: Label with required badge */}
                <div className="text-xs font-medium text-slate-400 mb-2 flex items-center gap-2">
                  <span>
                    Main image for{" "}
                    <span className="text-orange-300">
                      {variant.name || "this color"}
                    </span>
                  </span>
                  {!hasMainImage && (
                    <span className="text-amber-400 text-[10px] bg-amber-500/10 px-1.5 py-0.5 rounded">
                      Required
                    </span>
                  )}
                </div>
                
                {/* ENHANCED: Visual feedback for missing image */}
                <label
                  className={cx(
                    "group relative flex flex-col items-center justify-center w-full h-40 rounded-xl border-2 border-dashed cursor-pointer transition-all overflow-hidden",
                    !disabled && !mainUploading
                      ? hasMainImage 
                        ? "border-slate-600 hover:border-orange-400/50 bg-slate-800/30"
                        : "border-amber-500/50 bg-amber-500/5 hover:border-amber-400/50"
                      : "border-slate-700 bg-slate-800/20 cursor-not-allowed"
                  )}
                >
                  {variant.imageUrl ? (
                    <>
                      <img
                        src={variant.imageUrl}
                        alt={variant.name}
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute inset-0 bg-slate-950/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-sm">
                        <Camera className="w-4 h-4 text-white" />
                      </div>
                    </>
                  ) : (
                    <div className="flex flex-col items-center gap-2 text-slate-600">
                      {mainUploading ? (
                        <div className="w-6 h-6 border-2 border-orange-400 border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <ImagePlus className="w-6 h-6 text-amber-400" />
                      )}
                      <span className="text-xs">
                        {mainUploading ? "Uploading…" : "Upload Required"}
                      </span>
                    </div>
                  )}
                  <input
                    type="file"
                    accept="image/*"
                    onChange={onMainImage}
                    className="hidden"
                    disabled={disabled || mainUploading}
                  />
                </label>
                
                {variant.imageUrl && (
                  <button
                    type="button"
                    onClick={() => onUpdate({ imageUrl: "" })}
                    className="mt-1.5 text-xs text-red-400 hover:text-red-300 flex items-center gap-1"
                  >
                    <X className="w-3 h-3" />
                    Remove
                  </button>
                )}
              </div>

              <div>
                <div className="text-xs font-medium text-slate-400 mb-2">
                  Gallery for{" "}
                  <span className="text-orange-300">
                    {variant.name || "this color"}
                  </span>
                </div>
                <label
                  className={cx(
                    "flex items-center justify-center gap-2 w-full px-3 py-3 rounded-xl border-2 border-dashed cursor-pointer transition-all mb-3",
                    !disabled && !extraUploading
                      ? "border-slate-600 hover:border-orange-400/50 bg-slate-800/30 text-slate-500 hover:text-orange-400"
                      : "border-slate-700 bg-slate-800/20 cursor-not-allowed"
                  )}
                >
                  {extraUploading ? (
                    <div className="w-4 h-4 border-2 border-orange-400 border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <Upload className="w-4 h-4" />
                  )}
                  <span className="text-xs">
                    {extraUploading ? "Uploading…" : "Add gallery photos"}
                  </span>
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={onExtraImages}
                    className="hidden"
                    disabled={disabled || extraUploading}
                  />
                </label>

                {variant.extraImageUrls.length > 0 ? (
                  <div className="grid grid-cols-4 gap-1.5">
                    {variant.extraImageUrls.map((url) => (
                      <div
                        key={url}
                        className="relative aspect-square rounded-lg border border-slate-700 overflow-hidden group bg-slate-800/50"
                      >
                        <img src={url} alt="" className="w-full h-full object-cover" />
                        <button
                          type="button"
                          onClick={() => onRemoveExtra(url)}
                          className="absolute inset-0 bg-slate-950/60 text-red-400 opacity-0 group-hover:opacity-100 transition-all flex items-center justify-center"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed border-slate-700/50 py-4 text-center">
                    <p className="text-xs text-slate-600">No gallery photos yet</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <main className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-r from-lime-400 to-emerald-400 flex items-center justify-center animate-pulse">
            <Sparkles className="w-6 h-6 text-slate-900" />
          </div>
          <span className="text-sm text-slate-400">Loading product…</span>
        </div>
      </main>
    );
  }

  if (!product) {
    return (
      <main className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center px-4">
        <div className="max-w-md w-full rounded-3xl border border-red-500/30 bg-red-500/10 p-8 text-center">
          <div className="w-14 h-14 rounded-2xl bg-red-500/20 flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-7 h-7 text-red-400" />
          </div>
          <h2 className="text-xl font-bold text-white mb-2">Product Not Found</h2>
          <p className="text-sm text-slate-400 mb-6">
            {pageError ?? "This product doesn't exist or you don't have access."}
          </p>
          <button
            onClick={() => router.push("/seller")}
            className="px-6 py-2.5 bg-gradient-to-r from-lime-400 to-emerald-400 text-slate-900 font-bold rounded-xl text-sm"
          >
            Back to Dashboard
          </button>
        </div>
      </main>
    );
  }

  const sc = STATUS_CFG[product.status] ?? STATUS_CFG.draft;
  const StatusIcon = sc.icon;
  const sizeTotal = sizeVariants.reduce((s, v) => s + (v.stock || 0), 0);

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 px-3 py-4 sm:px-4 sm:py-6 md:px-8">
      <div className="mx-auto max-w-5xl">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6 flex-wrap">
          <button
            type="button"
            onClick={safeBack}
            className="group flex items-center gap-2 px-3 sm:px-4 py-2 text-sm text-slate-400 hover:text-lime-400 transition-all"
          >
            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
            Back
          </button>
          <div className="hidden sm:block h-4 w-px bg-slate-700" />
          <span className="text-2xl">{product.emoji || "🛍️"}</span>
          <h1 className="text-lg sm:text-xl md:text-2xl font-bold text-white truncate flex-1">
            {product.name}
          </h1>
          {isDirty && (
            <span className="text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2.5 py-1 rounded-full shrink-0">
              Unsaved changes
            </span>
          )}
        </div>

        {/* Alerts */}
        {pageError && (
          <div className="mb-4 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 sm:px-5 py-4 flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
            <span className="text-sm text-red-300 flex-1">{pageError}</span>
            <button onClick={() => setPageError(null)}>
              <X className="w-4 h-4 text-red-400" />
            </button>
          </div>
        )}

        {successMsg && (
          <div className="mb-4 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 sm:px-5 py-4 flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
            <span className="text-sm text-emerald-300">{successMsg}</span>
          </div>
        )}

        {/* Status Banner */}
        <div
          className={cx(
            "mb-5 rounded-2xl border px-4 sm:px-5 py-4 flex flex-wrap items-center gap-4",
            sc.bg,
            sc.border
          )}
        >
          <div
            className={cx(
              "w-10 h-10 rounded-xl flex items-center justify-center shrink-0",
              sc.bg
            )}
          >
            <StatusIcon className={cx("w-5 h-5", sc.color)} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={cx("text-sm font-semibold", sc.color)}>
                {sc.label}
              </span>
              <span className="text-slate-600 text-xs">·</span>
              <span className="text-xs text-slate-500">{sc.hint}</span>
            </div>
            <p className="text-xs text-slate-600 mt-0.5">
              Created {fmtDate(product.created_at)}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap shrink-0 w-full sm:w-auto">
            {canEdit && !isEditing && (
              <button
                onClick={() => setIsEditing(true)}
                className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-slate-700/60 hover:bg-slate-600/60 text-slate-300 hover:text-white text-sm font-medium transition-all border border-slate-600/50"
              >
                <Edit3 className="w-4 h-4" />
                Edit
              </button>
            )}

            {canSubmit && (
              <button
                onClick={handleSubmit}
                disabled={submitting || anyUploading}
                className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-2 rounded-xl bg-gradient-to-r from-lime-400 to-emerald-400 hover:from-lime-300 hover:to-emerald-300 disabled:from-slate-700 disabled:to-slate-700 disabled:cursor-not-allowed text-slate-900 text-sm font-bold shadow-lg shadow-lime-500/20 transition-all hover:scale-[1.02] active:scale-[0.98]"
              >
                {submitting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-slate-900 border-t-transparent rounded-full animate-spin" />
                    Submitting…
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    Submit for Review
                  </>
                )}
              </button>
            )}

            {underReview && (
              <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-sm">
                <Clock className="w-4 h-4" />
                Under Review
              </div>
            )}

            {product.status === "approved" && (
              <a
                href={`/shop/${product.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 hover:text-emerald-200 text-sm transition-colors"
              >
                <Eye className="w-4 h-4" />
                View Live
              </a>
            )}
          </div>
        </div>

        {/* Rejection reason */}
        {product.status === "rejected" &&
          (product.rejection_reason || product.admin_notes) && (
            <div className="mb-5 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 sm:px-5 py-4">
              <div className="flex items-center gap-2 mb-2">
                <XCircle className="w-4 h-4 text-red-400" />
                <span className="text-sm font-semibold text-red-300">
                  Why it was rejected
                </span>
              </div>
              <p className="text-sm text-slate-300 leading-relaxed">
                {product.rejection_reason || product.admin_notes}
              </p>
              <p className="text-xs text-slate-500 mt-2">
                Make the requested changes and re-submit.
              </p>
            </div>
          )}

        {isEditing ? (
          <form onSubmit={handleSave} onChange={() => setIsDirty(true)}>
            <div className="space-y-5">
              {/* Details */}
              <SectionCard
                title="Product Details"
                icon={<FileText className="w-4 h-4 text-lime-400" />}
              >
                <div className="grid gap-5 md:grid-cols-12">
                  <div className="md:col-span-8">
                    <FieldLabel>
                      Product Name <Req />
                    </FieldLabel>
                    <input
                      className={INPUT}
                      value={name}
                      onChange={(e) => setName(e.target.value.slice(0, 120))}
                      placeholder="Product name"
                      disabled={saving}
                    />
                  </div>
                  <div className="md:col-span-4">
                    <FieldLabel>Emoji</FieldLabel>
                    <div className="flex gap-3">
                      <input
                        className={cx(INPUT, "w-20 text-center text-2xl")}
                        value={emoji}
                        onChange={(e) => setEmoji(e.target.value.slice(0, 4))}
                        maxLength={4}
                        disabled={saving}
                      />
                      <div className="flex-1 rounded-xl border border-slate-700 bg-slate-800/30 flex items-center justify-center text-3xl">
                        {emoji || "🛍️"}
                      </div>
                    </div>
                  </div>
                </div>

                <div ref={categoryRef} className="relative">
                  <FieldLabel>
                    Category <Req />
                  </FieldLabel>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => !saving && setShowCatDrop((v) => !v)}
                    className={cx(
                      "w-full rounded-xl border px-4 py-3 text-sm text-left flex items-center justify-between transition-all",
                      showCatDrop
                        ? "border-lime-400 bg-slate-800 ring-2 ring-lime-400/20"
                        : "border-slate-700 bg-slate-800/50 hover:border-slate-500"
                    )}
                  >
                    <span className={selectedCatName ? "text-white" : "text-slate-500"}>
                      {selectedCatName || "Select category…"}
                    </span>
                    <ChevronDown
                      className={cx(
                        "w-4 h-4 text-slate-400 transition-transform",
                        showCatDrop && "rotate-180"
                      )}
                    />
                  </button>

                  {showCatDrop && (
                    <div className="absolute z-50 w-full mt-1 rounded-xl border border-slate-700 bg-slate-900 shadow-2xl overflow-hidden">
                      <div className="max-h-56 overflow-y-auto">
                        {categories.map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => {
                              setCategoryId(c.id);
                              setBranchSlug("");
                              setProductTypeSlug("");
                              setShowCatDrop(false);
                              setIsDirty(true);
                            }}
                            className={cx(
                              "w-full px-4 py-3 text-sm text-left flex items-center justify-between transition-colors",
                              categoryId === c.id
                                ? "bg-lime-500/20 text-lime-300"
                                : "text-slate-300 hover:bg-slate-800"
                            )}
                          >
                            {c.name}
                            {categoryId === c.id && (
                              <CheckCircle2 className="w-4 h-4 text-lime-400" />
                            )}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {availableBranches.length > 0 && (
                  <div className="grid gap-5 md:grid-cols-2">
                    <div>
                      <FieldLabel>
                        Branch <Req />
                      </FieldLabel>
                      <select
                        className={INPUT}
                        value={branchSlug}
                        onChange={(e) => {
                          setBranchSlug(e.target.value);
                          setProductTypeSlug("");
                          setIsDirty(true);
                        }}
                        disabled={saving}
                      >
                        <option value="">Select branch…</option>
                        {availableBranches.map((branch) => (
                          <option key={branch.slug} value={branch.slug}>
                            {branch.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <FieldLabel>
                        Product Type <Req />
                      </FieldLabel>
                      <select
                        className={INPUT}
                        value={productTypeSlug}
                        onChange={(e) => {
                          const nextSlug = e.target.value;
                          const nextType =
                            availableProductTypes.find((item) => item.slug === nextSlug) ??
                            null;
                          setProductTypeSlug(nextSlug);
                          if (nextType?.emoji) setEmoji(nextType.emoji);
                          setIsDirty(true);
                        }}
                        disabled={saving || !branchSlug}
                      >
                        <option value="">Select product type…</option>
                        {availableProductTypes.map((item) => (
                          <option key={item.slug} value={item.slug}>
                            {item.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}

                <div>
                  <FieldLabel>Description</FieldLabel>
                  <textarea
                    className={cx(INPUT, "min-h-[100px] resize-y")}
                    value={description}
                    onChange={(e) => setDescription(e.target.value.slice(0, 800))}
                    placeholder="Describe your product…"
                    disabled={saving}
                  />
                  <div className="flex justify-end mt-1">
                    <span className="text-xs text-slate-500">
                      {description.length}/800
                    </span>
                  </div>
                </div>
              </SectionCard>

              {/* Pricing */}
              <SectionCard
                title="Pricing & Stock"
                icon={<Tag className="w-4 h-4 text-cyan-400" />}
              >
                <div className="grid gap-5 md:grid-cols-2">
                  <div>
                    <FieldLabel>
                      Price (ETB) <Req />
                    </FieldLabel>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 text-sm font-bold">
                        ETB
                      </span>
                      <input
                        className={cx(INPUT, "pl-14")}
                        placeholder="0.00"
                        value={sellerPrice}
                        onChange={(e) => setSellerPrice(e.target.value.slice(0, 16))}
                        disabled={saving}
                      />
                    </div>
                  </div>

                  <div>
                    <FieldLabel>
                      Stock Quantity <Req />
                    </FieldLabel>
                    {hasSizes ? (
                      <div className="rounded-xl border border-slate-700 bg-slate-800/30 px-4 py-3 text-sm text-slate-400 flex items-center gap-2">
                        <Info className="w-4 h-4 text-slate-500 shrink-0" />
                        From variant rows
                        <span className="ml-auto text-white font-semibold">
                          {sizeTotal} units
                        </span>
                      </div>
                    ) : (
                      <>
                        <input
                          type="number"
                          min="0"
                          className={INPUT}
                          placeholder="0"
                          value={stockQty}
                          onChange={(e) => setStockQty(e.target.value)}
                          disabled={saving}
                        />
                        {stockQty !== "" && Number(stockQty) === 0 && (
                          <p className="text-xs text-amber-400 mt-1.5 flex items-center gap-1.5">
                            <AlertCircle className="w-3.5 h-3.5" />
                            Will show as out of stock immediately.
                          </p>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </SectionCard>

              {/* Images */}
              <SectionCard
                title="Images"
                icon={<ImagePlus className="w-4 h-4 text-purple-400" />}
              >
                <div className="grid gap-5 md:grid-cols-2">
                  <div>
                    <FieldLabel>
                      Main Image <Req />
                    </FieldLabel>
                    <label
                      className={cx(
                        "group relative flex flex-col items-center justify-center w-full h-48 rounded-2xl border-2 border-dashed cursor-pointer transition-all overflow-hidden",
                        !imageUploading
                          ? "border-slate-600 hover:border-purple-400/50 bg-slate-800/30"
                          : "border-slate-700"
                      )}
                    >
                      {imageUrl ? (
                        <>
                          <img src={imageUrl} alt="" className="w-full h-full object-cover" />
                          <div className="absolute inset-0 bg-slate-950/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-sm">
                            <Camera className="w-5 h-5 text-white" />
                          </div>
                        </>
                      ) : (
                        <div className="flex flex-col items-center gap-2 text-slate-500">
                          {imageUploading ? (
                            <div className="w-7 h-7 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" />
                          ) : (
                            <ImagePlus className="w-7 h-7" />
                          )}
                          <span className="text-sm">
                            {imageUploading ? "Uploading…" : "Upload Image"}
                          </span>
                        </div>
                      )}
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleMainImage}
                        className="hidden"
                        disabled={imageUploading}
                      />
                    </label>
                    {imageError && (
                      <p className="mt-1 text-sm text-red-400">{imageError}</p>
                    )}
                    {imageUrl && (
                      <button
                        type="button"
                        onClick={() => {
                          setImageUrl("");
                          setIsDirty(true);
                        }}
                        className="mt-1.5 text-xs text-red-400 hover:text-red-300 flex items-center gap-1"
                      >
                        <X className="w-3 h-3" />
                        Remove
                      </button>
                    )}
                  </div>

                  <div>
                    <FieldLabel>
                      Gallery{" "}
                      <span className="text-slate-500 font-normal">
                        (drag to reorder)
                      </span>
                    </FieldLabel>
                    <label
                      className={cx(
                        "flex items-center justify-center gap-2 w-full px-4 py-4 rounded-2xl border-2 border-dashed cursor-pointer transition-all mb-3",
                        !extraUploading
                          ? "border-slate-600 hover:border-purple-400/50 bg-slate-800/30 text-slate-400 hover:text-purple-400"
                          : "border-slate-700"
                      )}
                    >
                      {extraUploading ? (
                        <div className="w-4 h-4 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <Upload className="w-4 h-4" />
                      )}
                      <span className="text-sm">
                        {extraUploading ? "Uploading…" : "Add Photos"}
                      </span>
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        onChange={handleExtraImages}
                        className="hidden"
                        disabled={extraUploading}
                      />
                    </label>

                    {extraUrls.length > 0 && (
                      <div className="grid grid-cols-3 gap-2">
                        {extraUrls.map((url, idx) => (
                          <div
                            key={url}
                            draggable
                            onDragStart={() => galleryDragStart(idx)}
                            onDragEnd={() => {
                              dragIndex.current = null;
                              setDraggingIndex(null);
                              setDragOverIndex(null);
                            }}
                            onDragOver={(e) => {
                              e.preventDefault();
                              setDragOverIndex(idx);
                            }}
                            onDragLeave={() =>
                              setDragOverIndex((p) => (p === idx ? null : p))
                            }
                            onDrop={() => galleryDrop(idx)}
                            className={cx(
                              "relative aspect-square rounded-xl border overflow-hidden group bg-slate-800/50 cursor-grab transition-all",
                              dragOverIndex === idx
                                ? "border-cyan-400 ring-2 ring-cyan-400/30 scale-[1.03]"
                                : "border-slate-700",
                              draggingIndex === idx && "opacity-60"
                            )}
                          >
                            <img src={url} alt="" className="w-full h-full object-cover" />
                            <div className="absolute top-1 left-1 opacity-0 group-hover:opacity-100">
                              <div className="w-5 h-5 rounded bg-slate-950/70 flex items-center justify-center">
                                <GripVertical className="w-3 h-3 text-slate-300" />
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                setExtraUrls((p) => p.filter((u) => u !== url));
                                setIsDirty(true);
                              }}
                              className="absolute top-1 right-1 w-5 h-5 rounded bg-slate-950/80 opacity-0 group-hover:opacity-100 transition-all hover:bg-red-500 flex items-center justify-center"
                            >
                              <X className="w-2.5 h-2.5 text-white" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </SectionCard>

              {/* Variants */}
              <SectionCard
                title="Variants"
                icon={<Layers className="w-4 h-4 text-orange-400" />}
              >
                {/* Colors */}
                <div className="rounded-2xl border border-slate-700/60 bg-slate-800/20 overflow-hidden mb-4">
                  <div className="px-5 py-4 flex items-center justify-between border-b border-slate-700/40">
                    <div className="flex items-center gap-2.5">
                      <Palette className="w-4 h-4 text-orange-400" />
                      <span className="text-sm font-semibold text-white">
                        Color Variants
                      </span>
                    </div>
                    <Toggle
                      on={hasColors}
                      onChange={() => {
                        const next = !hasColors;
                        setHasColors(next);
                        if (!next) {
                          setColorVariants([]);
                          setExpandedIds(new Set());
                        }
                        setIsDirty(true);
                      }}
                    />
                  </div>

                  {hasColors && (
                    <div className="p-5 space-y-4">
                      <div className="flex flex-wrap gap-2">
                        {COLOR_SWATCHES.map((sw) => {
                          const added = colorVariants.some(
                            (c) => c.name.toLowerCase() === sw.name.toLowerCase()
                          );
                          return (
                            <button
                              key={sw.name}
                              type="button"
                              onClick={() => !added && addColor(sw)}
                              disabled={added}
                              className={cx(
                                "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-all",
                                added
                                  ? "border-slate-700 bg-slate-800/30 text-slate-600 cursor-not-allowed"
                                  : "border-slate-600 bg-slate-800/50 text-slate-300 hover:border-slate-400 hover:text-white"
                              )}
                            >
                              <span
                                className="w-3 h-3 rounded-full border border-white/20 shrink-0"
                                style={{ backgroundColor: sw.hex }}
                              />
                              {sw.name}
                              {added && (
                                <CheckCircle2 className="w-3 h-3 text-orange-400" />
                              )}
                            </button>
                          );
                        })}

                        <button
                          type="button"
                          onClick={() => addColor()}
                          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-dashed border-slate-600 text-xs text-slate-400 hover:text-white hover:border-slate-400 transition-all"
                        >
                          <Plus className="w-3 h-3" />
                          Custom
                        </button>
                      </div>

                      {colorVariants.map((cv) => (
                        <ColorCard
                          key={cv.id}
                          variant={cv}
                          expanded={expandedIds.has(cv.id)}
                          onToggle={() =>
                            setExpandedIds((p) => {
                              const n = new Set(p);
                              n.has(cv.id) ? n.delete(cv.id) : n.add(cv.id);
                              return n;
                            })
                          }
                          disabled={saving}
                          mainUploading={!!colorMainUpl[cv.id]}
                          extraUploading={!!colorExtraUpl[cv.id]}
                          onUpdate={(patch) => updateColor(cv.id, patch)}
                          onRemove={() => removeColor(cv.id)}
                          onMainImage={(e) => handleColorMain(cv.id, e)}
                          onExtraImages={(e) => handleColorExtra(cv.id, e)}
                          onRemoveExtra={(url) => {
                            setColorVariants((p) =>
                              p.map((c) =>
                                c.id === cv.id
                                  ? {
                                      ...c,
                                      extraImageUrls: c.extraImageUrls.filter(
                                        (u) => u !== url
                                      ),
                                    }
                                  : c
                              )
                            );
                            setIsDirty(true);
                          }}
                        />
                      ))}

                      {colorVariants.length === 0 && (
                        <div className="rounded-xl border border-dashed border-slate-700 py-6 text-center">
                          <p className="text-sm text-slate-500">No colors added yet.</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Options */}
                <div className="rounded-2xl border border-slate-700/60 bg-slate-800/20 overflow-hidden">
                  <div className="px-5 py-4 flex items-center justify-between border-b border-slate-700/40">
                    <div className="flex items-center gap-2.5">
                      <Ruler className="w-4 h-4 text-cyan-400" />
                      <span className="text-sm font-semibold text-white">
                        {selectedProductType ? dynamicOptionLabel : "Size Variants"}
                      </span>
                    </div>
                    <Toggle on={hasSizes} color="bg-cyan-500" onChange={toggleSizes} />
                  </div>

                  {hasSizes && (
                    <div className="p-5 space-y-4">
                      {selectedProductType ? (
                        <div className="flex flex-wrap gap-2">
                          {dynamicOptionValues.map((label) => {
                            const added = sizeVariants.some((s) => s.label === label);
                            return (
                              <button
                                key={label}
                                type="button"
                                onClick={() => !added && addSize(label)}
                                disabled={added}
                                className={cx(
                                  "px-2.5 py-1 rounded-lg border text-xs font-medium transition-all",
                                  added
                                    ? "border-cyan-500/40 bg-cyan-500/10 text-cyan-400 cursor-not-allowed"
                                    : "border-slate-600 bg-slate-800/50 text-slate-300 hover:border-cyan-400/50 hover:text-white"
                                )}
                              >
                                {label}
                                {added && " ✓"}
                              </button>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {Object.entries(SIZE_PRESETS).map(([g, labels]) => (
                            <div key={g} className="flex items-center gap-2 flex-wrap">
                              <span className="text-xs text-slate-600 w-14 capitalize shrink-0">
                                {g}
                              </span>
                              {labels.map((label) => {
                                const added = sizeVariants.some((s) => s.label === label);
                                return (
                                  <button
                                    key={label}
                                    type="button"
                                    onClick={() => !added && addSize(label)}
                                    disabled={added}
                                    className={cx(
                                      "px-2.5 py-1 rounded-lg border text-xs font-medium transition-all",
                                      added
                                        ? "border-cyan-500/40 bg-cyan-500/10 text-cyan-400 cursor-not-allowed"
                                        : "border-slate-600 bg-slate-800/50 text-slate-300 hover:border-cyan-400/50 hover:text-white"
                                    )}
                                  >
                                    {label}
                                    {added && " ✓"}
                                  </button>
                                );
                              })}
                            </div>
                          ))}
                        </div>
                      )}

                      <button
                        type="button"
                        onClick={() => addSize()}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-dashed border-slate-600 text-xs text-slate-400 hover:text-white transition-all"
                      >
                        <Plus className="w-3 h-3" />
                        Custom
                      </button>

                      {/* Mobile cards */}
                      <div className="md:hidden space-y-3">
                        {sizeVariants.map((sv) => (
                          <div
                            key={sv.id}
                            className="rounded-xl border border-slate-700 bg-slate-900/50 p-3 space-y-3"
                          >
                            <div className="flex items-center justify-between">
                              <div className="text-xs text-slate-500">Option row</div>
                              <button
                                type="button"
                                onClick={() =>
                                  setSizeVariants((p) => p.filter((s) => s.id !== sv.id))
                                }
                                disabled={saving}
                                className="w-8 h-8 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10 flex items-center justify-center transition-all"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>

                            <div>
                              <label className="block text-xs text-slate-400 mb-1">
                                Label
                              </label>
                              <input
                                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-cyan-400"
                                placeholder="e.g. M"
                                value={sv.label}
                                onChange={(e) =>
                                  updateSize(sv.id, {
                                    label: e.target.value.slice(0, 32),
                                  })
                                }
                                disabled={saving}
                              />
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <label className="block text-xs text-slate-400 mb-1">
                                  Stock
                                </label>
                                <input
                                  type="number"
                                  min="0"
                                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-cyan-400"
                                  placeholder="0"
                                  value={sv.stock === 0 ? "" : sv.stock}
                                  onChange={(e) =>
                                    updateSize(sv.id, {
                                      stock: Math.max(
                                        0,
                                        parseInt(e.target.value) || 0
                                      ),
                                    })
                                  }
                                  disabled={saving}
                                />
                              </div>

                              <div>
                                <label className="block text-xs text-slate-400 mb-1">
                                  Price ± ETB
                                </label>
                                <input
                                  type="number"
                                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-cyan-400"
                                  placeholder="0.00"
                                  value={
                                    sv.priceAdjustCents === 0
                                      ? ""
                                      : sv.priceAdjustCents / 100
                                  }
                                  onChange={(e) =>
                                    updateSize(sv.id, {
                                      priceAdjustCents: Math.round(
                                        (parseFloat(e.target.value) || 0) * 100
                                      ),
                                    })
                                  }
                                  disabled={saving}
                                />
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>

                      {sizeVariants.length > 0 && (
                        <div className="hidden md:block rounded-xl border border-slate-700 overflow-hidden">
                          <div className="grid grid-cols-12 bg-slate-800/60 border-b border-slate-700 px-4 py-2.5 text-xs font-medium text-slate-400">
                            <div className="col-span-3">Label</div>
                            <div className="col-span-4">Stock</div>
                            <div className="col-span-4">Price ±</div>
                            <div className="col-span-1" />
                          </div>

                          {sizeVariants.map((sv, idx) => (
                            <div
                              key={sv.id}
                              className={cx(
                                "grid grid-cols-12 items-center px-4 py-2.5 border-b border-slate-700/50 last:border-0",
                                idx % 2 === 0 ? "bg-slate-800/10" : "bg-slate-800/30"
                              )}
                            >
                              <div className="col-span-3 pr-3">
                                <input
                                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-white text-sm outline-none focus:border-cyan-400"
                                  placeholder="M"
                                  value={sv.label}
                                  onChange={(e) =>
                                    updateSize(sv.id, {
                                      label: e.target.value.slice(0, 32),
                                    })
                                  }
                                  disabled={saving}
                                />
                              </div>
                              <div className="col-span-4 pr-3">
                                <input
                                  type="number"
                                  min="0"
                                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-white text-sm outline-none focus:border-cyan-400"
                                  placeholder="0"
                                  value={sv.stock === 0 ? "" : sv.stock}
                                  onChange={(e) =>
                                    updateSize(sv.id, {
                                      stock: Math.max(
                                        0,
                                        parseInt(e.target.value) || 0
                                      ),
                                    })
                                  }
                                  disabled={saving}
                                />
                              </div>
                              <div className="col-span-4 pr-3">
                                <div className="relative">
                                  <span className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-500 text-xs">
                                    ±
                                  </span>
                                  <input
                                    type="number"
                                    className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-5 pr-2 py-1.5 text-white text-sm outline-none focus:border-cyan-400"
                                    placeholder="0"
                                    value={
                                      sv.priceAdjustCents === 0
                                        ? ""
                                        : sv.priceAdjustCents / 100
                                    }
                                    onChange={(e) =>
                                      updateSize(sv.id, {
                                        priceAdjustCents: Math.round(
                                          (parseFloat(e.target.value) || 0) * 100
                                        ),
                                      })
                                    }
                                    disabled={saving}
                                  />
                                </div>
                              </div>
                              <div className="col-span-1 flex justify-center">
                                <button
                                  type="button"
                                  onClick={() =>
                                    setSizeVariants((p) =>
                                      p.filter((s) => s.id !== sv.id)
                                    )
                                  }
                                  disabled={saving}
                                  className="w-7 h-7 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10 flex items-center justify-center transition-all"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          ))}

                          <div className="grid grid-cols-12 px-4 py-3 bg-slate-800/40 text-xs">
                            <div className="col-span-3 text-slate-500">Total</div>
                            <div className="col-span-9 font-bold text-white">
                              {sizeVariants.reduce((s, v) => s + (v.stock || 0), 0)}{" "}
                              units
                            </div>
                          </div>
                        </div>
                      )}

                      {sizeVariants.length === 0 && (
                        <div className="rounded-xl border border-dashed border-slate-700 py-6 text-center">
                          <p className="text-sm text-slate-500">
                            No variant options added yet.
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </SectionCard>

              {/* Edit footer */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pb-6">
                <button
                  type="button"
                  onClick={() => {
                    populate(product);
                    setIsEditing(false);
                  }}
                  disabled={saving}
                  className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-sm text-slate-400 hover:text-white hover:bg-slate-800/50 transition-all"
                >
                  <RotateCcw className="w-4 h-4" />
                  Discard
                </button>

                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                  <button
                    type="submit"
                    disabled={saving || anyUploading}
                    className="flex items-center justify-center gap-2 px-7 py-2.5 rounded-xl bg-gradient-to-r from-lime-400 to-emerald-400 hover:from-lime-300 hover:to-emerald-300 disabled:from-slate-700 disabled:to-slate-700 disabled:cursor-not-allowed text-slate-900 text-sm font-bold shadow-lg shadow-lime-500/20 transition-all hover:scale-[1.02] active:scale-[0.98]"
                  >
                    {saving ? (
                      <>
                        <div className="w-4 h-4 border-2 border-slate-900 border-t-transparent rounded-full animate-spin" />
                        Saving…
                      </>
                    ) : (
                      <>
                        <Save className="w-4 h-4" />
                        Save Changes
                      </>
                    )}
                  </button>

                  {canSubmit && (
                    <button
                      type="button"
                      onClick={handleSubmit}
                      disabled={submitting || saving || anyUploading}
                      className="flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-amber-400 to-orange-400 hover:from-amber-300 hover:to-orange-300 disabled:from-slate-700 disabled:to-slate-700 disabled:cursor-not-allowed text-slate-900 text-sm font-bold transition-all hover:scale-[1.02] active:scale-[0.98]"
                    >
                      {submitting ? (
                        <>
                          <div className="w-4 h-4 border-2 border-slate-900 border-t-transparent rounded-full animate-spin" />
                          Submitting…
                        </>
                      ) : (
                        <>
                          <Send className="w-4 h-4" />
                          Save & Submit
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </form>
        ) : (
          <div className="rounded-3xl border border-slate-700/50 bg-slate-900/50 backdrop-blur-xl overflow-hidden shadow-2xl shadow-black/20">
            <div className="grid md:grid-cols-5">
              <div className="md:col-span-2 bg-slate-800/30 relative min-h-[260px] flex items-center justify-center">
                {product.image_url ? (
                  <img
                    src={product.image_url}
                    alt={product.name}
                    className="w-full h-full object-cover"
                    style={{ minHeight: 260 }}
                  />
                ) : (
                  <div className="flex flex-col items-center gap-2 text-slate-600 p-8">
                    <Camera className="w-12 h-12" />
                    <span className="text-sm">No image uploaded</span>
                  </div>
                )}

                {(product.extra_image_urls?.length ?? 0) > 0 && (
                  <div className="absolute bottom-3 left-3 right-3 flex gap-1.5 overflow-x-auto">
                    {product.extra_image_urls!.slice(0, 5).map((url) => (
                      <img
                        key={url}
                        src={url}
                        alt=""
                        className="w-12 h-12 object-cover rounded-lg border border-slate-700 shrink-0"
                      />
                    ))}
                    {product.extra_image_urls!.length > 5 && (
                      <div className="w-12 h-12 rounded-lg border border-slate-700 bg-slate-900/80 flex items-center justify-center text-xs text-slate-400 shrink-0">
                        +{product.extra_image_urls!.length - 5}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="md:col-span-3 p-5 sm:p-6 md:p-8 flex flex-col gap-5">
                <div>
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <h2 className="text-xl sm:text-2xl font-bold text-white">
                      {product.name}
                    </h2>
                    <span className="text-3xl shrink-0">{product.emoji || "🛍️"}</span>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    {selectedCatName && (
                      <span className="inline-flex items-center gap-1 text-xs text-slate-400 bg-slate-800 px-2.5 py-1 rounded-full border border-slate-700">
                        <Tag className="w-3 h-3" />
                        {selectedCatName}
                      </span>
                    )}

                    {selectedBranch && (
                      <span className="inline-flex items-center gap-1 text-xs text-slate-400 bg-slate-800 px-2.5 py-1 rounded-full border border-slate-700">
                        {selectedBranch.name}
                      </span>
                    )}

                    {selectedProductType && (
                      <span className="inline-flex items-center gap-1 text-xs text-slate-400 bg-slate-800 px-2.5 py-1 rounded-full border border-slate-700">
                        {selectedProductType.name}
                      </span>
                    )}
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between py-3 border-b border-slate-800">
                    <span className="text-sm text-slate-400">Price</span>
                    <span className="text-lg font-bold text-white">
                      ETB {centsToStr(product.price_cents)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between py-3 border-b border-slate-800">
                    <span className="text-sm text-slate-400">Stock</span>
                    <span className="text-lg font-bold text-white">
                      {product.stock_quantity} units
                    </span>
                  </div>

                  {(product.color_variants?.length ?? 0) > 0 && (
                    <div className="py-3 border-b border-slate-800">
                      <span className="text-sm text-slate-400 block mb-2">Colors</span>
                      <div className="flex flex-wrap gap-2">
                        {product.color_variants!.map((c) => (
                          <div
                            key={c.id}
                            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700"
                          >
                            <span
                              className="w-4 h-4 rounded-full border border-white/20"
                              style={{ backgroundColor: c.hex }}
                            />
                            <span className="text-sm text-white">{c.name}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {(product.size_variants?.length ?? 0) > 0 && (
                    <div className="py-3 border-b border-slate-800">
                      <span className="text-sm text-slate-400 block mb-2">Options</span>
                      <div className="flex flex-wrap gap-2">
                        {product.size_variants!.map((s) => (
                          <div
                            key={s.id}
                            className="px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-sm text-white"
                          >
                            {s.label} ({s.stock})
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {product.description && (
                    <div className="py-3">
                      <span className="text-sm text-slate-400 block mb-2">
                        Description
                      </span>
                      <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">
                        {product.description}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
