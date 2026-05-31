import { signIn } from "@/auth";

export default function LoginPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen">
      <form
        action={async (formData) => {
          "use server";
          await signIn("credentials", formData);
        }}
        className="p-8 bg-gray-100 rounded-lg shadow-md flex flex-col gap-4"
      >
        <h1 className="text-2xl font-bold mb-4">Simple TRPG Chat Login</h1>
        <input name="username" type="text" placeholder="Username" required className="p-2 border rounded" />
        <input name="password" type="password" placeholder="Password" required className="p-2 border rounded" />
        <button type="submit" className="bg-blue-500 text-white p-2 rounded hover:bg-blue-600 transition">
          Login
        </button>
      </form>
    </div>
  );
}
