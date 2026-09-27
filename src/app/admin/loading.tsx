import { AdminSkeleton } from "./AdminSkeleton";

/** Replaces only the admin layout's `{children}`: the sidebar and filing footer stay put. */
export default function AdminLoading() {
  return <AdminSkeleton />;
}
