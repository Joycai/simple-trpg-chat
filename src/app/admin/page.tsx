import { db } from "@/db";
import { users } from "@/db/schema";
import { getTranslations } from "next-intl/server";
import { createUser, deleteUser } from "./actions";

export default async function AdminPage() {
  const t = await getTranslations("admin");
  const allUsers = await db.select().from(users);

  return (
    <div className="flex flex-col gap-8 max-w-4xl mx-auto">
      <section className="bg-white p-6 rounded-lg shadow-sm border">
        <h3 className="text-lg font-bold mb-4 border-b pb-2">{t("createUser")}</h3>
        <form action={createUser} className="grid grid-cols-2 gap-4">
          <input name="username" placeholder={t("username")} required className="p-2 border rounded" />
          <input name="password" type="password" placeholder={t("password")} required className="p-2 border rounded" />
          <input name="displayName" placeholder={t("displayName")} required className="p-2 border rounded" />
          <select name="role" required className="p-2 border rounded bg-white">
            <option value="player">{t("rolePlayer")}</option>
            <option value="host">{t("roleHost")}</option>
            <option value="admin">{t("roleAdmin")}</option>
          </select>
          <button type="submit" className="col-span-2 bg-blue-600 text-white p-2 rounded hover:bg-blue-700 transition font-bold">
            {t("submit")}
          </button>
        </form>
      </section>

      <section className="bg-white p-6 rounded-lg shadow-sm border">
        <h3 className="text-lg font-bold mb-4 border-b pb-2">{t("userList")}</h3>
        <table className="w-full text-left">
          <thead>
            <tr className="text-gray-500 text-sm border-b">
              <th className="pb-2">{t("username")}</th>
              <th className="pb-2">{t("displayName")}</th>
              <th className="pb-2">{t("role")}</th>
              <th className="pb-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {allUsers.length === 0 ? (
              <tr><td colSpan={4} className="py-8 text-center text-gray-400">{t("noUsers")}</td></tr>
            ) : (
              allUsers.map((user) => (
                <tr key={user.id} className="border-b last:border-0 hover:bg-gray-50 transition">
                  <td className="py-3 font-mono text-sm">{user.username}</td>
                  <td className="py-3">{user.displayName}</td>
                  <td className="py-3">
                    <span className={`px-2 py-1 rounded text-xs font-bold uppercase ${
                      user.role === 'admin' ? 'bg-red-100 text-red-700' :
                      user.role === 'host' ? 'bg-green-100 text-green-700' :
                      'bg-blue-100 text-blue-700'
                    }`}>
                      {user.role}
                    </span>
                  </td>
                  <td className="py-3 text-right">
                    <form action={deleteUser.bind(null, user.id)} className="inline">
                      <button className="text-red-500 text-sm hover:underline" disabled={user.username === 'admin'}>
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
