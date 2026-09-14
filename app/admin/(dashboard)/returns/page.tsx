import AdminOrderList from "../orders/admin-order-list";

export const dynamic = "force-dynamic";

export default function Page(props: {
  searchParams: Promise<{ status?: string; payment?: string; refund?: string; return?: string; q?: string; page?: string }>;
}) {
  return <AdminOrderList searchParams={props.searchParams} returnsOnly />;
}
