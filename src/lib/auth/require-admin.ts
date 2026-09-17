import { auth } from "@/auth";

/**
 * Throw unless the current session is an admin. A plain server module on
 * purpose: exported from a "use server" file it would itself become a
 * client-callable action.
 */
export async function requireAdmin() {
  const session = await auth();
  if (!session || session.user.role !== "admin") {
    throw new Error("Unauthorized: Admin access required");
  }
}
