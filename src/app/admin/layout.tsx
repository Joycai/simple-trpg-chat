import { auth } from "@/auth";
import { redirect } from "next/navigation";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();

  if (!session || (session.user as any).role !== "admin") {
    redirect("/");
  }

  return (
    <div className="flex flex-col min-h-screen">
      <header className="bg-header-bg text-white p-4 flex justify-between items-center">
        <h2 className="text-xl font-bold text-primary">Admin Control Panel</h2>
        <nav className="flex gap-4">
          <a href="/admin" className="hover:underline">User Management</a>
          <a href="/" className="hover:underline text-text-muted italic">Back to App</a>
        </nav>
      </header>
      <main className="flex-grow p-8 bg-surface">{children}</main>
    </div>
  );
}
