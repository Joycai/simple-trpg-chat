import { db } from "@/db";
import { users } from "@/db/schema";
import { createUser, deleteUser } from "./actions";

export default async function AdminPage() {
  const allUsers = await db.select().from(users);

  return (
    <div className="flex flex-col gap-8 max-w-4xl mx-auto">
      <section className="bg-white p-6 rounded-lg shadow-sm border">
        <h3 className="text-lg font-bold mb-4 border-b pb-2">Create New Account</h3>
        <form action={createUser} className="grid grid-cols-2 gap-4">
          <input name="username" placeholder="Username" required className="p-2 border rounded" />
          <input name="password" type="password" placeholder="Password" required className="p-2 border rounded" />
          <input name="displayName" placeholder="Display Name" required className="p-2 border rounded" />
          <select name="role" required className="p-2 border rounded bg-white">
            <option value="player">Player</option>
            <option value="host">Host</option>
            <option value="admin">Admin</option>
          </select>
          <button type="submit" className="col-span-2 bg-blue-600 text-white p-2 rounded hover:bg-blue-700 transition font-bold">
            Create User
          </button>
        </form>
      </section>

      <section className="bg-white p-6 rounded-lg shadow-sm border">
        <h3 className="text-lg font-bold mb-4 border-b pb-2">Account List</h3>
        <table className="w-full text-left">
          <thead>
            <tr className="text-gray-500 text-sm border-b">
              <th className="pb-2">Username</th>
              <th className="pb-2">Display Name</th>
              <th className="pb-2">Role</th>
              <th className="pb-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {allUsers.map((user) => (
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
                      Delete
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
