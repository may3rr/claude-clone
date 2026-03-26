export default function ChatHeader({ title }: { title?: string }) {
  if (!title) return null;
  return (
    <header className="py-3 px-4 border-b border-border-300/10 bg-bg-100/80 backdrop-blur-sm sticky top-0 z-10">
      <h1 className="text-sm font-medium text-text-100 truncate">{title}</h1>
    </header>
  );
}
