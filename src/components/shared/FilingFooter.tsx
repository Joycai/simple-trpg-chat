interface FilingFooterProps {
  /** ICP filing number (China). Empty hides the ICP line. */
  icp?: string;
  /** ICP filing link; falls back to the MIIT portal. */
  icpUrl?: string;
  /** Public security (公安) filing icon, base64 data URL. */
  policeIcon?: string;
  /** Public security filing HTML snippet pasted by the admin. */
  policeHtml?: string;
}

/**
 * Site filing footer line: ICP number + public security (公安) filing.
 * Shared by the login page, lobby and admin panel. Renders nothing when
 * no filing info is configured.
 *
 * `policeHtml` is admin-only input rendered as raw HTML (the official
 * 公安备案 code contains its own link + number); script tags are stripped
 * as defence in depth.
 */
export function FilingFooter({ icp, icpUrl, policeIcon, policeHtml }: FilingFooterProps) {
  const police = (policeHtml ?? "").replace(/<script[\s\S]*?(?:<\/script>|$)/gi, "").trim();
  if (!icp && !police && !policeIcon) return null;

  return (
    <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[10px] text-text-dim/50">
      {icp && (
        <a
          href={icpUrl || "https://beian.miit.gov.cn/"}
          target="_blank"
          rel="noopener noreferrer"
          className="hover:underline"
        >
          {icp}
        </a>
      )}
      {(policeIcon || police) && (
        <span className="inline-flex items-center gap-1 [&_a]:inline-flex [&_a]:items-center [&_a]:gap-1 [&_a:hover]:underline [&_p]:inline [&_p]:m-0 [&_img]:inline-block [&_img]:h-3.5 [&_img]:w-auto">
          {policeIcon && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={policeIcon} alt="公安备案" className="h-3.5 w-auto" />
          )}
          {police && <span dangerouslySetInnerHTML={{ __html: police }} />}
        </span>
      )}
    </div>
  );
}
