import { getRequestConfig } from "next-intl/server";

export default getRequestConfig(async () => {
  // For MVP: use Chinese as default. Language can be switched via
  // cookie/header without URL prefix routing overhead.
  let locale = "zh";

  // In the future, detect from cookie or Accept-Language header:
  // const cookieLocale = (await cookies()).get("NEXT_LOCALE")?.value;
  // if (cookieLocale) locale = cookieLocale;

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
