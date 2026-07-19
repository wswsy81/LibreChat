export default function LifeLoading({ fullScreen = false }: { fullScreen?: boolean }) {
  return (
    <main
      className={`flex items-center justify-center bg-surface-primary ${fullScreen ? 'min-h-screen' : 'h-full min-h-96'}`}
      aria-busy="true"
    >
      <span
        aria-hidden="true"
        className="h-5 w-5 animate-spin rounded-full border-2 border-life-cinnabar/25 border-t-life-cinnabar"
      />
    </main>
  );
}
