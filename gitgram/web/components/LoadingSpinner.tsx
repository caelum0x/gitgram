export default function LoadingSpinner({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const sizes = {
    sm: 'w-4 h-4',
    md: 'w-8 h-8',
    lg: 'w-12 h-12',
  };

  return (
    <div className="flex justify-center items-center p-4">
      <div className={`${sizes[size]} border-2 border-blue-500 border-t-transparent rounded-full animate-spin`} />
    </div>
  );
}

export function FullPageLoader() {
  return (
    <div className="flex justify-center items-center min-h-screen">
      <LoadingSpinner size="lg" />
    </div>
  );
}
