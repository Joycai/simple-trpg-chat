import { db } from "@/db";
import { users } from "@/db/schema";
import { getTranslations } from "next-intl/server";
import { AdminUserManager } from "@/components/AdminUserManager";

export default async function AdminUsersPage() {
  const t = await getTranslations("admin");
  const allUsers = await db.select().from(users);

  return (
    <div className="p-6 flex flex-col gap-6 max-w-5xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-purple-100">{t("userManagement")}</h1>
          <p className="text-sm text-purple-400/60 mt-1">{t("userManagementDesc")}</p>
        </div>
      </div>
      <AdminUserManager users={allUsers as any[]} />
    </div>
  );
}
