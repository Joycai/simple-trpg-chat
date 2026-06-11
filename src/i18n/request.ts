import { getRequestConfig } from "next-intl/server";
import { cookies } from "next/headers";

export default getRequestConfig(async () => {
  let locale = "zh";

  try {
    const cookieStore = await cookies();
    const cookieLocale = cookieStore.get("NEXT_LOCALE")?.value;
    if (cookieLocale === "zh" || cookieLocale === "en") {
      locale = cookieLocale;
    }
  } catch {
    // cookies() might not be available during static generation phases
  }

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});

