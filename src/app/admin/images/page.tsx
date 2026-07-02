import { getImageCacheStatsAction } from "@/app/actions/image-cache";
import { AdminImageCacheManager } from "@/components/admin/images/AdminImageCacheManager";

// The cache lives on disk and changes as players upload/clean images, so never
// serve a stale snapshot.
export const dynamic = "force-dynamic";

export default async function AdminImagesPage() {
  const stats = await getImageCacheStatsAction();

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto">
      <AdminImageCacheManager initialStats={stats} />
    </div>
  );
}
