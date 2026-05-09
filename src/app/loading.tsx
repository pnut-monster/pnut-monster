export default function RootLoading() {
  return (
    <div className="min-h-screen bg-brand-cream flex flex-col items-center justify-center">
      <div className="animate-pulse flex flex-col items-center gap-4">
        {/* Brand text logo */}
        <h1 className="font-[family-name:var(--font-heading)] text-4xl font-bold text-brand-black tracking-tight">
          PNUT{" "}
          <span className="text-brand-yellow">MONSTER</span>
        </h1>

        {/* Tagline */}
        <p className="font-[family-name:var(--font-body)] text-sm text-brand-gray-400">
          Healthy never tasted this fun!
        </p>
      </div>

      {/* Spinner dots */}
      <div className="mt-8 flex gap-2">
        <span className="h-2.5 w-2.5 rounded-full bg-brand-yellow animate-bounce [animation-delay:0ms]" />
        <span className="h-2.5 w-2.5 rounded-full bg-brand-yellow animate-bounce [animation-delay:150ms]" />
        <span className="h-2.5 w-2.5 rounded-full bg-brand-yellow animate-bounce [animation-delay:300ms]" />
      </div>
    </div>
  );
}
