import BookReader from "@/components/BookReader";

export default async function BookPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <BookReader bookId={id} />;
}
