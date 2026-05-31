import { db } from "@/db";
import { users } from "@/db/schema";
import { getTranslations } from "next-intl/server";
import { createUser, deleteUser } from "./actions";

export default async function AdminPage() {
  const t = await getTranslations("admin");
  const allUsers = await db.select().from(users);

  return (
    <div className="flex flex-col gap-8 max-w-4xl mx-auto">
      <section className="bg-surface p-6 rounded-lg shadow-sm border border-border">
        <h3 className="text-lg font-bold mb-4 border-b border-border pb-2">{t("createUser")}</h3>
        <form action={createUser} className="grid grid-cols-2 gap-4">
          <input name="username" placeholder={t("username")} required className="p-2 border border-border rounded bg-surface" />
          <input name="password" type="password" placeholder={t("password")} required className="p-2 border border-border rounded bg-surface" />
          <input name="displayName" placeholder={t("displayName")} required className="p-2 border border-border rounded bg-surface" />
          <select name="role" required className="p-2 border border-border rounded bg-surface">
            <option value="player">{t("rolePlayer")}</option>
            <option value="host">{t("roleHost")}</option>
            <option value="admin">{t("roleAdmin")}</option>
          </select>
          <button type="submit" className="col-span-2 bg-primary text-white p-2 rounded hover:bg-primary-hover transition font-bold">
            {t("submit")}
          </button>
        </form>
      </section>

      <section className="bg-surface p-6 rounded-lg shadow-sm border border-border">
        <h3 className="text-lg font-bold mb-4 border-b border-border pb-2">{t("userList")}</h3>
        <table className="w-full text-left">
          <thead>
            <tr className="text-text-muted text-sm border-b border-border">
              <th className="pb-2">{t("username")}</th>
              <th className="pb-2">{t("displayName")}</th>
              <th className="pb-2">{t("role")}</th>
              <th className="pb-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {allUsers.length === 0 ? (
              <tr><td colSpan={4} className="py-8 text-center text-text-muted">{t("noUsers")}</td></tr>
            ) : (
              allUsers.map((user) => (
                <tr key={user.id} className="border-b border-border last:border-0 hover:bg-surface transition">
                  <td className="py-3 font-mono text-sm">{user.username}</td>
                  <td className="py-3">{user.displayName}</td>
                  <td className="py-3">
                    <span className={`px-2 py-1 rounded text-xs font-bold uppercase ${
                      user.role === 'admin' ? 'bg-danger/20 text-danger' :
                      user.role === 'host' ? 'bg-success/20 text-success' :
                      'bg-primary/20 text-primary'
                    }`}>
                      {user.role}
                    </span>
                  </td>
                  <td className="py-3 text-right">
                    <form action={deleteUser.bind(null, user.id)} className="inline">
                      <button className="text-danger text-sm hover:underline" disabled={user.username === 'admin'}>
                        {t("delete")}
                      </button>
                    </form>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
