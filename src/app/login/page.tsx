"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";

export default function LoginPage() {
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");

    const formData = new FormData(e.currentTarget);
    const username = formData.get("username") as string;
    const password = formData.get("password") as string;

    if (!username || !password) {
      setError("请输入用户名和密码");
      return;
    }

    startTransition(async () => {
      try {
        const result = await signIn("credentials", {
          username,
          password,
          redirect: false,
        });

        if (result?.error) {
          // In NextAuth v5, result.error might be the error type
          if (result.error === "CredentialsSignin") {
            setError("用户名或密码错误，请检查后重试");
          } else {
            setError(`登录失败: ${result.error}`);
          }
        } else {
          router.push("/");
          router.refresh();
        }
      } catch (err: any) {
        setError("系统错误，请稍后重试");
      }
    });
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50">
      <form
        onSubmit={handleSubmit}
        className="p-8 bg-white rounded-xl shadow-lg flex flex-col gap-4 w-full max-w-sm border"
      >
        <div className="text-center mb-2">
          <h1 className="text-2xl font-bold text-gray-800">🎲 Simple TRPG Chat</h1>
          <p className="text-sm text-gray-400 mt-1">登录以继续</p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded text-sm text-center animate-pulse">
            ⚠️ {error}
          </div>
        )}

        <div className="flex flex-col gap-1">
          <label htmlFor="username" className="text-xs text-gray-500 font-medium">
            用户名
          </label>
          <input
            id="username"
            name="username"
            type="text"
            placeholder="输入用户名"
            required
            autoComplete="username"
            className="p-2.5 border rounded-lg outline-none focus:ring-2 focus:ring-blue-300 transition text-sm"
            autoFocus
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="password" className="text-xs text-gray-500 font-medium">
            密码
          </label>
          <input
            id="password"
            name="password"
            type="password"
            placeholder="输入密码"
            required
            autoComplete="current-password"
            className="p-2.5 border rounded-lg outline-none focus:ring-2 focus:ring-blue-300 transition text-sm"
          />
        </div>

        <button
          type="submit"
          disabled={isPending}
          className="bg-blue-500 hover:bg-blue-600 disabled:bg-blue-300 text-white p-2.5 rounded-lg font-bold transition text-sm mt-2 flex items-center justify-center gap-2"
        >
          {isPending ? (
            <>
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
              登录中...
            </>
          ) : (
            "登录"
          )}
        </button>

        <p className="text-[10px] text-gray-300 text-center mt-2">
          初始管理员：admin / admin123
        </p>
      </form>
    </div>
  );
}
