"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import {
  ChevronDown,
  Upload,
  X,
  ArrowLeft,
  AlertCircle,
  CheckCircle2,
  Sparkles,
  Shield,
  Camera,
  Plus,
  Tag,
  FileText,
  Box,
  ImagePlus,
  Layers,
  Palette,
  Ruler,
  Trash2,
  GripVertical,
  Info,
} from "lucide-react";

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

function validateImageFile(file: File): string | null {
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    return `"${file.name}" is not a supported image format. Use PNG, JPG, WebP, or GIF.`;
  }
  if (file.size > MAX_FILE_SIZE) {
    return `"${file.name}" exceeds 5MB. Please use a smaller image.`;
  }
  return null;
}

// ─── Types ────────────────────────────────────────────────────────────────────

type CategoryRow = { id: string; name: string; slug: string };

type ProductStatus =
  | "draft"
  | "submitted"
  | "approved"
  | "rejected"
  | "archived";

export type ColorVariant = {
  id: string;
  name: string;
  hex: string;
  imageUrl: string;
  extraImageUrls: string[];
};

export type SizeVariant = {
  id: string;
  label: string;
  stock: number;
  priceAdjustCents: number;
};

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

type Section = "details" | "pricing" | "images" | "variants";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function dollarsToCents(v: string) {
  const n = Number(String(v).replace(/[^0-9.]/g, "").trim());
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

function centsToEtbString(cents: number) {
  return (cents / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function slugify(input: string) {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function makeSlug(name: string) {
  const base = slugify(name);
  const suffix = Math.random().toString(36).slice(2, 7);
  return base ? `${base}-${suffix}` : suffix;
}

function prettyError(err: any) {
  if (!err) return "Unknown error.";
  if (typeof err === "string") return err;
  if (err.message) return err.message;
  if (err.error_description) return err.error_description;
  if (err.details) return err.details;
  if (err.hint) return err.hint;
  try {
    return JSON.stringify(err, null, 2);
  } catch {
    return String(err);
  }
}

function classNames(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
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
    if (!used.has(existing.label)) {
      merged.push(existing);
    }
  }

  return merged;
}

async function uploadToProductImages(file: File, path: string) {
  const { error } = await supabase.storage
    .from("product-images")
    .upload(path, file);
  if (error) throw error;
  return supabase.storage.from("product-images").getPublicUrl(path).data.publicUrl;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const INPUT =
  "w-full rounded-xl border border-slate-700 bg-slate-800/50 px-4 py-3 text-white placeholder:text-slate-500 focus:border-lime-400 focus:ring-2 focus:ring-lime-400/20 transition-all outline-none";

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

const CATEGORY_BRANCHES: Record<string, BranchPreset[]> = {
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

  audio: [
    {
      slug: "personal-audio",
      name: "Personal Audio",
      items: [
        {
          slug: "headphones",
          name: "Headphones",
          emoji: "🎧",
          variantPreset: {
            enableColors: true,
            optionLabel: "Headphone Type",
            optionValues: [
              "Over-Ear",
              "On-Ear",
              "In-Ear",
              "Wireless",
              "Noise Cancelling",
            ],
          },
        },
        {
          slug: "earbuds",
          name: "Earbuds",
          emoji: "🎵",
          variantPreset: {
            enableColors: true,
            optionLabel: "Model",
            optionValues: ["Wired", "Wireless", "Gaming", "Sport"],
          },
        },
      ],
    },
    {
      slug: "speakers",
      name: "Speakers",
      items: [
        {
          slug: "bluetooth-speakers",
          name: "Bluetooth Speakers",
          emoji: "🔊",
          variantPreset: {
            enableColors: true,
            optionLabel: "Speaker Size",
            optionValues: ["Mini", "Portable", "Standard", "Party"],
          },
        },
        {
          slug: "soundbars",
          name: "Soundbars",
          emoji: "📣",
          variantPreset: {
            enableColors: true,
            optionLabel: "Channel",
            optionValues: ["2.1", "3.1", "5.1"],
          },
        },
      ],
    },
  ],

  laptops: [
    {
      slug: "consumer-laptops",
      name: "Consumer Laptops",
      items: [
        {
          slug: "ultrabooks",
          name: "Ultrabooks",
          emoji: "💻",
          variantPreset: {
            enableColors: true,
            optionLabel: "RAM / Storage",
            optionValues: [
              "8GB / 256GB",
              "8GB / 512GB",
              "16GB / 512GB",
              "16GB / 1TB",
            ],
          },
        },
        {
          slug: "gaming-laptops",
          name: "Gaming Laptops",
          emoji: "🕹️",
          variantPreset: {
            enableColors: true,
            optionLabel: "RAM / Storage",
            optionValues: [
              "8GB / 512GB",
              "16GB / 512GB",
              "16GB / 1TB",
              "32GB / 1TB",
            ],
          },
        },
      ],
    },
  ],

  accessories: [
    {
      slug: "phone-accessories",
      name: "Phone Accessories",
      items: [
        {
          slug: "phone-cases",
          name: "Phone Cases",
          emoji: "📱",
          variantPreset: {
            enableColors: true,
            optionLabel: "Phone Model",
            optionValues: [
              "iPhone 13",
              "iPhone 14",
              "iPhone 15",
              "Samsung S23",
              "Samsung S24",
            ],
          },
        },
        {
          slug: "chargers",
          name: "Chargers",
          emoji: "🔌",
          variantPreset: {
            enableColors: false,
            optionLabel: "Charger Type",
            optionValues: ["20W", "30W", "45W", "65W", "USB-C", "Wireless"],
          },
        },
        {
          slug: "power-banks",
          name: "Power Banks",
          emoji: "🔋",
          variantPreset: {
            enableColors: true,
            optionLabel: "Capacity",
            optionValues: ["5000mAh", "10000mAh", "20000mAh"],
          },
        },
        {
          slug: "screen-protectors",
          name: "Screen Protectors",
          emoji: "🛡️",
          variantPreset: {
            enableColors: false,
            optionLabel: "Pack / Model",
            optionValues: ["1 Pack", "2 Pack", "3 Pack", "iPhone", "Samsung"],
          },
        },
      ],
    },
    {
      slug: "tech-accessories",
      name: "Tech Accessories",
      items: [
        {
          slug: "cables",
          name: "Cables",
          emoji: "🔌",
          variantPreset: {
            enableColors: true,
            optionLabel: "Cable Type",
            optionValues: ["USB-C", "Lightning", "Micro USB", "HDMI"],
          },
        },
        {
          slug: "adapters",
          name: "Adapters",
          emoji: "🔄",
          variantPreset: {
            enableColors: false,
            optionLabel: "Adapter Type",
            optionValues: ["USB-C Hub", "HDMI", "VGA", "Audio Adapter"],
          },
        },
      ],
    },
  ],

  wearables: [
    {
      slug: "smart-wearables",
      name: "Smart Wearables",
      items: [
        {
          slug: "smart-watches",
          name: "Smart Watches",
          emoji: "⌚",
          variantPreset: {
            enableColors: true,
            optionLabel: "Watch Size",
            optionValues: ["40mm", "41mm", "44mm", "45mm"],
          },
        },
        {
          slug: "fitness-bands",
          name: "Fitness Bands",
          emoji: "🏃",
          variantPreset: {
            enableColors: true,
            optionLabel: "Band Size",
            optionValues: ["Small", "Medium", "Large"],
          },
        },
      ],
    },
  ],

  diapers_wipes: [
    {
      slug: "diapers",
      name: "Diapers",
      items: [
        {
          slug: "baby-diapers",
          name: "Baby Diapers",
          emoji: "🍼",
          variantPreset: {
            enableColors: false,
            optionLabel: "Size / Pack",
            optionValues: [
              "Newborn / 20 Pack",
              "Size 1 / 40 Pack",
              "Size 2 / 40 Pack",
              "Size 3 / 80 Pack",
              "Size 4 / 80 Pack",
              "Size 5 / 80 Pack",
            ],
          },
        },
        {
          slug: "overnight-diapers",
          name: "Overnight Diapers",
          emoji: "🌙",
          variantPreset: {
            enableColors: false,
            optionLabel: "Size / Pack",
            optionValues: [
              "Size 3 / 30 Pack",
              "Size 4 / 30 Pack",
              "Size 5 / 30 Pack",
              "Size 6 / 30 Pack",
            ],
          },
        },
      ],
    },
    {
      slug: "wipes",
      name: "Wipes",
      items: [
        {
          slug: "baby-wipes",
          name: "Baby Wipes",
          emoji: "🧻",
          variantPreset: {
            enableColors: false,
            optionLabel: "Pack Type",
            optionValues: ["60 Count", "80 Count", "3 Pack", "6 Pack"],
          },
        },
        {
          slug: "sensitive-wipes",
          name: "Sensitive Wipes",
          emoji: "🧴",
          variantPreset: {
            enableColors: false,
            optionLabel: "Pack Type",
            optionValues: ["60 Count", "80 Count", "3 Pack"],
          },
        },
      ],
    },
  ],

  mattress_bedding: [
    {
      slug: "mattresses",
      name: "Mattresses",
      items: [
        {
          slug: "foam-mattress",
          name: "Foam Mattress",
          emoji: "🛏️",
          variantPreset: {
            enableColors: true,
            optionLabel: "Bed Size / Thickness",
            optionValues: [
              "Twin / 6 inch",
              "Twin / 8 inch",
              "Full / 8 inch",
              "Queen / 10 inch",
              "King / 12 inch",
            ],
          },
        },
        {
          slug: "spring-mattress",
          name: "Spring Mattress",
          emoji: "🛏️",
          variantPreset: {
            enableColors: true,
            optionLabel: "Bed Size / Thickness",
            optionValues: [
              "Twin / 8 inch",
              "Full / 10 inch",
              "Queen / 10 inch",
              "King / 12 inch",
            ],
          },
        },
      ],
    },
    {
      slug: "bedding",
      name: "Bedding",
      items: [
        {
          slug: "bedsheets",
          name: "Bedsheets",
          emoji: "🛌",
          variantPreset: {
            enableColors: true,
            optionLabel: "Bed Size",
            optionValues: ["Twin", "Full", "Queen", "King"],
          },
        },
        {
          slug: "blankets",
          name: "Blankets",
          emoji: "🧣",
          variantPreset: {
            enableColors: true,
            optionLabel: "Blanket Size",
            optionValues: ["Single", "Double", "Queen", "King"],
          },
        },
        {
          slug: "pillows",
          name: "Pillows",
          emoji: "🛏️",
          variantPreset: {
            enableColors: true,
            optionLabel: "Pillow Size",
            optionValues: ["Standard", "Queen", "King", "2 Pack"],
          },
        },
      ],
    },
  ],

  clothing: [
    {
      slug: "adult-clothing",
      name: "Adult Clothing",
      items: [
        {
          slug: "tshirts",
          name: "T-Shirts",
          emoji: "👕",
          variantPreset: {
            enableColors: true,
            optionLabel: "Size",
            optionValues: ["XS", "S", "M", "L", "XL", "XXL"],
          },
        },
        {
          slug: "hoodies",
          name: "Hoodies",
          emoji: "🧥",
          variantPreset: {
            enableColors: true,
            optionLabel: "Size",
            optionValues: ["S", "M", "L", "XL", "XXL"],
          },
        },
        {
          slug: "pants",
          name: "Pants",
          emoji: "👖",
          variantPreset: {
            enableColors: true,
            optionLabel: "Waist Size",
            optionValues: ["28", "30", "32", "34", "36", "38"],
          },
        },
        {
          slug: "dresses",
          name: "Dresses",
          emoji: "👗",
          variantPreset: {
            enableColors: true,
            optionLabel: "Size",
            optionValues: ["XS", "S", "M", "L", "XL"],
          },
        },
      ],
    },
  ],

  kids_clothes: [
    {
      slug: "baby-kids-clothes",
      name: "Baby & Kids Clothes",
      items: [
        {
          slug: "baby-sets",
          name: "Baby Sets",
          emoji: "🍼",
          variantPreset: {
            enableColors: true,
            optionLabel: "Age Size",
            optionValues: [
              "0-3 Months",
              "3-6 Months",
              "6-9 Months",
              "9-12 Months",
              "12-18 Months",
            ],
          },
        },
        {
          slug: "kids-tops",
          name: "Kids Tops",
          emoji: "👕",
          variantPreset: {
            enableColors: true,
            optionLabel: "Age Size",
            optionValues: ["2Y", "3Y", "4Y", "5Y", "6Y", "7Y", "8Y"],
          },
        },
        {
          slug: "kids-bottoms",
          name: "Kids Bottoms",
          emoji: "🩳",
          variantPreset: {
            enableColors: true,
            optionLabel: "Age Size",
            optionValues: ["2Y", "3Y", "4Y", "5Y", "6Y", "7Y", "8Y"],
          },
        },
      ],
    },
  ],

  shoes: [
    {
      slug: "adult-shoes",
      name: "Adult Shoes",
      items: [
        {
          slug: "sneakers",
          name: "Sneakers",
          emoji: "👟",
          variantPreset: {
            enableColors: true,
            optionLabel: "Shoe Size",
            optionValues: ["38", "39", "40", "41", "42", "43", "44", "45"],
          },
        },
        {
          slug: "sandals",
          name: "Sandals",
          emoji: "🩴",
          variantPreset: {
            enableColors: true,
            optionLabel: "Shoe Size",
            optionValues: ["36", "37", "38", "39", "40", "41", "42"],
          },
        },
        {
          slug: "dress-shoes",
          name: "Dress Shoes",
          emoji: "👞",
          variantPreset: {
            enableColors: true,
            optionLabel: "Shoe Size",
            optionValues: ["39", "40", "41", "42", "43", "44", "45"],
          },
        },
      ],
    },
  ],

  home_appliances: [
    {
      slug: "small-appliances",
      name: "Small Appliances",
      items: [
        {
          slug: "air-fryers",
          name: "Air Fryers",
          emoji: "🍟",
          variantPreset: {
            enableColors: true,
            optionLabel: "Capacity",
            optionValues: ["3L", "4L", "5L", "6L", "8L"],
          },
        },
        {
          slug: "blenders",
          name: "Blenders",
          emoji: "🥤",
          variantPreset: {
            enableColors: true,
            optionLabel: "Jar Size / Power",
            optionValues: [
              "1.5L / 500W",
              "1.5L / 700W",
              "2L / 1000W",
            ],
          },
        },
        {
          slug: "kettles",
          name: "Electric Kettles",
          emoji: "☕",
          variantPreset: {
            enableColors: true,
            optionLabel: "Capacity",
            optionValues: ["1L", "1.5L", "2L"],
          },
        },
      ],
    },
  ],

  toys: [
    {
      slug: "kids-toys",
      name: "Kids Toys",
      items: [
        {
          slug: "plush-toys",
          name: "Plush Toys",
          emoji: "🧸",
          variantPreset: {
            enableColors: true,
            optionLabel: "Toy Size",
            optionValues: ["Small", "Medium", "Large"],
          },
        },
        {
          slug: "building-toys",
          name: "Building Toys",
          emoji: "🧱",
          variantPreset: {
            enableColors: false,
            optionLabel: "Piece Count",
            optionValues: ["50 Pieces", "100 Pieces", "200 Pieces"],
          },
        },
        {
          slug: "remote-control-toys",
          name: "Remote Control Toys",
          emoji: "🚗",
          variantPreset: {
            enableColors: true,
            optionLabel: "Model",
            optionValues: ["Car", "Truck", "Drone"],
          },
        },
      ],
    },
  ],

  office_furniture: [
    {
      slug: "office-seating-desks",
      name: "Office Seating & Desks",
      items: [
        {
          slug: "office-chairs",
          name: "Office Chairs",
          emoji: "🪑",
          variantPreset: {
            enableColors: true,
            optionLabel: "Chair Type",
            optionValues: ["Standard", "Ergonomic", "Executive", "Mesh Back"],
          },
        },
        {
          slug: "office-desks",
          name: "Office Desks",
          emoji: "🧑‍💼",
          variantPreset: {
            enableColors: true,
            optionLabel: "Desk Size",
            optionValues: ["100cm", "120cm", "140cm", "160cm"],
          },
        },
      ],
    },
  ],

  office_tech: [
    {
      slug: "office-devices",
      name: "Office Devices",
      items: [
        {
          slug: "printers",
          name: "Printers",
          emoji: "🖨️",
          variantPreset: {
            enableColors: true,
            optionLabel: "Printer Type",
            optionValues: ["Inkjet", "Laser", "All-in-One"],
          },
        },
        {
          slug: "scanners",
          name: "Scanners",
          emoji: "📠",
          variantPreset: {
            enableColors: false,
            optionLabel: "Scanner Type",
            optionValues: ["Flatbed", "Portable", "Document Scanner"],
          },
        },
        {
          slug: "projectors",
          name: "Projectors",
          emoji: "📽️",
          variantPreset: {
            enableColors: true,
            optionLabel: "Resolution",
            optionValues: ["720p", "1080p", "4K"],
          },
        },
      ],
    },
  ],

  stationery: [
    {
      slug: "writing-paper",
      name: "Writing & Paper",
      items: [
        {
          slug: "notebooks",
          name: "Notebooks",
          emoji: "📓",
          variantPreset: {
            enableColors: true,
            optionLabel: "Size",
            optionValues: ["A4", "A5", "B5"],
          },
        },
        {
          slug: "pens",
          name: "Pens",
          emoji: "🖊️",
          variantPreset: {
            enableColors: true,
            optionLabel: "Ink / Pack",
            optionValues: ["Black", "Blue", "Red", "10 Pack", "20 Pack"],
          },
        },
        {
          slug: "markers",
          name: "Markers",
          emoji: "🖍️",
          variantPreset: {
            enableColors: true,
            optionLabel: "Pack Size",
            optionValues: ["4 Pack", "8 Pack", "12 Pack"],
          },
        },
      ],
    },
  ],

  office_supplies: [
    {
      slug: "general-office-supplies",
      name: "General Office Supplies",
      items: [
        {
          slug: "printer-paper",
          name: "Printer Paper",
          emoji: "📄",
          variantPreset: {
            enableColors: false,
            optionLabel: "Pack Size",
            optionValues: ["250 Sheets", "500 Sheets", "1000 Sheets"],
          },
        },
        {
          slug: "files-folders",
          name: "Files & Folders",
          emoji: "📁",
          variantPreset: {
            enableColors: true,
            optionLabel: "Pack Size",
            optionValues: ["5 Pack", "10 Pack", "20 Pack"],
          },
        },
        {
          slug: "desk-organizers",
          name: "Desk Organizers",
          emoji: "🗂️",
          variantPreset: {
            enableColors: true,
            optionLabel: "Compartments",
            optionValues: ["3 Slot", "5 Slot", "8 Slot"],
          },
        },
      ],
    },
  ],

  breakroom: [
    {
      slug: "breakroom-essentials",
      name: "Breakroom Essentials",
      items: [
        {
          slug: "coffee-tea",
          name: "Coffee & Tea",
          emoji: "☕",
          variantPreset: {
            enableColors: false,
            optionLabel: "Pack Size",
            optionValues: ["12 Pack", "24 Pack", "48 Pack"],
          },
        },
        {
          slug: "cups-plates",
          name: "Cups & Plates",
          emoji: "🥤",
          variantPreset: {
            enableColors: true,
            optionLabel: "Pack Size",
            optionValues: ["25 Pack", "50 Pack", "100 Pack"],
          },
        },
        {
          slug: "snacks",
          name: "Snacks",
          emoji: "🍪",
          variantPreset: {
            enableColors: false,
            optionLabel: "Pack Size",
            optionValues: ["6 Pack", "12 Pack", "24 Pack"],
          },
        },
      ],
    },
  ],

  bags: [
    {
      slug: "bags-luggage",
      name: "Bags & Luggage",
      items: [
        {
          slug: "backpacks",
          name: "Backpacks",
          emoji: "🎒",
          variantPreset: {
            enableColors: true,
            optionLabel: "Bag Size",
            optionValues: ["Small", "Medium", "Large", "15-inch", "17-inch"],
          },
        },
        {
          slug: "handbags",
          name: "Handbags",
          emoji: "👜",
          variantPreset: {
            enableColors: true,
            optionLabel: "Bag Size",
            optionValues: ["Mini", "Small", "Medium", "Large"],
          },
        },
        {
          slug: "travel-bags",
          name: "Travel Bags",
          emoji: "🧳",
          variantPreset: {
            enableColors: true,
            optionLabel: "Bag Size",
            optionValues: ["Carry-On", "Medium", "Large"],
          },
        },
      ],
    },
  ],
};

// ─── Main Component ───────────────────────────────────────────────────────────

export default function NewProductPage() {
  const router = useRouter();
  const categoryRef = useRef<HTMLDivElement>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<Section>("details");
  const [isDirty, setIsDirty] = useState(false);

  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);

  const isApprovedSeller = useMemo(
    () => (role ?? "").toLowerCase() === "seller",
    [role]
  );

  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("🛍️");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState<string | "">("");
  const [branchSlug, setBranchSlug] = useState("");
  const [productTypeSlug, setProductTypeSlug] = useState("");
  const [sellerPrice, setSellerPrice] = useState("");
  const [stockQuantity, setStockQuantity] = useState<string>("");

  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false);

  const [imageUrl, setImageUrl] = useState("");
  const [imageUploading, setImageUploading] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);

  const [extraImageUrls, setExtraImageUrls] = useState<string[]>([]);
  const [extraImageUploading, setExtraImageUploading] = useState(false);
  const [extraImageError, setExtraImageError] = useState<string | null>(null);

  const [hasColors, setHasColors] = useState(false);
  const [hasSizes, setHasSizes] = useState(false);
  const [colorVariants, setColorVariants] = useState<ColorVariant[]>([]);
  const [sizeVariants, setSizeVariants] = useState<SizeVariant[]>([]);
  const [expandedColorIds, setExpandedColorIds] = useState<Set<string>>(
    new Set()
  );

  const [colorImageUploading, setColorImageUploading] = useState<
    Record<string, boolean>
  >({});
  const [colorExtraUploading, setColorExtraUploading] = useState<
    Record<string, boolean>
  >({});

  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);

  const dragIndex = useRef<number | null>(null);

  const selectedCategory =
    categories.find((c) => c.id === categoryId) ?? null;
  const selectedCategoryName = selectedCategory?.name ?? "";
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

  const completionTotal = 8;
  const completionFields = [
    name,
    categoryId,
    availableBranches.length > 0 ? branchSlug : "ok",
    availableProductTypes.length > 0 ? productTypeSlug : "ok",
    sellerPrice,
    imageUrl,
    !hasColors || colorVariants.length > 0 ? "ok" : "",
    !hasSizes || sizeVariants.length > 0 ? "ok" : "",
  ].filter(Boolean).length;

  const anyUploading =
    imageUploading ||
    extraImageUploading ||
    Object.values(colorImageUploading).some(Boolean) ||
    Object.values(colorExtraUploading).some(Boolean);

  const sectionConfig: Record<
    Section,
    { icon: any; label: string; color: string }
  > = {
    details: {
      icon: FileText,
      label: "Details",
      color: "from-lime-400 to-emerald-400",
    },
    pricing: {
      icon: Tag,
      label: "Pricing",
      color: "from-cyan-400 to-blue-500",
    },
    images: {
      icon: ImagePlus,
      label: "Images",
      color: "from-purple-400 to-pink-500",
    },
    variants: {
      icon: Layers,
      label: "Variants",
      color: "from-orange-400 to-rose-500",
    },
  };

  // ── Outside click for dropdown ─────────────────────────────────────────────
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        categoryRef.current &&
        !categoryRef.current.contains(event.target as Node)
      ) {
        setShowCategoryDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // ── Warn on page unload if dirty ───────────────────────────────────────────
  useEffect(() => {
    function handleBeforeUnload(e: BeforeUnloadEvent) {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty]);

  // ── Keep branch/type valid when category changes ───────────────────────────
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

  // ── Auto-apply type presets without destroying user data ───────────────────
  useEffect(() => {
    if (!selectedProductType) return;

    const preset = selectedProductType.variantPreset;
    const shouldHaveColors = !!preset.enableColors;
    const nextOptionValues = preset.optionValues ?? [];

    setHasColors(shouldHaveColors);

    if (!shouldHaveColors && colorVariants.length > 0) {
      setColorVariants([]);
      setExpandedColorIds(new Set());
    }

    if (nextOptionValues.length > 0) {
      setHasSizes(true);
      setSizeVariants((prev) => buildMergedOptionVariants(prev, nextOptionValues));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally only re-runs when product type changes, not when colorVariants changes (would cause infinite loop)
  }, [selectedProductType]);

  // ── Initial load ───────────────────────────────────────────────────────────
  useEffect(() => {
    let alive = true;

    async function init() {
      try {
        setLoading(true);

        const { data, error } = await supabase.auth.getUser();
        if (error || !data?.user) {
          setPageError("You must be signed in to create a product.");
          return;
        }
        if (!alive) return;

        setUserId(data.user.id);

        const [{ data: prof }, { data: catRows }] = await Promise.all([
          supabase
            .from("profiles")
            .select("id,role")
            .eq("id", data.user.id)
            .maybeSingle(),
          supabase
            .from("categories")
            .select("id, name, slug")
            .order("sort_order")
            .order("name"),
        ]);

        if (!alive) return;
        setRole(prof?.role ?? null);
        setCategories((catRows || []) as CategoryRow[]);
      } catch {
        if (!alive) return;
        setPageError("Unexpected error while preparing the form.");
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    }

    init();
    return () => {
      alive = false;
    };
  }, []);

  // ── Main image handlers ────────────────────────────────────────────────────
  async function handleImageChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !userId) return;

    const fileErr = validateImageFile(file);
    if (fileErr) { setImageError(fileErr); e.target.value = ""; return; }

    setImageError(null);
    setImageUploading(true);

    try {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `seller-${userId}/${Date.now()}-${uid()}.${ext}`;
      const publicUrl = await uploadToProductImages(file, path);
      setImageUrl(publicUrl);
      setIsDirty(true);
    } catch (err: any) {
      setImageError("Upload failed: " + prettyError(err));
    } finally {
      setImageUploading(false);
      e.target.value = "";
    }
  }

  async function handleExtraImagesChange(e: ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || !userId) return;

    const skippedNames: string[] = [];
    const validFiles: File[] = [];
    for (const file of Array.from(files)) {
      const fileErr = validateImageFile(file);
      if (fileErr) { skippedNames.push(file.name); } else { validFiles.push(file); }
    }
    if (skippedNames.length > 0 && validFiles.length === 0) {
      setExtraImageError(`Rejected: ${skippedNames.join(", ")}. Use PNG/JPG/WebP under 5MB.`);
      e.target.value = "";
      return;
    }

    setExtraImageError(null);
    setExtraImageUploading(true);

    const newUrls: string[] = [];

    for (const file of validFiles) {
      try {
        const ext = file.name.split(".").pop() || "jpg";
        const path = `seller-${userId}/extra-${Date.now()}-${uid()}.${ext}`;
        const publicUrl = await uploadToProductImages(file, path);
        newUrls.push(publicUrl);
      } catch {
        // continue uploading others
      }
    }

    if (newUrls.length > 0) {
      setExtraImageUrls((prev) => [...prev, ...newUrls]);
      setIsDirty(true);
    } else {
      setExtraImageError("Gallery upload failed. Please try again.");
    }

    setExtraImageUploading(false);
    e.target.value = "";
  }

  function removeExtraImage(url: string) {
    setExtraImageUrls((prev) => prev.filter((u) => u !== url));
    setIsDirty(true);
  }

  function handleGalleryDragStart(index: number) {
    dragIndex.current = index;
    setDraggingIndex(index);
  }

  function handleGalleryDrop(dropIndex: number) {
    if (dragIndex.current === null || dragIndex.current === dropIndex) {
      dragIndex.current = null;
      setDragOverIndex(null);
      setDraggingIndex(null);
      return;
    }

    setExtraImageUrls((prev) => {
      const next = [...prev];
      const [moved] = next.splice(dragIndex.current!, 1);
      next.splice(dropIndex, 0, moved);
      return next;
    });

    dragIndex.current = null;
    setDragOverIndex(null);
    setDraggingIndex(null);
    setIsDirty(true);
  }

  // ── Color variant handlers ─────────────────────────────────────────────────
  function toggleColorExpanded(id: string) {
    setExpandedColorIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function addColorVariant(preset?: { name: string; hex: string }) {
    const newId = uid();
    setColorVariants((prev) => [
      ...prev,
      {
        id: newId,
        name: preset?.name ?? "",
        hex: preset?.hex ?? "#6b7280",
        imageUrl: "",
        extraImageUrls: [],
      },
    ]);
    setExpandedColorIds((prev) => new Set([...prev, newId]));
    setIsDirty(true);
  }

  function updateColorVariant(id: string, patch: Partial<ColorVariant>) {
    setColorVariants((prev) =>
      prev.map((c) => (c.id === id ? { ...c, ...patch } : c))
    );
    setIsDirty(true);
  }

  function removeColorVariant(id: string) {
    setColorVariants((prev) => prev.filter((c) => c.id !== id));
    setExpandedColorIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    setIsDirty(true);
  }

  async function handleColorMainImageChange(
    colorId: string,
    e: ChangeEvent<HTMLInputElement>
  ) {
    const file = e.target.files?.[0];
    if (!file || !userId) return;

    const fileErr = validateImageFile(file);
    if (fileErr) {
      setPageError(fileErr);
      e.target.value = "";
      return;
    }

    setColorImageUploading((p) => ({ ...p, [colorId]: true }));
    try {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `seller-${userId}/color-${colorId}-${Date.now()}.${ext}`;
      const publicUrl = await uploadToProductImages(file, path);
      updateColorVariant(colorId, { imageUrl: publicUrl });
    } catch (err: any) {
      const colorName =
        colorVariants.find((c) => c.id === colorId)?.name || "color";
      setPageError(
        `Failed to upload main image for ${colorName}: ${prettyError(err)}`
      );
    } finally {
      setColorImageUploading((p) => ({ ...p, [colorId]: false }));
      e.target.value = "";
    }
  }

  async function handleColorExtraImagesChange(
    colorId: string,
    e: ChangeEvent<HTMLInputElement>
  ) {
    const files = e.target.files;
    if (!files || !userId) return;

    const validFiles: File[] = [];
    for (const file of Array.from(files)) {
      if (!validateImageFile(file)) validFiles.push(file);
    }
    if (validFiles.length === 0) {
      setPageError("No valid images selected. Use PNG/JPG/WebP under 5MB.");
      e.target.value = "";
      return;
    }

    setColorExtraUploading((p) => ({ ...p, [colorId]: true }));
    const newUrls: string[] = [];

    for (const file of validFiles) {
      try {
        const ext = file.name.split(".").pop() || "jpg";
        const path = `seller-${userId}/color-${colorId}-extra-${Date.now()}-${uid()}.${ext}`;
        const publicUrl = await uploadToProductImages(file, path);
        newUrls.push(publicUrl);
      } catch {
        // continue
      }
    }

    if (newUrls.length > 0) {
      setColorVariants((prev) =>
        prev.map((c) =>
          c.id === colorId
            ? { ...c, extraImageUrls: [...c.extraImageUrls, ...newUrls] }
            : c
        )
      );
      setIsDirty(true);
    } else {
      const colorName =
        colorVariants.find((c) => c.id === colorId)?.name || "color";
      setPageError(
        `Failed to upload gallery images for ${colorName}. Please try again.`
      );
    }

    setColorExtraUploading((p) => ({ ...p, [colorId]: false }));
    e.target.value = "";
  }

  function removeColorExtraImage(colorId: string, url: string) {
    setColorVariants((prev) =>
      prev.map((c) =>
        c.id === colorId
          ? { ...c, extraImageUrls: c.extraImageUrls.filter((u) => u !== url) }
          : c
      )
    );
    setIsDirty(true);
  }

  // ── Option variant handlers ────────────────────────────────────────────────
  function addSizeVariant(label = "") {
    if (label && sizeVariants.some((s) => s.label === label)) return;

    setSizeVariants((prev) => [
      ...prev,
      { id: uid(), label, stock: 0, priceAdjustCents: 0 },
    ]);
    setIsDirty(true);
  }

  function updateSizeVariant(id: string, patch: Partial<SizeVariant>) {
    setSizeVariants((prev) =>
      prev.map((s) => (s.id === id ? { ...s, ...patch } : s))
    );
    setIsDirty(true);
  }

  function removeSizeVariant(id: string) {
    setSizeVariants((prev) => prev.filter((s) => s.id !== id));
    setIsDirty(true);
  }

  function handleToggleSizes() {
    if (hasSizes) {
      const total = sizeVariants.reduce((s, v) => s + (v.stock || 0), 0);
      setStockQuantity(String(total));
      setSizeVariants([]);
    }
    setHasSizes((v) => !v);
    setIsDirty(true);
  }

  // ── Navigation guard ───────────────────────────────────────────────────────
  function safeNavigate(path: string) {
    if (isDirty) {
      const ok = window.confirm(
        "You have unsaved changes. Leave without saving?"
      );
      if (!ok) return;
    }
    router.push(path);
  }

  // ── Validation ─────────────────────────────────────────────────────────────
  function validateForm(): string | null {
    if (!userId) return "You must be signed in.";
    if (!isApprovedSeller) return "Account not approved.";
    if (!name.trim()) return "Enter product name.";
    if (!description.trim()) return "Enter a product description for admin review.";
    if (!categoryId) return "Select category.";

    if (availableBranches.length > 0 && !branchSlug) {
      return "Select a branch.";
    }

    if (availableProductTypes.length > 0 && !productTypeSlug) {
      return "Select a product type.";
    }

    const cents = dollarsToCents(sellerPrice);
    if (cents <= 0) return "Enter a valid price.";
    if (!imageUrl) return "Upload main image.";

    if (!hasSizes && (!stockQuantity || Number(stockQuantity) < 0)) {
      return "Enter a valid stock quantity.";
    }
    if (!hasSizes && Number(stockQuantity) > 100000) {
      return "Stock quantity seems too high (max 100,000).";
    }

    if (hasColors) {
      if (colorVariants.length === 0) {
        return "Add at least one color variant or disable color variants.";
      }
      const emptyColor = colorVariants.find((c) => !c.name.trim());
      if (emptyColor) return "All color variants need a name.";
      
      // NEW: Check for missing main images on colors
      const missingImage = colorVariants.find((c) => !c.imageUrl);
      if (missingImage) {
        return `Color "${missingImage.name || 'unnamed'}" is missing a main image. Upload an image or remove this color.`;
      }
    }

    if (hasSizes) {
      if (sizeVariants.length === 0) {
        return "Add at least one option variant or disable option variants.";
      }
      const emptyOption = sizeVariants.find((s) => !s.label.trim());
      if (emptyOption) return "All option variants need a label.";
    }

    return null;
  }

  // ── Submit ─────────────────────────────────────────────────────────────────
  async function handleCreateDraft(e: FormEvent) {
    e.preventDefault();
    setPageError(null);

    const validationError = validateForm();
    if (validationError) {
      setPageError(validationError);
      return;
    }

    const cents = dollarsToCents(sellerPrice);
    const computedStock = hasSizes
      ? sizeVariants.reduce((sum, s) => sum + (s.stock || 0), 0)
      : Math.max(0, Number(stockQuantity) || 0);

    try {
      setSaving(true);

      const { error } = await supabase.from("products").insert({
        seller_id: userId,
        category_id: categoryId,
        branch_slug: branchSlug || null,
        product_type_slug: productTypeSlug || null,
        name: name.trim(),
        slug: makeSlug(name),
        description: description.trim() || null,
        emoji: emoji.trim() || "🛍️",
        status: "draft" as ProductStatus,
        seller_price_cents: cents,
        price_cents: cents,
        final_price_cents: cents,
        image_url: imageUrl,
        extra_image_urls: extraImageUrls.length > 0 ? extraImageUrls : null,
        stock_quantity: computedStock,
        is_active: true,
        color_variants:
          hasColors && colorVariants.length > 0 ? colorVariants : null,
        size_variants:
          hasSizes && sizeVariants.length > 0 ? sizeVariants : null,
      });

      if (error) throw error;

      setIsDirty(false);
      router.push("/seller?success=product_created");
    } catch (err: any) {
      setPageError(prettyError(err));
      setSaving(false);
    }
  }

  // ── Loading ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <main className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-r from-lime-400 to-emerald-400 flex items-center justify-center animate-pulse">
            <Sparkles className="w-6 h-6 text-slate-900" />
          </div>
          <span className="text-sm font-medium text-slate-400">Loading...</span>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 px-3 py-4 sm:px-4 sm:py-6 md:px-8">
      <div className="mx-auto max-w-6xl">
        {/* Header */}
        <div className="flex flex-wrap items-center gap-3 mb-6 sm:mb-8">
          <button
            type="button"
            onClick={() => safeNavigate("/seller")}
            className="group flex items-center gap-2 px-3 py-2 sm:px-4 text-sm font-medium text-slate-400 hover:text-lime-400 transition-all"
          >
            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
            Back
          </button>
          <div className="hidden sm:block h-4 w-px bg-slate-700" />
          <h1 className="text-xl sm:text-2xl md:text-3xl font-bold bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent">
            Create Product
          </h1>
          {isDirty && (
            <span className="text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2.5 py-1 rounded-full">
              Unsaved changes
            </span>
          )}
        </div>

        {/* Status Banner */}
        <div
          className={classNames(
            "mb-6 sm:mb-8 rounded-2xl border px-4 sm:px-5 py-4 flex items-center gap-4 backdrop-blur-xl",
            isApprovedSeller
              ? "bg-emerald-500/10 border-emerald-500/30"
              : "bg-amber-500/10 border-amber-500/30"
          )}
        >
          <div
            className={classNames(
              "w-10 h-10 rounded-xl flex items-center justify-center shrink-0",
              isApprovedSeller ? "bg-emerald-500/20" : "bg-amber-500/20"
            )}
          >
            {isApprovedSeller ? (
              <Shield className="w-5 h-5 text-emerald-400" />
            ) : (
              <AlertCircle className="w-5 h-5 text-amber-400" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <span
              className={classNames(
                "text-sm font-semibold",
                isApprovedSeller ? "text-emerald-300" : "text-amber-300"
              )}
            >
              {isApprovedSeller ? "Verified Seller" : "Pending Verification"}
            </span>
            <p className="text-xs text-slate-400 mt-0.5">
              {isApprovedSeller
                ? "Create products for admin review"
                : "Complete verification to publish products"}
            </p>
          </div>
          {!isApprovedSeller && (
            <button
              onClick={() => router.push("/seller/verification")}
              className="px-4 py-2 bg-gradient-to-r from-amber-500 to-orange-500 text-slate-900 text-xs font-bold rounded-lg"
            >
              Verify
            </button>
          )}
        </div>

        {/* Error */}
        {pageError && (
          <div className="mb-6 rounded-2xl border border-red-500/30 bg-red-500/10 backdrop-blur-xl px-4 sm:px-5 py-4 flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
            <span className="text-sm text-red-300">{pageError}</span>
            <button
              type="button"
              onClick={() => setPageError(null)}
              className="ml-auto text-red-400 hover:text-red-300"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        <form onSubmit={handleCreateDraft}>
          <div className="rounded-3xl border border-slate-700/50 bg-slate-900/50 backdrop-blur-xl overflow-hidden shadow-2xl shadow-black/30">
            <div className="flex flex-col lg:flex-row">
              {/* Sidebar / mobile steps */}
              <div className="lg:w-64 border-b lg:border-b-0 lg:border-r border-slate-700/50 bg-slate-950/30 p-3 sm:p-4">
                <nav className="flex lg:flex-col gap-1 lg:gap-2 overflow-x-auto lg:overflow-visible scrollbar-hide">
                  {(Object.keys(sectionConfig) as Section[]).map((section) => {
                    const { icon: Icon, label, color } = sectionConfig[section];
                    const isActive = activeSection === section;
                    const badge =
                      section === "variants" && (hasColors || hasSizes)
                        ? colorVariants.length + sizeVariants.length
                        : null;

                    return (
                      <button
                        key={section}
                        type="button"
                        onClick={() => setActiveSection(section)}
                        className={classNames(
                          "flex items-center justify-center lg:justify-start gap-1.5 lg:gap-3 flex-1 lg:flex-none px-2 lg:px-4 py-2.5 lg:py-3 rounded-xl text-xs lg:text-sm font-medium transition-all whitespace-nowrap",
                          isActive
                            ? "bg-gradient-to-r text-slate-900 shadow-lg"
                            : "text-slate-400 hover:text-white hover:bg-slate-800/50",
                          isActive && color
                        )}
                      >
                        <Icon className="w-4 h-4 shrink-0" />
                        <span className="lg:flex-1 lg:text-left">{label}</span>
                        {badge !== null && badge > 0 && (
                          <span
                            className={classNames(
                              "text-xs font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center",
                              isActive
                                ? "bg-slate-900/30 text-slate-900"
                                : "bg-orange-500/20 text-orange-400"
                            )}
                          >
                            {badge}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </nav>

                <div className="mt-4 sm:mt-6 lg:mt-8 px-1 lg:px-4">
                  <div className="flex items-center justify-between text-xs font-medium text-slate-500 mb-2">
                    <span>Completion</span>
                    <span>
                      {completionFields}/{completionTotal}
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-lime-400 to-emerald-400 transition-all duration-500"
                      style={{
                        width: `${(completionFields / completionTotal) * 100}%`,
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* Content */}
              <div className="flex-1 p-4 sm:p-6 lg:p-8">
                {/* DETAILS */}
                {activeSection === "details" && (
                  <div className="space-y-6 animate-in fade-in duration-300">
                    <div>
                      <h2 className="text-lg font-bold text-white mb-1">
                        Product Details
                      </h2>
                      <p className="text-sm text-slate-400">
                        Basic information about your product
                      </p>
                    </div>

                    <div className="grid gap-6 md:grid-cols-12">
                      <div className="md:col-span-8">
                        <label className="block text-sm font-medium text-slate-300 mb-2">
                          Product Name <span className="text-lime-400">*</span>
                        </label>
                        <input
                          className={INPUT}
                          placeholder="Premium Wireless Headphones"
                          value={name}
                          onChange={(e) => { setName(e.target.value.slice(0, 120)); setIsDirty(true); }}
                          disabled={!isApprovedSeller || saving}
                        />
                        <div className="flex items-center gap-2 mt-2">
                          <span className="text-xs text-slate-500">
                            Slug preview:
                          </span>
                          <code className="text-xs bg-slate-800 px-2 py-1 rounded text-slate-400 break-all">
                            {slugify(name) || "product-name"}-xxxxx
                          </code>
                        </div>
                      </div>

                      <div className="md:col-span-4">
                        <label className="block text-sm font-medium text-slate-300 mb-2">
                          Emoji
                        </label>
                        <div className="flex gap-3">
                          <input
                            className="w-20 rounded-xl border border-slate-700 bg-slate-800/50 px-4 py-3 text-center text-2xl outline-none focus:border-lime-400"
                            value={emoji}
                            onChange={(e) => { setEmoji(e.target.value.slice(0, 4)); setIsDirty(true); }}
                            maxLength={4}
                            disabled={!isApprovedSeller || saving}
                          />
                          <div className="flex-1 rounded-xl border border-slate-700 bg-slate-800/30 flex items-center justify-center text-3xl">
                            {emoji || "🛍️"}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div ref={categoryRef} className="relative">
                      <label className="block text-sm font-medium text-slate-300 mb-2">
                        Category <span className="text-lime-400">*</span>
                      </label>
                      <button
                        type="button"
                        onClick={() =>
                          isApprovedSeller &&
                          !saving &&
                          setShowCategoryDropdown((v) => !v)
                        }
                        disabled={!isApprovedSeller || saving}
                        className={classNames(
                          "w-full rounded-xl border px-4 py-3 text-left text-sm flex items-center justify-between transition-all",
                          showCategoryDropdown
                            ? "border-lime-400 bg-slate-800 ring-2 ring-lime-400/20"
                            : "border-slate-700 bg-slate-800/50 hover:border-slate-500",
                          (!isApprovedSeller || saving) &&
                            "opacity-50 cursor-not-allowed"
                        )}
                      >
                        <span
                          className={
                            selectedCategoryName ? "text-white" : "text-slate-500"
                          }
                        >
                          {selectedCategoryName || "Select a category..."}
                        </span>
                        <ChevronDown
                          className={classNames(
                            "w-4 h-4 text-slate-400 transition-transform duration-200",
                            showCategoryDropdown && "rotate-180"
                          )}
                        />
                      </button>

                      {showCategoryDropdown && (
                        <div className="absolute z-50 w-full mt-2 rounded-xl border border-slate-700 bg-slate-900 shadow-2xl overflow-hidden">
                          <div className="max-h-64 overflow-y-auto">
                            {categories.length === 0 ? (
                              <div className="px-4 py-6 text-center text-sm text-slate-500">
                                No categories found
                              </div>
                            ) : (
                              categories.map((c) => (
                                <button
                                  key={c.id}
                                  type="button"
                                  onClick={() => {
                                    setCategoryId(c.id);
                                    setBranchSlug("");
                                    setProductTypeSlug("");
                                    setShowCategoryDropdown(false);
                                    setIsDirty(true);
                                  }}
                                  className={classNames(
                                    "w-full px-4 py-3 text-sm text-left transition-colors flex items-center justify-between",
                                    categoryId === c.id
                                      ? "bg-lime-500/20 text-lime-300"
                                      : "text-slate-300 hover:bg-slate-800"
                                  )}
                                >
                                  <span>{c.name}</span>
                                  {categoryId === c.id && (
                                    <CheckCircle2 className="w-4 h-4 text-lime-400" />
                                  )}
                                </button>
                              ))
                            )}
                          </div>
                        </div>
                      )}
                    </div>

                    {categoryId && availableBranches.length > 0 && (
                      <div className="grid gap-5 md:grid-cols-2">
                        <div>
                          <label className="block text-sm font-medium text-slate-300 mb-2">
                            Branch <span className="text-lime-400">*</span>
                          </label>
                          <select
                            className={INPUT}
                            value={branchSlug}
                            onChange={(e) => {
                              setBranchSlug(e.target.value);
                              setProductTypeSlug("");
                              setIsDirty(true);
                            }}
                            disabled={!isApprovedSeller || saving}
                          >
                            <option value="">Select branch...</option>
                            {availableBranches.map((branch) => (
                              <option key={branch.slug} value={branch.slug}>
                                {branch.name}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-slate-300 mb-2">
                            Product Type <span className="text-lime-400">*</span>
                          </label>
                          <select
                            className={INPUT}
                            value={productTypeSlug}
                            onChange={(e) => {
                              const nextSlug = e.target.value;
                              const nextType =
                                availableProductTypes.find(
                                  (item) => item.slug === nextSlug
                                ) ?? null;
                              setProductTypeSlug(nextSlug);
                              if (nextType?.emoji) setEmoji(nextType.emoji);
                              setIsDirty(true);
                            }}
                            disabled={!isApprovedSeller || saving || !branchSlug}
                          >
                            <option value="">Select product type...</option>
                            {availableProductTypes.map((item) => (
                              <option key={item.slug} value={item.slug}>
                                {item.name}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    )}

                    {categoryId && availableBranches.length === 0 && (
                      <div className="rounded-xl border border-slate-700 bg-slate-800/20 px-4 py-3 text-sm text-slate-400 flex items-center gap-2">
                        <Info className="w-4 h-4 text-slate-500 shrink-0" />
                        No branch catalog is configured for this category yet. You
                        can still use the generic variant system below.
                      </div>
                    )}

                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-2">
                        Description
                      </label>
                      <textarea
                        className="w-full rounded-xl border border-slate-700 bg-slate-800/50 px-4 py-3 text-white placeholder:text-slate-500 focus:border-lime-400 focus:ring-2 focus:ring-lime-400/20 transition-all outline-none min-h-[120px] resize-y"
                        placeholder="Describe features, specifications, and benefits..."
                        value={description}
                        onChange={(e) => { setDescription(e.target.value.slice(0, 800)); setIsDirty(true); }}
                        disabled={!isApprovedSeller || saving}
                      />
                      <div className="flex justify-end mt-1">
                        <span className="text-xs text-slate-500">
                          {description.length}/800
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* PRICING */}
                {activeSection === "pricing" && (
                  <div className="space-y-6 animate-in fade-in duration-300">
                    <div>
                      <h2 className="text-lg font-bold text-white mb-1">
                        Pricing & Stock
                      </h2>
                      <p className="text-sm text-slate-400">
                        Set your price and availability
                      </p>
                    </div>

                    <div className="grid gap-6 md:grid-cols-2">
                      <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">
                          Price (ETB) <span className="text-lime-400">*</span>
                        </label>
                        <div className="relative">
                          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 font-bold text-sm">
                            ETB
                          </span>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            className="w-full rounded-xl border border-slate-700 bg-slate-800/50 pl-14 pr-4 py-3 text-white focus:border-lime-400 focus:ring-2 focus:ring-lime-400/20 outline-none transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            placeholder="0.00"
                            value={sellerPrice}
                            onChange={(e) => { setSellerPrice(e.target.value.slice(0, 16)); setIsDirty(true); }}
                            disabled={!isApprovedSeller || saving}
                          />
                        </div>
                        <p className="text-xs text-slate-500 mt-2">
                          Admin will review and set the final price.
                        </p>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">
                          Stock Quantity <span className="text-lime-400">*</span>
                        </label>
                        {hasSizes ? (
                          <div className="rounded-xl border border-slate-700 bg-slate-800/30 px-4 py-3 text-sm text-slate-400 flex items-center gap-2">
                            <Info className="w-4 h-4 text-slate-500 shrink-0" />
                            Calculated from variant rows
                            <span className="ml-auto text-white font-semibold">
                              {sizeVariants.reduce((s, v) => s + (v.stock || 0), 0)}{" "}
                              units
                            </span>
                          </div>
                        ) : (
                          <>
                            <input
                              type="number"
                              min="0"
                              max="100000"
                              className={INPUT}
                              placeholder="0"
                              value={stockQuantity}
                              onChange={(e) => { setStockQuantity(e.target.value); setIsDirty(true); }}
                              disabled={!isApprovedSeller || saving}
                            />
                            {stockQuantity !== "" && Number(stockQuantity) === 0 && (
                              <p className="text-xs text-amber-400 mt-2 flex items-center gap-1.5">
                                <AlertCircle className="w-3.5 h-3.5" />
                                Product will show as out of stock immediately.
                              </p>
                            )}
                          </>
                        )}
                        <p className="text-xs text-slate-500 mt-2">
                          How many units are available.
                        </p>
                      </div>
                    </div>

                    {sellerPrice && dollarsToCents(sellerPrice) > 0 && (
                      <div className="rounded-xl border border-slate-700 bg-slate-800/30 px-5 py-4 flex items-center justify-between">
                        <span className="text-sm text-slate-400">
                          Your submitted price
                        </span>
                        <span className="text-lg font-bold text-white">
                          ETB {centsToEtbString(dollarsToCents(sellerPrice))}
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {/* IMAGES */}
                {activeSection === "images" && (
                  <div className="space-y-6 animate-in fade-in duration-300">
                    <div>
                      <h2 className="text-lg font-bold text-white mb-1">
                        Product Images
                      </h2>
                      <p className="text-sm text-slate-400">
                        Upload high-quality photos
                      </p>
                    </div>

                    {hasColors && colorVariants.length > 0 && (
                      <div className="rounded-xl border border-orange-500/30 bg-orange-500/10 px-4 py-3 flex items-center gap-3 text-sm">
                        <Info className="w-4 h-4 text-orange-400 shrink-0" />
                        <span className="text-orange-300">
                          Per-color images are managed in the <strong>Variants</strong>{" "}
                          tab. These images serve as the default fallback.
                        </span>
                      </div>
                    )}

                    <div className="grid gap-6 md:grid-cols-2">
                      <div>
                        <label className="block text-sm font-medium text-slate-300 mb-3">
                          Main Image <span className="text-lime-400">*</span>
                        </label>
                        <label
                          className={classNames(
                            "group relative flex flex-col items-center justify-center w-full h-56 rounded-2xl border-2 border-dashed cursor-pointer transition-all overflow-hidden",
                            isApprovedSeller && !imageUploading
                              ? "border-slate-600 hover:border-lime-400/50 bg-slate-800/30"
                              : "border-slate-700 bg-slate-800/20 cursor-not-allowed"
                          )}
                        >
                          {imageUrl ? (
                            <>
                              <img
                                src={imageUrl}
                                alt="Product"
                                className="w-full h-full object-cover"
                              />
                              <div className="absolute inset-0 bg-slate-950/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-sm">
                                <span className="text-white text-sm font-medium flex items-center gap-2">
                                  <Camera className="w-4 h-4" />
                                  Change
                                </span>
                              </div>
                            </>
                          ) : (
                            <div className="flex flex-col items-center gap-3 text-slate-500">
                              {imageUploading ? (
                                <div className="w-8 h-8 border-2 border-lime-400 border-t-transparent rounded-full animate-spin" />
                              ) : (
                                <div className="w-14 h-14 rounded-2xl bg-slate-800 flex items-center justify-center">
                                  <Plus className="w-7 h-7" />
                                </div>
                              )}
                              <span className="text-sm font-medium">
                                {imageUploading ? "Uploading..." : "Upload Image"}
                              </span>
                              <span className="text-xs text-slate-600">
                                PNG, JPG up to 5MB
                              </span>
                            </div>
                          )}
                          <input
                            type="file"
                            accept="image/*"
                            onChange={handleImageChange}
                            className="hidden"
                            disabled={!isApprovedSeller || imageUploading}
                          />
                        </label>
                        {imageError && (
                          <p className="mt-2 text-sm text-red-400">{imageError}</p>
                        )}
                        {imageUrl && (
                          <button
                            type="button"
                            onClick={() => {
                              setImageUrl("");
                              setIsDirty(true);
                            }}
                            className="mt-2 text-xs text-red-400 hover:text-red-300 flex items-center gap-1"
                          >
                            <X className="w-3 h-3" />
                            Remove
                          </button>
                        )}
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-slate-300 mb-3">
                          Gallery{" "}
                          <span className="text-slate-500">
                            (optional · drag to reorder)
                          </span>
                        </label>
                        <label
                          className={classNames(
                            "flex items-center justify-center gap-2 w-full px-4 py-4 rounded-2xl border-2 border-dashed cursor-pointer transition-all mb-4",
                            isApprovedSeller && !extraImageUploading
                              ? "border-slate-600 hover:border-cyan-400/50 bg-slate-800/30 text-slate-400 hover:text-cyan-400"
                              : "border-slate-700 bg-slate-800/20 cursor-not-allowed"
                          )}
                        >
                          {extraImageUploading ? (
                            <div className="w-5 h-5 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
                          ) : (
                            <Upload className="w-5 h-5" />
                          )}
                          <span className="text-sm font-medium">
                            {extraImageUploading ? "Uploading..." : "Add Photos"}
                          </span>
                          <input
                            type="file"
                            accept="image/*"
                            multiple
                            onChange={handleExtraImagesChange}
                            className="hidden"
                            disabled={!isApprovedSeller || extraImageUploading}
                          />
                        </label>

                        {extraImageUrls.length > 0 && (
                          <div className="grid grid-cols-3 gap-3">
                            {extraImageUrls.map((url, idx) => (
                              <div
                                key={url}
                                draggable
                                onDragStart={() => handleGalleryDragStart(idx)}
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
                                onDrop={() => handleGalleryDrop(idx)}
                                className={classNames(
                                  "relative aspect-square rounded-xl border overflow-hidden group bg-slate-800/50 cursor-grab active:cursor-grabbing transition-all",
                                  dragOverIndex === idx
                                    ? "border-cyan-400 ring-2 ring-cyan-400/30 scale-[1.03]"
                                    : "border-slate-700",
                                  draggingIndex === idx && "opacity-60"
                                )}
                              >
                                <img
                                  src={url}
                                  alt=""
                                  className="w-full h-full object-cover"
                                />
                                <div className="absolute top-1 left-1 opacity-0 group-hover:opacity-100 transition-all">
                                  <div className="w-6 h-6 rounded-md bg-slate-950/70 flex items-center justify-center">
                                    <GripVertical className="w-3 h-3 text-slate-300" />
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => removeExtraImage(url)}
                                  className="absolute top-1 right-1 w-6 h-6 rounded-lg bg-slate-950/80 text-white opacity-0 group-hover:opacity-100 transition-all hover:bg-red-500 flex items-center justify-center"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                                <div className="absolute bottom-1 left-1 text-xs bg-slate-950/70 text-slate-400 px-1.5 py-0.5 rounded-md opacity-0 group-hover:opacity-100 transition-all">
                                  {idx + 1}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                        {extraImageError && (
                          <p className="mt-2 text-sm text-red-400">
                            {extraImageError}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* VARIANTS */}
                {activeSection === "variants" && (
                  <div className="space-y-8 animate-in fade-in duration-300">
                    <div>
                      <h2 className="text-lg font-bold text-white mb-1">
                        Product Variants
                      </h2>
                      <p className="text-sm text-slate-400">
                        Enable color and option variants — each can have its own
                        images and stock
                      </p>
                    </div>

                    {/* Color Variants */}
                    <div className="rounded-2xl border border-slate-700/60 bg-slate-800/20 overflow-hidden">
                      <div className="px-4 sm:px-5 py-4 flex items-center justify-between border-b border-slate-700/40">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-orange-400/20 to-rose-500/20 flex items-center justify-center">
                            <Palette className="w-4 h-4 text-orange-400" />
                          </div>
                          <div>
                            <div className="text-sm font-semibold text-white">
                              Color Variants
                            </div>
                            <div className="text-xs text-slate-500">
                              Different colors with own images
                            </div>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            const next = !hasColors;
                            setHasColors(next);
                            if (!next) {
                              setColorVariants([]);
                              setExpandedColorIds(new Set());
                            }
                            setIsDirty(true);
                          }}
                          disabled={!isApprovedSeller || saving}
                          className={classNames(
                            "relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none",
                            hasColors ? "bg-orange-500" : "bg-slate-700"
                          )}
                        >
                          <span
                            className={classNames(
                              "inline-block h-4 w-4 transform rounded-full bg-white shadow-md transition-transform",
                              hasColors ? "translate-x-6" : "translate-x-1"
                            )}
                          />
                        </button>
                      </div>

                      {hasColors && (
                        <div className="p-4 sm:p-5 space-y-4">
                          <div>
                            <div className="text-xs text-slate-500 mb-3 font-medium">
                              Quick-add colors
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {COLOR_SWATCHES.map((sw) => {
                                const alreadyAdded = colorVariants.some(
                                  (c) => c.name.toLowerCase() === sw.name.toLowerCase()
                                );
                                return (
                                  <button
                                    key={sw.name}
                                    type="button"
                                    onClick={() => !alreadyAdded && addColorVariant(sw)}
                                    disabled={alreadyAdded || !isApprovedSeller}
                                    className={classNames(
                                      "flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all",
                                      alreadyAdded
                                        ? "border-slate-700 bg-slate-800/30 text-slate-600 cursor-not-allowed"
                                        : "border-slate-600 bg-slate-800/50 text-slate-300 hover:border-slate-400 hover:text-white"
                                    )}
                                  >
                                    <span
                                      className="w-3.5 h-3.5 rounded-full border border-white/20 shrink-0"
                                      style={{ backgroundColor: sw.hex }}
                                    />
                                    {sw.name}
                                    {alreadyAdded && (
                                      <CheckCircle2 className="w-3 h-3 text-orange-400" />
                                    )}
                                  </button>
                                );
                              })}
                              <button
                                type="button"
                                onClick={() => addColorVariant()}
                                disabled={!isApprovedSeller}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-dashed border-slate-600 text-xs text-slate-400 hover:text-white hover:border-slate-400 transition-all"
                              >
                                <Plus className="w-3 h-3" />
                                Custom
                              </button>
                            </div>
                          </div>

                          {colorVariants.length > 0 && (
                            <div className="space-y-4">
                              {colorVariants.map((cv) => (
                                <ColorVariantCard
                                  key={cv.id}
                                  variant={cv}
                                  expanded={expandedColorIds.has(cv.id)}
                                  onToggleExpand={() => toggleColorExpanded(cv.id)}
                                  disabled={!isApprovedSeller || saving}
                                  mainUploading={!!colorImageUploading[cv.id]}
                                  extraUploading={!!colorExtraUploading[cv.id]}
                                  onUpdate={(patch) => updateColorVariant(cv.id, patch)}
                                  onRemove={() => removeColorVariant(cv.id)}
                                  onMainImageChange={(e) =>
                                    handleColorMainImageChange(cv.id, e)
                                  }
                                  onExtraImagesChange={(e) =>
                                    handleColorExtraImagesChange(cv.id, e)
                                  }
                                  onRemoveExtraImage={(url) =>
                                    removeColorExtraImage(cv.id, url)
                                  }
                                />
                              ))}
                            </div>
                          )}

                          {colorVariants.length === 0 && (
                            <div className="rounded-xl border border-dashed border-slate-700 py-8 text-center">
                              <Palette className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                              <p className="text-sm text-slate-500">
                                No colors added yet. Use quick-add above or add a
                                custom color.
                              </p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Option Variants */}
                    <div className="rounded-2xl border border-slate-700/60 bg-slate-800/20 overflow-hidden">
                      <div className="px-4 sm:px-5 py-4 flex items-center justify-between border-b border-slate-700/40">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-400/20 to-blue-500/20 flex items-center justify-center">
                            <Ruler className="w-4 h-4 text-cyan-400" />
                          </div>
                          <div>
                            <div className="text-sm font-semibold text-white">
                              {selectedProductType
                                ? dynamicOptionLabel
                                : "Size Variants"}
                            </div>
                            <div className="text-xs text-slate-500">
                              Per-option stock and price adjustments
                            </div>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={handleToggleSizes}
                          disabled={!isApprovedSeller || saving}
                          className={classNames(
                            "relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none",
                            hasSizes ? "bg-cyan-500" : "bg-slate-700"
                          )}
                        >
                          <span
                            className={classNames(
                              "inline-block h-4 w-4 transform rounded-full bg-white shadow-md transition-transform",
                              hasSizes ? "translate-x-6" : "translate-x-1"
                            )}
                          />
                        </button>
                      </div>

                      {hasSizes && (
                        <div className="p-4 sm:p-5 space-y-4">
                          <div className="space-y-3">
                            <div className="text-xs text-slate-500 font-medium">
                              Quick-add options
                            </div>

                            {selectedProductType ? (
                              <div className="flex items-center gap-2 flex-wrap">
                                {dynamicOptionValues.map((label) => {
                                  const added = sizeVariants.some(
                                    (s) => s.label === label
                                  );
                                  return (
                                    <button
                                      key={label}
                                      type="button"
                                      onClick={() => !added && addSizeVariant(label)}
                                      disabled={added || !isApprovedSeller}
                                      className={classNames(
                                        "px-3 py-1 rounded-lg border text-xs font-medium transition-all",
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
                                {Object.entries(SIZE_PRESETS).map(
                                  ([groupKey, labels]) => (
                                    <div
                                      key={groupKey}
                                      className="flex items-center gap-2 flex-wrap"
                                    >
                                      <span className="text-xs text-slate-600 w-16 capitalize shrink-0">
                                        {groupKey}
                                      </span>
                                      {labels.map((label) => {
                                        const added = sizeVariants.some(
                                          (s) => s.label === label
                                        );
                                        return (
                                          <button
                                            key={label}
                                            type="button"
                                            onClick={() =>
                                              !added && addSizeVariant(label)
                                            }
                                            disabled={added || !isApprovedSeller}
                                            className={classNames(
                                              "px-3 py-1 rounded-lg border text-xs font-medium transition-all",
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
                                  )
                                )}
                              </div>
                            )}

                            <button
                              type="button"
                              onClick={() => addSizeVariant("")}
                              disabled={!isApprovedSeller}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-dashed border-slate-600 text-xs text-slate-400 hover:text-white hover:border-slate-400 transition-all"
                            >
                              <Plus className="w-3 h-3" />
                              Custom option
                            </button>
                          </div>

                          {/* Mobile cards */}
                          <div className="md:hidden space-y-3">
                            {sizeVariants.map((sv) => (
                              <div
                                key={sv.id}
                                className="rounded-xl border border-slate-700 bg-slate-900/50 p-3 space-y-3"
                              >
                                <div className="flex items-center justify-between">
                                  <div className="text-xs text-slate-500">
                                    Option row
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => removeSizeVariant(sv.id)}
                                    disabled={!isApprovedSeller || saving}
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
                                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-cyan-400 transition-colors"
                                    placeholder="e.g. M"
                                    value={sv.label}
                                    onChange={(e) =>
                                      updateSizeVariant(sv.id, {
                                        label: e.target.value.slice(0, 32),
                                      })
                                    }
                                    disabled={!isApprovedSeller || saving}
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
                                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-cyan-400 transition-colors"
                                      placeholder="0"
                                      value={sv.stock === 0 ? "" : sv.stock}
                                      onChange={(e) =>
                                        updateSizeVariant(sv.id, {
                                          stock: Math.max(
                                            0,
                                            parseInt(e.target.value) || 0
                                          ),
                                        })
                                      }
                                      disabled={!isApprovedSeller || saving}
                                    />
                                  </div>

                                  <div>
                                    <label className="block text-xs text-slate-400 mb-1">
                                      Price ± ETB
                                    </label>
                                    <input
                                      type="number"
                                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-cyan-400 transition-colors"
                                      placeholder="0.00"
                                      value={
                                        sv.priceAdjustCents === 0
                                          ? ""
                                          : sv.priceAdjustCents / 100
                                      }
                                      onChange={(e) =>
                                        updateSizeVariant(sv.id, {
                                          priceAdjustCents: Math.round(
                                            (parseFloat(e.target.value) || 0) *
                                              100
                                          ),
                                        })
                                      }
                                      disabled={!isApprovedSeller || saving}
                                    />
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>

                          {/* Desktop table */}
                          {sizeVariants.length > 0 && (
                            <div className="hidden md:block rounded-xl border border-slate-700 overflow-hidden">
                              <div className="grid grid-cols-12 gap-0 bg-slate-800/60 border-b border-slate-700 px-4 py-2.5 text-xs font-medium text-slate-400">
                                <div className="col-span-3">Label</div>
                                <div className="col-span-4">Stock Qty</div>
                                <div className="col-span-4">Price Adjust (ETB)</div>
                                <div className="col-span-1" />
                              </div>

                              {sizeVariants.map((sv, idx) => (
                                <div
                                  key={sv.id}
                                  className={classNames(
                                    "grid grid-cols-12 gap-0 items-center px-4 py-2.5 text-sm border-b border-slate-700/50 last:border-0",
                                    idx % 2 === 0
                                      ? "bg-slate-800/10"
                                      : "bg-slate-800/30"
                                  )}
                                >
                                  <div className="col-span-3 pr-3">
                                    <input
                                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-white text-sm outline-none focus:border-cyan-400 transition-colors"
                                      placeholder="e.g. M"
                                      value={sv.label}
                                      onChange={(e) =>
                                        updateSizeVariant(sv.id, {
                                          label: e.target.value.slice(0, 32),
                                        })
                                      }
                                      disabled={!isApprovedSeller || saving}
                                    />
                                  </div>
                                  <div className="col-span-4 pr-3">
                                    <input
                                      type="number"
                                      min="0"
                                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-white text-sm outline-none focus:border-cyan-400 transition-colors"
                                      placeholder="0"
                                      value={sv.stock === 0 ? "" : sv.stock}
                                      onChange={(e) =>
                                        updateSizeVariant(sv.id, {
                                          stock: Math.max(
                                            0,
                                            parseInt(e.target.value) || 0
                                          ),
                                        })
                                      }
                                      disabled={!isApprovedSeller || saving}
                                    />
                                  </div>
                                  <div className="col-span-4 pr-3">
                                    <div className="relative">
                                      <span className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-500 text-xs">
                                        ±
                                      </span>
                                      <input
                                        type="number"
                                        className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-5 pr-2 py-1.5 text-white text-sm outline-none focus:border-cyan-400 transition-colors"
                                        placeholder="0.00"
                                        value={
                                          sv.priceAdjustCents === 0
                                            ? ""
                                            : sv.priceAdjustCents / 100
                                        }
                                        onChange={(e) =>
                                          updateSizeVariant(sv.id, {
                                            priceAdjustCents: Math.round(
                                              (parseFloat(e.target.value) || 0) *
                                                100
                                            ),
                                          })
                                        }
                                        disabled={!isApprovedSeller || saving}
                                      />
                                    </div>
                                  </div>
                                  <div className="col-span-1 flex justify-center">
                                    <button
                                      type="button"
                                      onClick={() => removeSizeVariant(sv.id)}
                                      disabled={!isApprovedSeller || saving}
                                      className="w-7 h-7 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10 flex items-center justify-center transition-all"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </div>
                              ))}

                              <div className="grid grid-cols-12 gap-0 px-4 py-3 bg-slate-800/40 text-xs">
                                <div className="col-span-3 text-slate-500 font-medium">
                                  Total
                                </div>
                                <div className="col-span-4 font-bold text-white">
                                  {sizeVariants.reduce((s, v) => s + (v.stock || 0), 0)}{" "}
                                  units
                                </div>
                                <div className="col-span-5 text-slate-500">
                                  {sizeVariants.filter(
                                    (s) => s.priceAdjustCents !== 0
                                  ).length > 0
                                    ? `${sizeVariants.filter(
                                        (s) => s.priceAdjustCents !== 0
                                      ).length} rows with price adjustments`
                                    : "No price adjustments"}
                                </div>
                              </div>
                            </div>
                          )}

                          {sizeVariants.length === 0 && (
                            <div className="rounded-xl border border-dashed border-slate-700 py-8 text-center">
                              <Ruler className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                              <p className="text-sm text-slate-500">
                                No options added yet. Use presets above or add a
                                custom option.
                              </p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="border-t border-slate-700/50 bg-slate-950/30 px-4 sm:px-6 lg:px-8 py-4 sm:py-5 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <Box className="w-4 h-4 shrink-0" />
                <span>Saves as draft · Admin reviews before publishing</span>
              </div>
              <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center gap-3">
                <button
                  type="button"
                  onClick={() => safeNavigate("/seller")}
                  className="px-6 py-2.5 text-sm font-medium text-slate-400 hover:text-white hover:bg-slate-800/50 rounded-xl transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!isApprovedSeller || saving || anyUploading}
                  className="group w-full sm:w-auto px-8 py-2.5 bg-gradient-to-r from-lime-400 via-emerald-400 to-cyan-400 hover:from-lime-300 hover:via-emerald-300 hover:to-cyan-300 disabled:from-slate-700 disabled:to-slate-700 disabled:cursor-not-allowed text-slate-900 text-sm font-bold rounded-xl shadow-lg shadow-lime-500/25 transition-all hover:shadow-xl hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center gap-2"
                >
                  {saving ? (
                    <>
                      <div className="w-4 h-4 border-2 border-slate-900 border-t-transparent rounded-full animate-spin" />
                      Creating...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      Create Product
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </form>
      </div>
    </main>
  );
}

// ─── ColorVariantCard ─────────────────────────────────────────────────────────

type ColorVariantCardProps = {
  variant: ColorVariant;
  expanded: boolean;
  onToggleExpand: () => void;
  disabled: boolean;
  mainUploading: boolean;
  extraUploading: boolean;
  onUpdate: (patch: Partial<ColorVariant>) => void;
  onRemove: () => void;
  onMainImageChange: (e: ChangeEvent<HTMLInputElement>) => void;
  onExtraImagesChange: (e: ChangeEvent<HTMLInputElement>) => void;
  onRemoveExtraImage: (url: string) => void;
};

function ColorVariantCard({
  variant,
  expanded,
  onToggleExpand,
  disabled,
  mainUploading,
  extraUploading,
  onUpdate,
  onRemove,
  onMainImageChange,
  onExtraImagesChange,
  onRemoveExtraImage,
}: ColorVariantCardProps) {
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

        <span className={classNames(
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
          onClick={onToggleExpand}
          className="w-7 h-7 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 flex items-center justify-center transition-all"
        >
          <ChevronDown
            className={classNames(
              "w-4 h-4 transition-transform",
              expanded && "rotate-180"
            )}
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
              <div className="text-xs font-medium text-slate-400 mb-2 flex items-center gap-2">
                <span>Main image for{" "}
                <span className="text-orange-300">
                  {variant.name || "this color"}
                </span></span>
                {!hasMainImage && (
                  <span className="text-amber-400 text-[10px] bg-amber-500/10 px-1.5 py-0.5 rounded">
                    Required
                  </span>
                )}
              </div>
              <label
                className={classNames(
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
                      {mainUploading ? "Uploading..." : "Upload Required"}
                    </span>
                  </div>
                )}
                <input
                  type="file"
                  accept="image/*"
                  onChange={onMainImageChange}
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
                className={classNames(
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
                  {extraUploading ? "Uploading..." : "Add gallery photos"}
                </span>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={onExtraImagesChange}
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
                        onClick={() => onRemoveExtraImage(url)}
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