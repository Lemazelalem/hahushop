import type { SupabaseClient, User } from "@supabase/supabase-js";

export type AppRole = "admin" | "seller" | "customer" | null;
export type SellerStatus = "pending" | "approved" | "rejected" | null;

type MaybeError = {
  code?: string;
  message?: string;
};

type ExistingProfileRow = {
  role: unknown;
  seller_status: string | null;
};

export type ProfileAccessState = {
  role: AppRole;
  sellerStatus: SellerStatus;
  isApprovedSeller: boolean;
};

function trimString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function noRowError(error: MaybeError | null | undefined) {
  return error?.code === "PGRST116";
}

function duplicateError(error: MaybeError | null | undefined) {
  const message = error?.message?.toLowerCase() ?? "";
  return error?.code === "23505" || message.includes("duplicate");
}

function normalizeSellerStatus(value: unknown): SellerStatus {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (
    normalized === "pending" ||
    normalized === "approved" ||
    normalized === "rejected"
  ) {
    return normalized;
  }
  return null;
}

function sellerBusinessName(user: User) {
  return (
    trimString(user.user_metadata?.business_name) ??
    trimString(user.user_metadata?.display_name) ??
    trimString(user.user_metadata?.full_name) ??
    trimString(user.email) ??
    "Seller"
  );
}

export function normalizeAppRole(value: unknown): AppRole {
  if (typeof value !== "string") return null;

  const normalized = value.trim().toLowerCase();
  if (
    normalized === "admin" ||
    normalized === "seller" ||
    normalized === "customer"
  ) {
    return normalized;
  }

  return null;
}

export function getRoleHintFromUser(user: User): AppRole {
  return normalizeAppRole(user.user_metadata?.role);
}

export async function getProfileRoleWithTimeout(
  supabase: SupabaseClient,
  userId: string,
  timeoutMs = 4000
): Promise<AppRole> {
  const accessState = await getProfileAccessStateWithTimeout(
    supabase,
    userId,
    timeoutMs
  );
  return accessState.role;
}

export async function getProfileAccessStateWithTimeout(
  supabase: SupabaseClient,
  userId: string,
  timeoutMs = 4000
): Promise<ProfileAccessState> {
  const statePromise = (async () => {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("role, seller_status")
        .eq("id", userId)
        .maybeSingle();

      if (error && !noRowError(error)) {
        console.error("[auth] profile lookup failed:", error);
      }

      const role = normalizeAppRole(data?.role);
      const sellerStatus = normalizeSellerStatus(data?.seller_status);

      return {
        role,
        sellerStatus,
        isApprovedSeller: role === "seller" || sellerStatus === "approved",
      };
    } catch (error: unknown) {
      console.error("[auth] profile lookup crashed:", error);
      return {
        role: null,
        sellerStatus: null,
        isApprovedSeller: false,
      };
    }
  })();

  const timeoutPromise = new Promise<ProfileAccessState>((resolve) => {
    globalThis.setTimeout(
      () =>
        resolve({
          role: null,
          sellerStatus: null,
          isApprovedSeller: false,
        }),
      timeoutMs
    );
  });

  return Promise.race([statePromise, timeoutPromise]);
}

export async function syncProfileFromAuthUser(
  supabase: SupabaseClient,
  user: User,
  fallbackRole?: AppRole
): Promise<AppRole> {
  const role = fallbackRole ?? getRoleHintFromUser(user);
  const isSeller = role === "seller" || getRoleHintFromUser(user) === "seller";
  const displayName =
    trimString(user.user_metadata?.display_name) ??
    trimString(user.user_metadata?.full_name);

  let existingRole: AppRole = null;
  let existingSellerStatus: string | null = null;

  if (isSeller) {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("role, seller_status")
        .eq("id", user.id)
        .maybeSingle();

      if (error && !noRowError(error)) {
        console.error("[auth] existing seller profile lookup failed:", error);
      }

      const existingProfile = (data ?? null) as ExistingProfileRow | null;
      existingRole = normalizeAppRole(existingProfile?.role);
      existingSellerStatus = normalizeSellerStatus(existingProfile?.seller_status);
    } catch (error: unknown) {
      console.error("[auth] existing seller profile lookup crashed:", error);
    }
  }

  const payload: Record<string, unknown> = {
    id: user.id,
    updated_at: new Date().toISOString(),
  };

  if (displayName) {
    payload.display_name = displayName;
  }

  // For sellers: DON'T set role — admin approval is required.
  // Only set role for non-seller roles (customer, admin, etc.)
  if (role && role !== "seller") {
    payload.role = role;
  }

  // For seller applicants: set seller_status and business_name
  // but never downgrade an already approved/rejected seller profile.
  if (isSeller) {
    payload.business_name = sellerBusinessName(user);

    const shouldPreserveApproval =
      existingRole === "seller" ||
      existingSellerStatus === "approved" ||
      existingSellerStatus === "rejected";

    if (!shouldPreserveApproval) {
      payload.seller_status = "pending";
      payload.is_verified_seller = false;
    }
  }

  if (Object.keys(payload).length > 2) {
    const { error: profileError } = await supabase
      .from("profiles")
      .upsert(payload, { onConflict: "id" });

    if (profileError) {
      throw profileError;
    }
  }

  if (isSeller) {
    const shouldPreserveApproval =
      existingRole === "seller" ||
      existingSellerStatus === "approved" ||
      existingSellerStatus === "rejected";

    if (!shouldPreserveApproval) {
      const { data: existingApplications, error: existingApplicationError } =
        await supabase
          .from("seller_applications")
          .select("id")
          .eq("user_id", user.id)
          .limit(1);

      if (existingApplicationError) {
        throw existingApplicationError;
      }

      if (!existingApplications || existingApplications.length === 0) {
        const { error: sellerAppError } = await supabase
          .from("seller_applications")
          .insert({
            user_id: user.id,
            business_name: sellerBusinessName(user),
            status: "pending",
            applied_at: new Date().toISOString(),
          });

        if (sellerAppError && !duplicateError(sellerAppError)) {
          throw sellerAppError;
        }
      }
    }
  }

  return role;
}
